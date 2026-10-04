// @ts-check
/**
 * Machine-wide AI skill library manager — Host service.
 *
 * A single TypertRemoteService that the DeepSeek Harness Client panel talks to through
 * the `ctx.remote.skillManager` namespace. It discovers every SKILL.md across the AI
 * tools installed on this machine, merges same-name skills into one record with many
 * "installations", classifies them (with user overrides), and provides safe delete
 * (trash + restore), local/Git install, and export.
 *
 * Why direct `node:fs` instead of `ctx.fs`: the manager's whole job is to read, write,
 * and move skill directories across the machine (~/.claude, ~/.codex, ~/.gemini,
 * ~/.agents, the Claude plugin cache, the DSH install tree, and arbitrary user roots).
 * `ctx.fs` is a workspace-scoped sandbox with no delete/rename/copy, so it cannot express
 * the plan's delete-to-trash or install semantics. DSH's own `dsh-skill-filesystem`
 * provider likewise falls back to `node:fs` for trusted/absolute roots. This service
 * therefore owns its own filesystem access and guards every destructive path itself.
 *
 * Remote methods are registered with `applyRemoteMarkers` (see lib/remote-marker.js):
 * this bundle is hand-written ESM, so the framework's `@Remote` decorator is applied
 * programmatically rather than parsed from decorator syntax.
 */
