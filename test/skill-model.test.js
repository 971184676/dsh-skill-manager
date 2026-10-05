// Unit tests for the dependency-free skill-domain logic (lib/skill-model.js).
// These run with `node --test` in any environment — no DSH install required,
// because nothing here imports the DeepSeek Harness runtime.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  parseFrontmatter, skillMetaFromText, normalizeId, NAME_RE, MAX_SCAN_DEPTH,
  discoverUnderRoot, readSkillMeta, classify, effectiveCategories,
  mergeInstallations, BUILTIN_CATEGORIES, UNCATEGORIZED,
} from '../lib/skill-model.js'
import { parse as parseYaml } from '../lib/yaml.js'

const tmp = (name) => join(tmpdir(), `skill-model-test-${name}-${process.pid}`)

test('parseFrontmatter extracts name/description and body', () => {
  const fm = parseFrontmatter('---\nname: a\ndescription: d\n---\n# Body\ntext\n')
  assert.equal(fm.data.name, 'a')
  assert.equal(fm.data.description, 'd')
  assert.equal(fm.body.trim(), '# Body\ntext')
})

test('parseFrontmatter returns undefined without a valid block', () => {
  assert.equal(parseFrontmatter('no frontmatter here'), undefined)
  assert.equal(parseFrontmatter('---\nname: a\n'), undefined) // unterminated
  assert.equal(parseFrontmatter(''), undefined)
})

test('parseFrontmatter yields empty data for a non-mapping frontmatter (=> invalid skill)', () => {
  // The minimal YAML reader only understands flat `key: value` maps; a bare
  // scalar or a list yields an empty object, which parseFrontmatter accepts as
  // a block but skillMetaFromText then marks invalid (no name).
  const fm = parseFrontmatter('---\njust-a-string\n---\nb\n')
  assert.deepEqual(fm.data, {})
  const m = skillMetaFromText('/x/x', '---\njust-a-string\n---\nb\n')
  assert.equal(m.valid, false)
})

test('skillMetaFromText flags validity from name grammar', () => {
  const ok = skillMetaFromText('/x/my-skill', '---\nname: my-skill\ndescription: does a thing\n---\nbody')
  assert.equal(ok.valid, true)
  assert.equal(ok.name, 'my-skill')
  assert.equal(ok.id, 'my-skill')

  // invalid name grammar
  const bad = skillMetaFromText('/x/Bad_Name', '---\nname: Bad_Name\ndescription: d\n---\n')
  assert.equal(bad.valid, false)

  // missing description
  const missing = skillMetaFromText('/x/nodesc', '---\nname: nodesc\n---\n')
  assert.equal(missing.valid, false)
})

test('skillMetaFromText falls back to directory name when no frontmatter name', () => {
  const m = skillMetaFromText('/x/Fallback-Dir', 'no fm here')
  assert.equal(m.name, 'Fallback-Dir')
  assert.equal(m.declared, false)
  assert.equal(m.valid, false)
})

test('NAME_RE accepts slug names only', () => {
  assert.ok(NAME_RE.test('a1-b2-c3'))
  assert.ok(!NAME_RE.test('Bad'))
  assert.ok(!NAME_RE.test('bad_name'))
  assert.ok(!NAME_RE.test('-leading'))
  assert.ok(!NAME_RE.test('trailing-'))
})

test('normalizeId lowercases and trims', () => {
  assert.equal(normalizeId('  My-Skill '), 'my-skill')
  assert.equal(normalizeId(undefined), '')
})

test('classify: prefix beats keyword, falls back to uncategorized', () => {
  const cats = effectiveCategories()
  assert.equal(classify('lark-doc', 'lark-doc', '', cats), 'lark')
  assert.equal(classify('cloudflare', 'cloudflare', '', cats), 'cloud')
  assert.equal(classify('some-random', 'some random', 'makes wrangler files', cats), 'cloud')
  assert.equal(classify('zzz', 'zzz', 'nothing matches here', cats), UNCATEGORIZED.id)
})

test('effectiveCategories: user categories override builtins by id, uncategorized always last', () => {
  const cats = effectiveCategories([{ id: 'lark', label: '我的飞书', order: 1 }])
  const lark = cats.find(c => c.id === 'lark')
  assert.equal(lark.label, '我的飞书')
  assert.equal(lark.source, 'user')
  assert.equal(cats.at(-1).id, UNCATEGORIZED.id)
  // ordered
  const orders = cats.map(c => c.order ?? 500)
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b))
})

test('mergeInstallations: same name across tools becomes ONE record with all locations', () => {
  const mk = (tool, dir, editable = true, description = 'same') => ({
    meta: skillMetaFromText(dir, `---\nname: shared-skill\ndescription: ${description}\n---\n`),
    tool, path: dir, root: '/r', scope: 'user', editable, readOnly: !editable,
  })
  const skills = mergeInstallations(
    [mk('Claude', '/a/shared-skill'), mk('Codex', '/b/shared-skill'), mk('Gemini', '/c/shared-skill')],
    { categories: effectiveCategories(), overrides: {}, aliases: {}, favorites: {} },
  )
  assert.equal(skills.length, 1)
  assert.equal(skills[0].installCount, 3)
  assert.deepEqual([...skills[0].tools].sort(), ['Claude', 'Codex', 'Gemini'])
  assert.equal(skills[0].conflict, false)
})

