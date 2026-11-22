import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Full phase-6b union, including recovery of its synthetic saved browser profiles.
// A queries are answered with loopback; the launcher gives the namespace only loopback.
const allowed = new Set([
  'api.vidbee.org',
  'example.invalid',
  'favicon.im',
  'gh-proxy.com',
  'ghfast.top',
  'github.com',
  'redirector.gvt1.com',
  'selftest.dns-logger.invalid',
  'www.modelscope.cn',
  'dict.brave.com',
  'usage-ping.brave.com',
  'www.gstatic.com',
  'fansly.com',
  'onlyfans.com'
])
export async function auditDns(work, directories) {
  const receipts = []
  for (const directory of directories) {
    const text = await readFile(path.join(work, directory, 'dns.log'), 'utf8')
    assert.ok(text.includes('# dns-logger ready'), `DNS logger missing: ${directory}`)
    assert.ok(text.includes('selftest.dns-logger.invalid'), `DNS selftest missing: ${directory}`)
    const names = [
      ...new Set(
        text
          .split('\n')
          .filter((line) => line && !line.startsWith('#'))
          .map((line) => line.split(' ').at(-1))
      )
    ].sort()
    const unexpected = names.filter((name) => !allowed.has(name))
    receipts.push({ directory, names, unexpected })
    assert.deepEqual(unexpected, [], `Unexpected DNS names in ${directory}`)
  }
  await writeFile(path.join(work, 'dns-audit.json'), JSON.stringify(receipts, null, 2))
}