import { appendFile } from 'node:fs/promises'
import { statSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { runNativeCommand, revealNativePath } from '@deepseek-ai/dsh-native-command'
import { parse as parseYaml } from './lib/yaml.js'
import { applyRemoteMarkers } from './lib/remote-marker.js'

//#region constants
const NAMESPACE = 'skillManager'
const SKILL_FILE = 'SKILL.md'
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const CACHE_TTL_DEFAULT_MS = 15_000
const GIT_TIMEOUT_DEFAULT_MS = 60_000
const MAX_SCAN_DEPTH = 2
const MAX_SKILL_FILE_BYTES = 1024 * 1024
const MAX_INSTALL_BYTES = 64 * 1024 * 1024
const TRASH_RETENTION = 200

/** Built-in, machine-agnostic category rules. Prefix rules win over keyword rules. */
const BUILTIN_CATEGORIES = [
  { id: 'lark', label: '飞书办公 / Lark', order: 10, prefixes: ['lark-'], keywords: ['lark', '飞书'] },
  { id: 'cloud', label: 'Cloudflare / 云平台', order: 20, prefixes: ['cloudflare', 'wrangler', 'durable-objects', 'turnstile-', 'workers-', 'sandbox-sdk', 'agents-sdk'], keywords: ['cloudflare', 'wrangler', 'worker', 'durable object'] },
  { id: 'video', label: '视频与动画 / Video & Motion', order: 30, prefixes: ['hyperframes', 'remotion', 'seedance', 'media-use', 'moneyprinterturbo-'], keywords: ['video', 'animation', 'remotion', 'motion', 'hyperframes'] },
  { id: 'office', label: 'Office 文档 / Office Docs', order: 40, prefixes: ['office-'], keywords: ['docx', 'pptx', 'xlsx', 'office', 'spreadsheet', 'presentation'] },
  { id: 'skill', label: '技能管理 / Skill Mgmt', order: 50, prefixes: ['skill-', 'find-skills'], keywords: ['skill', '技能'] },
  { id: 'frontend', label: '前端与设计 / Frontend & Design', order: 60, prefixes: ['frontend-design', 'web-perf'], keywords: ['frontend', 'design', 'ui', 'ux', 'web perf'] },
  { id: 'method', label: '开发方法论 / Engineering Method', order: 70, prefixes: ['test-driven-development', 'systematic-debugging', 'brainstorming', 'writing-plans'], keywords: ['debug', 'test', 'plan', 'brainstorm', 'refactor'] },
]
const UNCATEGORIZED = { id: 'uncategorized', label: '未分类 / Uncategorized', order: 999 }
/** Roots shipped with the harness — discovered but never editable. */
const READONLY_HINTS = ['resources/runtime/office-skills', 'resources/app.asar', '.claude/plugins']
//#endregion

//#region small helpers
function fail(code, message, details = {}) {
  throw new RemoteError(code, message, details)
}
function isAbsent(error) {
  const code = error?.code
  return code === 'ENOENT' || code === 'ENOTDIR' || code === 'FS_NOT_FOUND'
}
async function pathExists(p) {
  try { await stat(p); return true } catch (e) { if (isAbsent(e)) return false; throw e }
}
function normalizeId(name) {
  return String(name || '').trim().toLowerCase()
}
function parseFrontmatter(raw) {
  const firstBreak = raw.indexOf('\n')
  if (firstBreak < 0) return undefined
  if (raw.slice(0, firstBreak).replace(/\r$/, '') !== '---') return undefined
  const start = firstBreak + 1
  let lineStart = start
  while (lineStart <= raw.length) {
    const nl = raw.indexOf('\n', lineStart)
    const lineEnd = nl < 0 ? raw.length : nl
    if (raw.slice(lineStart, lineEnd).replace(/\r$/, '') === '---') {
      const bodyStart = nl < 0 ? raw.length : nl + 1
      const yamlText = raw.slice(start, lineStart)
      let data
      try { data = parseYaml(yamlText) } catch { return undefined }
      if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined
      return { data, body: raw.slice(bodyStart) }
    }
    if (nl < 0) return undefined
    lineStart = nl + 1
  }
  return undefined
}
function frontmatterString(data, key) {
  const v = data[key]
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined
}
function basenameSafe(p) {
  try { return basename(p) } catch { return 'unknown' }
}
function groupBy(items, key) {
  const map = new Map()
  for (const item of items) {
    const k = key(item)
    const arr = map.get(k) ?? []
    arr.push(item)
    map.set(k, arr)
  }
  return map
}
//#endregion

//#region store (catalog + settings + log persistence)
/** Durable JSON state under the harness home; all writes are atomic. */
class Store {
  constructor(home) {
    this.home = home
    this.catalogFile = join(home, 'catalog.json')
    this.logFile = join(home, 'operations.log')
    this.trashDir = join(home, 'trash')
  }
  async readJson(file, fallback) {
    try {
      const text = await readFile(file, 'utf8')
      const parsed = JSON.parse(text)
      return typeof parsed === 'object' && parsed !== null ? parsed : fallback
    } catch {
      return fallback
    }
  }
  async writeJson(file, value) {
    await mkdir(dirname(file), { recursive: true })
    await writeFileAtomic(file, JSON.stringify(value, null, 2), { mode: 0o600 })
  }
  async log(line) {
    try {
      await mkdir(dirname(this.logFile), { recursive: true })
      await appendFile(this.logFile, `${new Date().toISOString()} ${line}\n`, { mode: 0o600 })
    } catch { /* logging is best-effort */ }
  }
}
//#endregion

//#region scanner
/** Discovers SKILL.md bundles beneath a root, depth-limited, following the tool layout. */
async function discoverUnderRoot(root) {
  const out = []
  async function walk(dir, depth) {
    if (depth > MAX_SCAN_DEPTH) return
    let entries
    try { entries = await readdir(dir, { withFileTypes: true }) } catch (e) { if (isAbsent(e)) return; throw e }
    // A directory that directly contains SKILL.md is itself a skill; do not descend.
    if (entries.some((e) => e.isFile() && e.name === SKILL_FILE)) { out.push(dir); return }
    for (const e of entries) {
      if (!e.isDirectory()) continue
      if (e.name === 'node_modules' || e.name === '.git') continue
      await walk(join(dir, e.name), depth + 1)
    }
  }
  await walk(root, 0)
  return out
}
async function readSkillMeta(dir) {
  const file = join(dir, SKILL_FILE)
  let st
  try { st = await stat(file) } catch (e) { if (isAbsent(e)) return undefined; throw e }
  if (st.size > MAX_SKILL_FILE_BYTES) return undefined
  let raw
  try { raw = await readFile(file, 'utf8') } catch (e) { if (isAbsent(e)) return undefined; throw e }
  const fm = parseFrontmatter(raw)
  const name = fm ? frontmatterString(fm.data, 'name') : undefined
  const description = fm ? frontmatterString(fm.data, 'description') : undefined
  const version = fm ? frontmatterString(fm.data, 'version') : undefined
  const dirName = basenameSafe(dir)
  return {
    id: normalizeId(name ?? dirName),
    name: name ?? dirName,
    declared: Boolean(name),
    valid: Boolean(name && description && NAME_RE.test(name)),
    description: description ?? '',
    version,
    dir,
    mtime: st.mtimeMs,
    size: st.size,
  }
}
//#endregion

//#region categorizer
function classify(id, name, description, categories) {
  const hay = `${id} ${name} ${description}`.toLowerCase()
  for (const cat of categories) {
    for (const p of cat.prefixes ?? []) if (id.startsWith(p)) return cat.id
  }
  for (const cat of categories) {
    for (const k of cat.keywords ?? []) if (hay.includes(k.toLowerCase())) return cat.id
  }
  return UNCATEGORIZED.id
}
//#endregion

//#region git / install helpers
async function dirSize(dir, cap) {
  let total = 0
  async function walk(d) {
    if (total > cap) return
    let entries
    try { entries = await readdir(d, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const p = join(d, e.name)
      if (e.isDirectory()) await walk(p)
      else { try { total += (await stat(p)).size } catch { /* ignore */ } }
      if (total > cap) return
    }
  }
  await walk(dir)
  return total
}
async function runGit(args, cwd, signal) {
  const timeout = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(GIT_TIMEOUT_DEFAULT_MS)])
  try {
    const { stdout, stderr } = await runNativeCommand('git', args, timeout, 'hidden')
    return { stdout, stderr }
  } catch (e) {
    fail('skill-manager/git-failed', `git ${args[0]} failed: ${e.message}`, { stderr: e.stderr ?? '', code: e.code })
  }
}
//#endregion