test('mergeInstallations: differing descriptions mark a conflict', () => {
  const mk = (dir, description) => ({
    meta: skillMetaFromText(dir, `---\nname: s\ndescription: ${description}\n---\n`),
    tool: 'T', path: dir, root: '/r', scope: 'user', editable: true, readOnly: false,
  })
  const [s] = mergeInstallations([mk('/a/s', 'one'), mk('/b/s', 'two')], {
    categories: effectiveCategories(), overrides: {}, aliases: {}, favorites: {},
  })
  assert.equal(s.conflict, true)
})

test('mergeInstallations: readOnly only when EVERY installation is read-only', () => {
  const mk = (dir, editable) => ({
    meta: skillMetaFromText(dir, '---\nname: s\ndescription: d\n---\n'),
    tool: 'T', path: dir, root: '/r', scope: 'user', editable, readOnly: !editable,
  })
  const mixed = mergeInstallations([mk('/a/s', true), mk('/b/s', false)], {
    categories: effectiveCategories(), overrides: {}, aliases: {}, favorites: {},
  })
  assert.equal(mixed[0].readOnly, false) // one editable copy -> deletable
  const allRO = mergeInstallations([mk('/a/s', false), mk('/b/s', false)], {
    categories: effectiveCategories(), overrides: {}, aliases: {}, favorites: {},
  })
  assert.equal(allRO[0].readOnly, true)
})

test('mergeInstallations: user override wins over auto category; alias/favorite applied', () => {
  const entries = [{
    meta: skillMetaFromText('/a/s', '---\nname: s\ndescription: d\n---\n'),
    tool: 'T', path: '/a/s', root: '/r', scope: 'user', editable: true, readOnly: false,
  }]
  const [s] = mergeInstallations(entries, {
    categories: effectiveCategories(),
    overrides: { s: 'office' }, aliases: { s: '我的技能' }, favorites: { s: true },
  })
  assert.equal(s.category, 'office')
  assert.equal(s.categorySource, 'user')
  assert.equal(s.alias, '我的技能')
  assert.equal(s.favorite, true)
})

test('parseYaml handles scalars, quoted strings, and comments', () => {
  assert.deepEqual(parseYaml('name: x\nversion: 1.2'), { name: 'x', version: '1.2' })
  assert.deepEqual(parseYaml('name: "a: b"'), { name: 'a: b' })
  assert.deepEqual(parseYaml('# only a comment\nname: y'), { name: 'y' })
})

//#region filesystem discovery
async function makeSkill(root, name, extraDirs = 0) {
  const dir = join(root, name)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} desc\n---\nbody\n`)
  for (let i = 0; i < extraDirs; i++) await mkdir(join(dir, `nested${i}`), { recursive: true })
  return dir
}

test('discoverUnderRoot finds direct skills and skips node_modules/.git', async () => {
  const root = tmp('discover')
  await rm(root, { recursive: true, force: true })
  await makeSkill(root, 'alpha')
  await makeSkill(root, 'beta')
  await mkdir(join(root, 'node_modules', 'pkg'), { recursive: true })
  await writeFile(join(root, 'node_modules', 'pkg', 'SKILL.md'), '---\nname: ignored\ndescription: d\n---\n')
  const found = await discoverUnderRoot(root)
  assert.equal(found.length, 2)
  assert.ok(found.every(d => d.includes('alpha') || d.includes('beta')))
  await rm(root, { recursive: true, force: true })
})

test('discoverUnderRoot respects the depth limit and does not loop on a junction cycle', async () => {
  const root = tmp('cycle')
  await rm(root, { recursive: true, force: true })
  await makeSkill(root, 'top')
  // create a cycle back to the root under a skill dir
  try { await symlink(root, join(root, 'top', 'loop'), 'junction') } catch { /* best effort */ }
  const t0 = Date.now()
  const found = await discoverUnderRoot(root)
  // must terminate quickly regardless of the cycle
  assert.ok(Date.now() - t0 < 5000, 'discovery must not hang')
  assert.ok(found.length >= 1)
  await rm(root, { recursive: true, force: true })
})

test('readSkillMeta returns undefined for a directory without SKILL.md', async () => {
  const root = tmp('nometa')
  await rm(root, { recursive: true, force: true })
  await mkdir(join(root, 'empty'), { recursive: true })
  assert.equal(await readSkillMeta(join(root, 'empty')), undefined)
  await rm(root, { recursive: true, force: true })
})
//#endregion

test('MAX_SCAN_DEPTH is a small bounded value', () => {
  assert.ok(MAX_SCAN_DEPTH >= 1 && MAX_SCAN_DEPTH <= 4)
})