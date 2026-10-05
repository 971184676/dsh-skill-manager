// Guard against the failure that hid this plugin's sidebar entry with no error:
// a client service listed in the plugin's `inject` array whose providing package is
// absent from `dsh.client.inject` in package.json. When that happens the service
// never resolves, the whole client half stays pending, and the user simply sees
// "no skill entry" — the exact bug this project exists to fix.
//
// This runs in CI without a DSH install: it reads a checked-in manifest of which
// package provides which client service, and cross-checks the two lists.
//
// Update SERVICE_PROVIDERS only if DSH changes which package owns a service.

import { readFile } from 'node:fs/promises'

/** client service key -> the @deepseek-ai package that registers it. */
const SERVICE_PROVIDERS = {
  slots: '@deepseek-ai/dsh-client-ui-renderer',
  locale: '@deepseek-ai/dsh-client-locale',
  layout: '@deepseek-ai/dsh-client-ui-layout',
  remote: '@deepseek-ai/dsh-api-gateway',
  inputTriggers: '@deepseek-ai/dsh-client-ui-input-trigger',
  sessions: '@deepseek-ai/dsh-session',
  sidebar: '@deepseek-ai/dsh-client-ui-sidebar',
}

const clientSrc = await readFile(new URL('../client.js', import.meta.url), 'utf8')
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

/** Extract the inject array literal from client.js. */
const m = clientSrc.match(/const\s+inject\s*=\s*\[([^\]]*)\]/)
if (!m) {
  console.error('FAIL: could not find the `inject` array in client.js')
  process.exit(1)
}
const services = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
const declared = new Set(pkg.dsh?.client?.inject ?? [])

let failed = false
for (const service of services) {
  const provider = SERVICE_PROVIDERS[service]
  if (provider === undefined) {
    console.warn(`warn: service "${service}" is not in SERVICE_PROVIDERS — add it to tools/check-inject.mjs`)
    continue
  }
  if (!declared.has(provider)) {
    console.error(`FAIL: client.js injects service "${service}" (provided by ${provider}) but ${provider} is missing from dsh.client.inject in package.json`)
    failed = true
  }
}

if (failed) {
  console.error('\nThis exact mismatch made the whole client plugin stay pending and hid the sidebar entry. Add the package to dsh.client.inject.')
  process.exit(1)
}
console.log(`inject OK: ${services.length} service(s) -> ${declared.size} package(s)`)