//#region skill provider
/**
 * Exposes the whole discovered library to `ctx.skills` so any skill can be
 * loaded in a conversation through the `skill` tool.
 *
 * The registry merges providers by rank and drops a same-name candidate when a
 * higher-priority one already exists. `dsh-skill-filesystem` uses 100–600
 * (project → user → bundled), so this provider takes a high rank: skills that
 * DSH already provides keep their copy, and the registry only falls back to the
 * library for names no other provider claims (e.g. a Codex- or Gemini-only
 * skill). That adds coverage without ever shadowing the active tool's copy.
 */
const LIBRARY_SKILL_RANK = 900

class LibrarySkillProvider {
  constructor(service, control) {
    this.name = 'skill-manager-library'
    this.service = service
    this.control = control
    control.signal.addEventListener('abort', () => {}, { once: true })
  }

  async list(options) {
    options?.signal?.throwIfAborted()
    let data
    try {
      // The service cache keeps this cheap; the registry calls list() on every read.
      data = await this.service.scan(options?.signal)
    } catch (error) {
      if (options?.signal?.aborted === true) throw error
      return { candidates: [], complete: false }
    }
    const candidates = []
    for (const skill of data.skills) {
      if (!NAME_RE.test(skill.name)) continue
      if (skill.invalid) continue
      // Prefer an editable installation so the loaded skill has a real base dir.
      const installation = skill.installations.find((i) => i.editable) ?? skill.installations[0]
      if (!installation) continue
      candidates.push({
        name: skill.name,
        description: skill.description || `Skill ${skill.name}`,
        invocation: { modelInvocable: true, userInvocable: true },
        source: 'custom',
        provider: this.name,
        rank: LIBRARY_SKILL_RANK,
        locator: { path: installation.path, id: skill.id },
        resourceBase: { kind: 'directory', path: installation.path },
        metadata: { category: skill.category, tools: skill.tools, installCount: skill.installCount },
      })
    }
    return { candidates, complete: true }
  }

  async get(candidate, options) {
    options?.signal?.throwIfAborted()
    const locator = candidate.locator
    const dir = locator?.path
    if (!dir) return undefined
    const meta = await readSkillMeta(dir).catch(() => undefined)
    if (!meta || meta.name !== candidate.name) return undefined
    let body = ''
    try {
      const raw = await readFile(join(dir, SKILL_FILE), 'utf8')
      const fm = parseFrontmatter(raw)
      body = fm ? fm.body.trim() : raw.trim()
    } catch { return undefined }
    return {
      name: meta.name,
      description: meta.description || candidate.description,
      invocation: { modelInvocable: true, userInvocable: true },
      source: 'custom',
      provider: this.name,
      resourceBase: { kind: 'directory', path: dir },
      path: join(dir, SKILL_FILE),
      content: body,
    }
  }
}
//#endregion

//#region service
export class SkillManagerService extends TypertRemoteService {
  // The skill registry is the seam that makes discovered skills invocable in chat
  // (the `skill` tool). It is a hard dependency: without it the library would be
  // view-only. `typert` is required by the registry layer this registration joins.
  static inject = ['skills', 'typert']
  // Schemastery validates a default value against the field schema, so a path
  // that needs runtime evaluation cannot be a lazy function default here. The
  // home defaults to '' and is resolved to dshHomePath('skill-manager') in the
  // constructor; users override it with an absolute path in cordis.patch.yml.
  static Config = z.object({
    home: z.string().default(''),
    includePluginCache: z.boolean().default(false),
    extraRoots: z.array(z.string()).default([]),
    cacheTtlMs: z.number().min(0).default(CACHE_TTL_DEFAULT_MS),
    publishSkills: z.boolean().default(true),
    onlyModelInvocable: z.boolean().default(false),
  })

  constructor(ctx, config = {}) {
    super(ctx, NAMESPACE, { namespace: NAMESPACE })
    const cfg = SkillManagerService.Config(config)
    this.config = cfg
    this.store = new Store(cfg.home !== '' ? cfg.home : dshHomePath('skill-manager'))
    this.catalog = { categories: [], overrides: {}, aliases: {}, favorites: {}, roots: [] }
    this.cache = { at: 0, data: undefined }
    this.pendingScan = undefined
    this.loaded = false
    ctx.effect(() => async () => { this.loaded = false }, 'skill-manager: unload')
    // Publish every discovered skill into the registry so `ctx.skills` (and the
    // `skill` tool) can load them in a conversation.
    if (cfg.publishSkills) {
      ctx.effect(() => ctx.skills.registerProvider((control) => new LibrarySkillProvider(this, control)), 'skill-manager: skill provider')
    }
  }

