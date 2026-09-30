// Minimal frontmatter scalar parser.
//
// We only need a handful of flat `key: value` fields (name, description, version)
// from SKILL.md YAML frontmatter. Rather than depend on a full YAML package inside
// the profile-installed bundle, this parses the small, common subset directly and
// degrades gracefully: anything it cannot understand is simply omitted, and the
// scanner falls back to the directory name for `name`.

/** Strip surrounding quotes from a scalar token. */
function unquote(value) {
	const v = value.trim()
	if (v.length >= 2) {
		const first = v[0]
		const last = v[v.length - 1]
		if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
			const inner = v.slice(1, -1)
			return first === '"' ? inner.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\') : inner.replace(/''/g, "'")
		}
	}
	// strip a trailing unquoted comment only when clearly separated
	return v
}

/**
 * Parse a flat YAML mapping into a plain object of string/array values.
 * Supports `key: value`, `key: [a, b]`, `key:\n  - item`, and quoted scalars.
 * Nested objects and multi-line block scalars are intentionally unsupported.
 * @param {string} text
 * @returns {Record<string, any>}
 */
export function parse(text) {
	/** @type {Record<string, any>} */
	const out = {}
	const lines = text.split(/\r?\n/)
	let i = 0
	while (i < lines.length) {
		const line = lines[i]
		i++
		if (line.trim() === '' || line.trimStart().startsWith('#')) continue
		// Only top-level keys (no leading indentation).
		if (/^\s/.test(line)) continue
		const idx = line.indexOf(':')
		if (idx < 0) continue
		const key = line.slice(0, idx).trim()
		if (key === '') continue
		let rest = line.slice(idx + 1).trim()
		if (rest === '') {
			// Look ahead for a block list (`  - item`) belonging to this key.
			const items = []
			while (i < lines.length) {
				const nxt = lines[i]
				const trimmed = nxt.trim()
				if (trimmed.startsWith('- ')) {
					items.push(unquote(trimmed.slice(2)))
					i++
				} else if (trimmed === '' || /^\s/.test(nxt)) {
					// blank or indented non-list line: peek conservatively
					if (trimmed === '') { i++; continue }
					break
				} else break
			}
			if (items.length > 0) out[key] = items
			else out[key] = ''
			continue
		}
		// Inline list: key: [a, b]
		if (rest.startsWith('[') && rest.endsWith(']')) {
			const inner = rest.slice(1, -1).trim()
			out[key] = inner === '' ? [] : inner.split(',').map((s) => unquote(s))
			continue
		}
		out[key] = unquote(rest)
	}
	return out
}

export default { parse }
