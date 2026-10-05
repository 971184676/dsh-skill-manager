// Pure skill-domain logic — no DSH runtime imports.
//
// Everything here is deliberately dependency-free (node: builtins only) so it can be
// unit-tested in any environment, without a DeepSeek Harness installation. The Host
// service (index.js) owns all DSH-coupled concerns: Cordis, Typert Remote, atomic
// writes, native commands. This module owns the rules: what a skill is, how a
// SKILL.md is parsed, how installations are discovered, merged and classified.
//
// Keeping the rules here is what makes the two historical regressions provable in CI:
// a duplicate `/` trigger identity (client) and a config default that schemastery
// rejects (host) are integration concerns; frontmatter/dedup/categorisation are the
// logic most worth locking down.

import { readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { parse as parseYaml } from './yaml.js'

export const SKILL_FILE = 'SKILL.md'
/** The public skill-name grammar. A directory failing this is never installable. */
export const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const MAX_SCAN_DEPTH = 2
export const MAX_SKILL_FILE_BYTES = 1024 * 1024

export const BUILTIN_CATEGORIES = [
  { id: 'lark', label: '飞书办公 / Lark', order: 10, prefixes: ['lark-'], keywords: ['lark', '飞书'] },
  { id: 'cloud', label: 'Cloudflare / 云平台', order: 20, prefixes: ['cloudflare', 'wrangler', 'durable-objects', 'turnstile-', 'workers-', 'sandbox-sdk', 'agents-sdk'], keywords: ['cloudflare', 'wrangler', 'worker', 'durable object'] },
  { id: 'video', label: '视频与动画 / Video & Motion', order: 30, prefixes: ['hyperframes', 'remotion', 'seedance', 'media-use', 'moneyprinterturbo-'], keywords: ['video', 'animation', 'remotion', 'motion', 'hyperframes'] },
  { id: 'office', label: 'Office 文档 / Office Docs', order: 40, prefixes: ['office-'], keywords: ['docx', 'pptx', 'xlsx', 'office', 'spreadsheet', 'presentation'] },
  { id: 'skill', label: '技能管理 / Skill Mgmt', order: 50, prefixes: ['skill-', 'find-skills'], keywords: ['skill', '技能'] },
  { id: 'frontend', label: '前端与设计 / Frontend & Design', order: 60, prefixes: ['frontend-design', 'web-perf'], keywords: ['frontend', 'design', 'ui', 'ux', 'web perf'] },
  { id: 'method', label: '开发方法论 / Engineering Method', order: 70, prefixes: ['test-driven-development', 'systematic-debugging', 'brainstorming', 'writing-plans'], keywords: ['debug', 'test', 'plan', 'brainstorm', 'refactor'] },
]
export const UNCATEGORIZED = { id: 'uncategorized', label: '未分类 / Uncategorized', order: 999 }

//#region fs helpers
export function isAbsent(error) {
  const code = error?.code
  return code === 'ENOENT' || code === 'ENOTDIR' || code === 'FS_NOT_FOUND'
}
export async function pathExists(p) {
  try { await stat(p); return true } catch (e) { if (isAbsent(e)) return false; throw e }
}
export function basenameSafe(p) {
  try { return basename(p) } catch { return 'unknown' }
}
//#endregion

//#region frontmatter
/**
 * Split `---` YAML frontmatter from the Markdown body.
 * Returns undefined when the document has no well-formed frontmatter block.
 */
export function parseFrontmatter(raw) {
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
export function frontmatterString(data, key) {
  const v = data[key]
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined
}

/** Build the skill record for one directory, or undefined when it is not a skill. */
export function skillMetaFromText(dir, raw) {
  const fm = parseFrontmatter(raw)
  const name = fm ? frontmatterString(fm.data, 'name') : undefined
  const description = fm ? frontmatterString(fm.data, 'description') : undefined
  const version = fm ? frontmatterString(fm.data, 'version') : undefined
  const dirName = basenameSafe(dir)
  const id = normalizeId(name ?? dirName)
  return {
    id,
    name: name ?? dirName,
    declared: Boolean(name),
    valid: Boolean(name && description && NAME_RE.test(name)),
    description: description ?? '',
    version,
    dir,
    body: fm ? fm.body.trim() : raw.trim(),
    frontmatter: fm ? raw.slice(0, raw.length - fm.body.length).trim() : '',
  }
}
//#endregion

//#region discovery
/**
 * Find every directory beneath `root` that directly contains a SKILL.md.
 * Depth-limited: a skill nested deeper than MAX_SCAN_DEPTH is not treated as a
 * skill root, which also bounds junction/symlink cycles.
 */
export async function discoverUnderRoot(root, depthLimit = MAX_SCAN_DEPTH) {
  const out = []
  async function walk(dir, depth) {
    if (depth > depthLimit) return
    let entries
    try { entries = await readdir(dir, { withFileTypes: true }) } catch (e) { if (isAbsent(e)) return; throw e }
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

/** Read and parse one skill directory. Returns undefined when unreadable. */
export async function readSkillMeta(dir) {
  const file = join(dir, SKILL_FILE)
  let st
  try { st = await stat(file) } catch (e) { if (isAbsent(e)) return undefined; throw e }
  if (st.size > MAX_SKILL_FILE_BYTES) return undefined
  const { readFile } = await import('node:fs/promises')
  let raw
  try { raw = await readFile(file, 'utf8') } catch (e) { if (isAbsent(e)) return undefined; throw e }
  return { ...skillMetaFromText(dir, raw), mtime: st.mtimeMs, size: st.size }
}
//#endregion

//#region identity + classification
export function normalizeId(name) {
  return String(name || '').trim().toLowerCase()
}

/** Prefix rules win over keyword rules; the fallback bucket is 未分类. */
export function classify(id, name, description, categories) {
  const hay = `${id} ${name} ${description}`.toLowerCase()
  for (const cat of categories) {
    for (const p of cat.prefixes ?? []) if (id.startsWith(p)) return cat.id
  }
  for (const cat of categories) {
    for (const k of cat.keywords ?? []) if (hay.includes(k.toLowerCase())) return cat.id
  }
  return UNCATEGORIZED.id
}

/** Built-in categories overridden by user categories, plus the fallback bucket. */
export function effectiveCategories(userCategories = []) {
  const byId = new Map(BUILTIN_CATEGORIES.map((c) => [c.id, { ...c, source: 'builtin' }]))
  for (const c of userCategories) if (c && c.id && c.label) byId.set(c.id, { ...c, source: 'user' })
  byId.set(UNCATEGORIZED.id, UNCATEGORIZED)
  return [...byId.values()].sort((a, b) => (a.order ?? 500) - (b.order ?? 500))
}

/**
 * Merge installations that share a frontmatter `name` into one record.
 *
 * This is the core of "the same skill installed in four tools is ONE skill".
 * `readOnly` is true only when every installation is read-only, which is what
 * disables deletion. Distinct descriptions across installations mark a conflict.
 *
 * @param {{meta:any, tool:string, path:string, root:string, scope:string, editable:boolean, readOnly:boolean}[]} entries
 * @param {{categories:any[], overrides:Record<string,string>, aliases?:Record<string,string>, favorites?:Record<string,string>}} options
 */
export function mergeInstallations(entries, options) {
  const { categories, overrides = {}, aliases = {}, favorites = {} } = options
  const byId = new Map()
  for (const e of entries) {
    let rec = byId.get(e.meta.id)
    if (!rec) {
      rec = {
        id: e.meta.id,
        name: e.meta.name,
        description: e.meta.description,
        version: e.meta.version,
        installations: [],
        conflict: false,
      }
      byId.set(e.meta.id, rec)
    }
    rec.installations.push({
      key: `${e.tool}::${e.path}`, tool: e.tool, root: e.root, path: e.path,
      scope: e.scope, editable: e.editable, readOnly: e.readOnly,
    })
    if (e.meta.description.length > (rec.description?.length ?? 0)) rec.description = e.meta.description
    if (!rec.version && e.meta.version) rec.version = e.meta.version
  }
  const out = []
  for (const rec of byId.values()) {
    const descriptions = new Set(
      entries.filter((e) => e.meta.id === rec.id).map((e) => e.meta.description).filter(Boolean),
    )
    rec.conflict = descriptions.size > 1
    const userCat = overrides[rec.id]
    rec.categorySource = userCat ? 'user' : 'auto'
    rec.category = userCat ?? classify(rec.id, rec.name, rec.description, categories)
    rec.alias = aliases[rec.id]
    rec.favorite = favorites[rec.id] === true
    rec.readOnly = rec.installations.every((i) => !i.editable)
    rec.tools = [...new Set(rec.installations.map((i) => i.tool))]
    rec.tags = rec.tools.map((t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
    rec.installCount = rec.installations.length
    out.push(rec)
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}
//#endregion

export function groupBy(items, key) {
  const map = new Map()
  for (const item of items) {
    const k = key(item)
    const arr = map.get(k) ?? []
    arr.push(item)
    map.set(k, arr)
  }
  return map
}