  async ensureLoaded() {
    if (this.loaded) return
    const persisted = await this.store.readJson(this.store.catalogFile, undefined)
    if (persisted) this.catalog = {
      categories: Array.isArray(persisted.categories) ? persisted.categories : [],
      overrides: persisted.overrides ?? {},
      aliases: persisted.aliases ?? {},
      favorites: persisted.favorites ?? {},
      roots: Array.isArray(persisted.roots) ? persisted.roots : [],
    }
    this.loaded = true
  }
  async persist() {
    await this.store.writeJson(this.store.catalogFile, this.catalog)
  }

  effectiveCategories() {
    const byId = new Map(BUILTIN_CATEGORIES.map((c) => [c.id, { ...c, source: 'builtin' }]))
    for (const c of this.catalog.categories) if (c && c.id && c.label) byId.set(c.id, { ...c, source: 'user' })
    byId.set(UNCATEGORIZED.id, UNCATEGORIZED)
    return [...byId.values()].sort((a, b) => (a.order ?? 500) - (b.order ?? 500))
  }

  async resolveRoots() {
    const home = homedir()
    const defs = [
      { tool: 'DSH/Claude', path: join(home, '.claude', 'skills'), readOnly: false, scope: 'user' },
      { tool: 'Codex', path: join(home, '.codex', 'skills'), readOnly: false, scope: 'user' },
      { tool: 'Codex', path: join(home, '.codex', 'vendor_imports'), readOnly: false, scope: 'user' },
      { tool: 'Gemini', path: join(home, '.gemini', 'skills'), readOnly: false, scope: 'user' },
      { tool: 'AGENTS', path: join(home, '.agents', 'skills'), readOnly: false, scope: 'user' },
    ]
    const execDir = dirname(process.execPath)
    for (const g of [
      join(execDir, '..', 'resources', 'runtime', 'office-skills'),
      join(execDir, 'resources', 'runtime', 'office-skills'),
    ]) defs.push({ tool: 'DSH 内置', path: resolve(g), readOnly: true, scope: 'builtin' })
    if (this.config.includePluginCache) {
      defs.push({ tool: 'Claude 插件市场', path: join(home, '.claude', 'plugins'), readOnly: true, scope: 'cache' })
    }
    for (const extra of this.config.extraRoots) defs.push({ tool: '自定义', path: resolve(extra), readOnly: false, scope: 'user' })
    for (const r of this.catalog.roots) {
      if (r && r.path) defs.push({ tool: r.tool || '自定义', path: resolve(r.path), readOnly: r.readOnly === true, scope: 'user' })
    }
    const seen = new Set()
    const roots = []
    for (const d of defs) {
      const key = d.path.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      roots.push({ ...d, present: await pathExists(d.path) })
    }
    return { roots }
  }

  isReadOnlyRoot(root) {
    if (root.readOnly) return true
    const lower = root.path.toLowerCase()
    return READONLY_HINTS.some((hint) => lower.includes(hint))
  }

  /**
   * Full machine scan → merged, de-duplicated catalog. Cached for cacheTtlMs.
   * @param {AbortSignal} [signal]
   */
  async scan(signal) {
    await this.ensureLoaded()
    const now = Date.now()
    if (this.cache.data && now - this.cache.at < this.config.cacheTtlMs) return this.cache.data
    // Single-flight: several readers (the skill registry during system-prompt
    // assembly, the panel, the picker) can ask at once. Without this guard each
    // one starts its own full disk walk, which starves the host at boot.
    if (this.pendingScan !== undefined) return this.pendingScan
    this.pendingScan = this.runScan(signal).finally(() => { this.pendingScan = undefined })
    return this.pendingScan
  }

  async runScan(signal) {
    const now = Date.now()
    const { roots } = await this.resolveRoots()
    const categories = this.effectiveCategories()
    /** @type {Map<string, any>} */
    const byId = new Map()
    let totalInstallations = 0
    for (const root of roots) {
      if (!root.present) continue
      const readOnly = this.isReadOnlyRoot(root)
      let dirs
      try { dirs = await discoverUnderRoot(root.path) } catch { dirs = [] }
      for (const dir of dirs) {
        signal?.throwIfAborted()
        let meta
        try { meta = await readSkillMeta(dir) } catch { continue }
        if (!meta) continue
        totalInstallations++
        const installKey = `${root.tool}::${dir}`
        let rec = byId.get(meta.id)
        if (!rec) {
          rec = { id: meta.id, name: meta.name, description: meta.description, version: meta.version, installations: [], conflict: false }
          byId.set(meta.id, rec)
        }
        rec.installations.push({
          key: installKey, tool: root.tool, root: root.path, path: dir,
          scope: root.scope, editable: !readOnly, readOnly,
        })
        if (meta.description.length > (rec.description?.length ?? 0)) rec.description = meta.description
        if (!rec.version && meta.version) rec.version = meta.version
      }
    }
    const skills = []
    for (const rec of byId.values()) {
      const descriptions = new Set()
      for (const inst of rec.installations) {
        const m = await readSkillMeta(inst.path).catch(() => undefined)
        if (m && m.description) descriptions.add(m.description)
      }
      rec.conflict = descriptions.size > 1
      rec.invalid = rec.installations.length === 0
      const userCat = this.catalog.overrides[rec.id]
      rec.categorySource = userCat ? 'user' : 'auto'
      rec.category = userCat ?? classify(rec.id, rec.name, rec.description, categories)
      rec.alias = this.catalog.aliases[rec.id]
      rec.favorite = this.catalog.favorites[rec.id] === true
      rec.readOnly = rec.installations.every((i) => !i.editable)
      rec.tools = [...new Set(rec.installations.map((i) => i.tool))]
      rec.tags = rec.tools.map((t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
      rec.installCount = rec.installations.length
      rec.mtime = Math.max(0, ...rec.installations.map((i) => { try { return statSync(i.path).mtimeMs } catch { return 0 } }))
      skills.push(rec)
    }
    skills.sort((a, b) => a.name.localeCompare(b.name))
    const categoryCounts = {}
    for (const s of skills) categoryCounts[s.category] = (categoryCounts[s.category] ?? 0) + 1
    const toolSet = new Set(roots.filter((r) => r.present).map((r) => r.tool))
    const data = {
      generatedAt: now,
      skills,
      categories: categories.map((c) => ({ ...c, count: categoryCounts[c.id] ?? 0 })),
      stats: {
        tools: [...toolSet],
        toolCount: toolSet.size,
        uniqueSkills: skills.length,
        installations: totalInstallations,
        conflicts: skills.filter((s) => s.conflict).length,
      },
      roots: roots.map((r) => ({ ...r, readOnly: this.isReadOnlyRoot(r) })),
      home: this.store.home,
    }
    this.cache = { at: now, data }
    return data
  }

  async findSkill(id) {
    const data = await this.scan()
    return data.skills.find((s) => s.id === id)
  }

  //#region Remote methods
  async roots(signal) {
    signal?.throwIfAborted()
    const data = await this.scan(signal)
    return { roots: data.roots, home: data.home }
  }

  async remoteScan(signal) {
    this.cache.at = 0
    return await this.scan(signal)
  }

  async refresh(signal) {
    this.cache.at = 0
    return await this.scan(signal)
  }

  async updateCategory(request, signal) {
    signal?.throwIfAborted()
    await this.ensureLoaded()
    const { name, category } = request ?? {}
    const id = normalizeId(name)
    if (!id) fail('skill-manager/bad-request', 'name is required')
    if (category === null || category === '' || category === undefined) delete this.catalog.overrides[id]
    else this.catalog.overrides[id] = String(category)
    await this.persist()
    this.cache.at = 0
    await this.store.log(`category ${id} -> ${this.catalog.overrides[id] ?? '(auto)'}`)
    return { ok: true, overrides: this.catalog.overrides }
  }

  async createCategory(request, signal) {
    signal?.throwIfAborted()
    await this.ensureLoaded()
    const label = String(request?.label ?? '').trim()
    if (!label) fail('skill-manager/bad-request', 'label is required')
    const id = normalizeId(label)
    const existing = this.catalog.categories.find((c) => c.id === id)
    if (existing) existing.label = label
    else this.catalog.categories.push({ id, label, order: (this.catalog.categories.length + 1) * 10, prefixes: [], keywords: [] })
    await this.persist()
    this.cache.at = 0
    return { ok: true, categories: this.effectiveCategories() }
  }

  async renameCategory(request, signal) {
    signal?.throwIfAborted()
    await this.ensureLoaded()
    const from = normalizeId(request?.from)
    const toLabel = String(request?.to ?? '').trim()
    if (!from || !toLabel) fail('skill-manager/bad-request', 'from and to are required')
    const to = normalizeId(toLabel)
    const cat = this.catalog.categories.find((c) => c.id === from)
    if (cat) {
      if (to !== from) {
        cat.id = to; cat.label = toLabel
        for (const [k, v] of Object.entries(this.catalog.overrides)) if (v === from) this.catalog.overrides[k] = to
      } else cat.label = toLabel
    }
    await this.persist()
    this.cache.at = 0
    return { ok: true, categories: this.effectiveCategories() }
  }

  async deleteCategory(request, signal) {
    signal?.throwIfAborted()
    await this.ensureLoaded()
    const id = normalizeId(request?.name)
    this.catalog.categories = this.catalog.categories.filter((c) => c.id !== id)
    for (const [k, v] of Object.entries(this.catalog.overrides)) if (v === id) delete this.catalog.overrides[k]
    await this.persist()
    this.cache.at = 0
    return { ok: true, categories: this.effectiveCategories() }
  }

  async setAlias(request, signal) {
    signal?.throwIfAborted()
    await this.ensureLoaded()
    const id = normalizeId(request?.name)
    if (!id) fail('skill-manager/bad-request', 'name is required')
    const alias = request?.alias == null ? undefined : String(request.alias)
    if (alias) this.catalog.aliases[id] = alias
    else delete this.catalog.aliases[id]
    await this.persist()
    return { ok: true }
  }

  async setFavorite(request, signal) {
    signal?.throwIfAborted()
    await this.ensureLoaded()
    const id = normalizeId(request?.name)
    if (!id) fail('skill-manager/bad-request', 'name is required')
    if (request?.favorite) this.catalog.favorites[id] = true
    else delete this.catalog.favorites[id]
    await this.persist()
    return { ok: true }
  }

  async configure(request, signal) {
    signal?.throwIfAborted()
    await this.ensureLoaded()
    const op = request?.op
    if (op === 'addRoot') {
      if (!request?.path) fail('skill-manager/bad-request', 'path is required')
      const path = resolve(String(request.path))
      if (!this.catalog.roots.some((r) => r.path === path)) {
        this.catalog.roots.push({ path, tool: request?.tool || '自定义', readOnly: request?.readOnly === true })
      }
    } else if (op === 'removeRoot') {
      const path = resolve(String(request?.path ?? ''))
      this.catalog.roots = this.catalog.roots.filter((r) => r.path !== path)
    } else if (op === 'togglePluginCache') {
      this.config.includePluginCache = request?.enabled === true
    } else {
      fail('skill-manager/bad-request', `unknown op ${op}`)
    }
    await this.persist()
    this.cache.at = 0
    return await this.scan(signal)
  }

  async deleteSkill(request, signal) {
    signal?.throwIfAborted()
    await this.ensureLoaded()
    const id = normalizeId(request?.name)
    const skill = await this.findSkill(id)
    if (!skill) fail('skill-manager/not-found', `skill "${id}" not found`)
    let targets = skill.installations
    if (request?.installKey) {
      targets = skill.installations.filter((i) => i.key === request.installKey)
      if (targets.length === 0) fail('skill-manager/not-found', `installation not found for ${id}`)
    } else {
      targets = targets.filter((i) => i.editable)
      if (targets.length === 0) fail('skill-manager/read-only', 'every installation of this skill is read-only')
    }
    const moved = []
    for (const inst of targets) {
      if (!inst.editable) continue
      const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const trashPath = join(this.store.trashDir, `${id}__${stamp}`)
      try {
        await mkdir(dirname(trashPath), { recursive: true })
        await rename(inst.path, trashPath)
        moved.push({ installKey: inst.key, tool: inst.tool, from: inst.path, trashPath, at: Date.now() })
        await this.store.log(`delete ${id} from ${inst.path} -> ${trashPath}`)
      } catch (e) {
        fail('skill-manager/delete-failed', `failed to move ${inst.path} to trash: ${e.message}`)
      }
    }
    await this.writeTrashIndex(moved)
    this.cache.at = 0
    return { ok: true, moved, catalog: await this.scan(signal) }
  }

  async writeTrashIndex(moved) {
    if (moved.length === 0) return
    const indexFile = join(this.store.trashDir, 'index.json')
    const current = await this.store.readJson(indexFile, [])
    const all = [...current, ...moved]
    while (all.length > TRASH_RETENTION) all.shift()
    await this.store.writeJson(indexFile, all)
  }

  async trashList(signal) {
    signal?.throwIfAborted()
    const entries = await this.store.readJson(join(this.store.trashDir, 'index.json'), [])
    for (const e of entries) e.present = await pathExists(e.trashPath)
    return { entries }
  }

  async restore(request, signal) {
    signal?.throwIfAborted()
    const trashPath = String(request?.trashPath ?? '')
    if (!trashPath) fail('skill-manager/bad-request', 'trashPath is required')
    const indexFile = join(this.store.trashDir, 'index.json')
    const entries = await this.store.readJson(indexFile, [])
    const entry = entries.find((e) => e.trashPath === trashPath)
    if (!entry) fail('skill-manager/not-found', 'trash entry not found')
    if (!(await pathExists(trashPath))) fail('skill-manager/not-found', 'trash payload missing')
    if (await pathExists(entry.from)) fail('skill-manager/conflict', `target already exists: ${entry.from}`)
    try {
      await mkdir(dirname(entry.from), { recursive: true })
      await rename(trashPath, entry.from)
    } catch (e) {
      fail('skill-manager/restore-failed', `failed to restore: ${e.message}`)
    }
    await this.store.writeJson(indexFile, entries.filter((e) => e.trashPath !== trashPath))
    await this.store.log(`restore ${entry.from}`)
    this.cache.at = 0
    return { ok: true, catalog: await this.scan(signal) }
  }

  async purge(request, signal) {
    signal?.throwIfAborted()
    const trashPath = String(request?.trashPath ?? '')
    const indexFile = join(this.store.trashDir, 'index.json')
    const entries = await this.store.readJson(indexFile, [])
    const entry = entries.find((e) => e.trashPath === trashPath)
    if (entry) {
      await rm(trashPath, { recursive: true, force: true })
      await this.store.writeJson(indexFile, entries.filter((e) => e.trashPath !== trashPath))
      await this.store.log(`purge ${trashPath}`)
    }
    return { ok: true }
  }

  async validateSource(request, signal) {
    signal?.throwIfAborted()
    const dir = resolve(String(request?.path ?? ''))
    const meta = await readSkillMeta(dir)
    if (!meta) return { valid: false, reason: 'missing-skill-file' }
    return { valid: meta.valid, id: meta.id, name: meta.name, description: meta.description, reason: meta.valid ? undefined : 'invalid-frontmatter' }
  }

  async installLocal(request, signal) {
    signal?.throwIfAborted()
    if (!request?.path) fail('skill-manager/bad-request', 'path is required')
    if (!request?.targetRoot) fail('skill-manager/bad-request', 'targetRoot is required')
    const source = resolve(String(request.path))
    const targetRoot = resolve(String(request.targetRoot))
    const meta = await readSkillMeta(source)
    if (!meta) fail('skill-manager/invalid-source', `source has no ${SKILL_FILE}`)
    const destName = String(request?.name ?? meta.name ?? basenameSafe(source))
    if (!NAME_RE.test(destName)) fail('skill-manager/invalid-name', `invalid skill name "${destName}"`)
    const dest = join(targetRoot, destName)
    const rel = relative(targetRoot, dest)
    if (rel.startsWith('..') || isAbsolute(rel)) fail('skill-manager/path-escape', 'destination escapes the target root')
    if (await pathExists(dest)) fail('skill-manager/conflict', `"${destName}" already exists in the target root`)
    const size = await dirSize(source, MAX_INSTALL_BYTES)
    if (size > MAX_INSTALL_BYTES) fail('skill-manager/too-large', 'source exceeds the install size limit')
    try {
      await mkdir(targetRoot, { recursive: true })
      await cp(source, dest, { recursive: true })
    } catch (e) {
      fail('skill-manager/install-failed', `copy failed: ${e.message}`)
    }
    await this.store.log(`install-local ${source} -> ${dest}`)
    this.cache.at = 0
    return { ok: true, installed: dest, catalog: await this.scan(signal) }
  }

  async installGit(request, signal) {
    signal?.throwIfAborted()
    const url = String(request?.url ?? '').trim()
    if (!url) fail('skill-manager/bad-request', 'url is required')
    if (!request?.targetRoot) fail('skill-manager/bad-request', 'targetRoot is required')
    const targetRoot = resolve(String(request.targetRoot))
    if (!/^(https?:\/\/|git@|ssh:\/\/|file:\/\/)/.test(url) && !/^[\w.-]+\/[\w.-]+$/.test(url)) {
      fail('skill-manager/invalid-url', `unsupported git url "${url}"`)
    }
    const work = await mkdtemp(join(tmpdir(), 'skillmgr-git-'))
    const cloneDir = join(work, 'repo')
    const cloneArgs = ['clone', '--depth', '1']
    if (request?.ref) cloneArgs.push('--branch', String(request.ref))
    cloneArgs.push(url, cloneDir)
    try {
      await runGit(cloneArgs, undefined, signal)
    } catch (e) {
      await rm(work, { recursive: true, force: true })
      throw e
    }
    let searchRoot = cloneDir
    if (request?.subdir) searchRoot = join(cloneDir, String(request.subdir))
    if (!(await pathExists(searchRoot))) {
      await rm(work, { recursive: true, force: true })
      fail('skill-manager/not-found', `subdir not found in repo: ${request.subdir}`)
    }
    let candidates = await discoverUnderRoot(searchRoot)
    if (candidates.length === 0) candidates = [searchRoot]
    const head = await runGit(['-C', cloneDir, 'rev-parse', 'HEAD'], undefined, signal).then((r) => r.stdout).catch(() => '')
    const installed = []
    await mkdir(targetRoot, { recursive: true })
    for (const dir of candidates) {
      const meta = await readSkillMeta(dir).catch(() => undefined)
      const destName = meta?.valid ? meta.name : basenameSafe(dir)
      if (!NAME_RE.test(destName)) continue
      const dest = join(targetRoot, destName)
      if (await pathExists(dest)) continue
      const rel = relative(cloneDir, dir)
      await cp(dir, dest, { recursive: true })
      installed.push({ name: destName, path: dest, from: rel || '.' })
    }
    await rm(work, { recursive: true, force: true })
    this.cache.at = 0
    if (installed.length === 0) {
      await this.store.log(`install-git ${url} (no skills found)`)
      return { ok: false, reason: 'no-skills-found', catalog: await this.scan(signal) }
    }
    await this.store.log(`install-git ${url}@${head.slice(0, 8)} -> ${installed.length} skill(s)`)
    return { ok: true, installed, source: { url, commit: head }, catalog: await this.scan(signal) }
  }

  async revealPath(request, signal) {
    signal?.throwIfAborted()
    const p = resolve(String(request?.path ?? ''))
    if (!(await pathExists(p))) fail('skill-manager/not-found', `path not found: ${p}`)
    try {
      await revealNativePath(p, signal)
    } catch (e) {
      fail('skill-manager/reveal-failed', `could not open file manager: ${e.message}`)
    }
    return { ok: true }
  }

  async exportCatalog(request, signal) {
    signal?.throwIfAborted()
    const data = await this.scan(signal)
    const format = String(request?.format ?? 'json')
    const stamp = new Date().toISOString().slice(0, 10)
    if (format === 'md') {
      const lines = [`# 技能库清单 (${stamp})`, '', `> 共 ${data.stats.uniqueSkills} 个技能 · ${data.stats.installations} 处安装 · ${data.stats.conflicts} 个冲突`, '']
      for (const [cat, items] of groupBy(data.skills, (s) => s.category)) {
        const label = data.categories.find((c) => c.id === cat)?.label ?? cat
        lines.push(`## ${label} (${items.length})`, '')
        for (const s of items) {
          lines.push(`- **${s.alias ?? s.name}** \`${s.id}\`${s.conflict ? ' ⚠️' : ''}`)
          if (s.description) lines.push(`  - ${s.description}`)
          lines.push(`  - 安装于: ${s.installations.map((i) => i.tool).join(', ')}${s.readOnly ? ' (只读)' : ''}`)
        }
        lines.push('')
      }
      return { filename: `skills-${stamp}.md`, content: lines.join('\n'), mime: 'text/markdown' }
    }
    if (format === 'csv') {
      const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`
      const rows = [['id', 'name', 'category', 'tools', 'installCount', 'conflict', 'readOnly', 'description'].map(esc).join(',')]
      for (const s of data.skills) {
        rows.push([s.id, s.name, s.category, s.tools.join('|'), s.installCount, s.conflict, s.readOnly, s.description].map(esc).join(','))
      }
      return { filename: `skills-${stamp}.csv`, content: '\ufeff' + rows.join('\n'), mime: 'text/csv' }
    }
    return { filename: `skills-${stamp}.json`, content: JSON.stringify(data, null, 2), mime: 'application/json' }
  }

  async skillDetail(request, signal) {
    signal?.throwIfAborted()
    const id = normalizeId(request?.name)
    const skill = await this.findSkill(id)
    if (!skill) fail('skill-manager/not-found', `skill "${id}" not found`)
    const primary = skill.installations[0]
    let body = ''
    let frontmatter = ''
    if (primary) {
      try {
        const raw = await readFile(join(primary.path, SKILL_FILE), 'utf8')
        const fm = parseFrontmatter(raw)
        frontmatter = fm ? raw.slice(0, raw.length - fm.body.length).trim() : ''
        body = fm ? fm.body.trim() : raw.trim()
      } catch { /* ignore */ }
    }
    return { skill, frontmatter, body }
  }
  //#endregion
}

// Attach the Typert Remote markers. This bundle is hand-written ESM, so the
// framework's `@Remote` decorator is applied programmatically instead of parsed.
// Each entry maps the class method to the wire export name the Client calls.
applyRemoteMarkers(SkillManagerService, {
  roots: 'roots',
  remoteScan: 'scan',
  refresh: 'refresh',
  updateCategory: 'updateCategory',
  createCategory: 'createCategory',
  renameCategory: 'renameCategory',
  deleteCategory: 'deleteCategory',
  setAlias: 'setAlias',
  setFavorite: 'setFavorite',
  configure: 'configure',
  deleteSkill: 'deleteSkill',
  trashList: 'trashList',
  restore: 'restore',
  purge: 'purge',
  validateSource: 'validateSource',
  installLocal: 'installLocal',
  installGit: 'installGit',
  revealPath: 'revealPath',
  exportCatalog: 'exportCatalog',
  skillDetail: 'skillDetail',
})
//#endregion

export default SkillManagerService
export { SkillManagerService as SkillManager, NAMESPACE }
