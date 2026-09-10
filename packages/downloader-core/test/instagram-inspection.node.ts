import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { InstagramProfileInspector } from '../src/instagram-profile'

test('JSON inspection distinguishes extractor exceptions from empty categories', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vidbee-instagram-inspection-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const script = join(dir, 'gallery.cjs')
  writeFileSync(
    script,
    `
const url=process.argv.at(-1)
const result=url.includes('/info/')?[[2,{username:'fixture'}]]:
url.includes('/posts/')?[[-1,{error:'AbortExtraction',message:'HTTP redirect to login page'}]]:
url.includes('/reels/')?[[2,{post_id:'one'}],[3,'https://example.com/video.mp4',{post_id:'one'}],[-1,{error:'HttpError',message:'429 Too Many Requests'}]]:[]
console.log(JSON.stringify(result))
`
  )
  // A tiny launcher absorbs gallery-dl's flags, passing only the URL to Node.
  const launcher = join(dir, 'gallery')
  writeFileSync(
    launcher,
    `#!/usr/bin/env node\nrequire('node:child_process').spawnSync(process.execPath,[${JSON.stringify(script)},process.argv.at(-1)],{stdio:'inherit'})\n`,
    { mode: 0o755 }
  )
  const actual = new InstagramProfileInspector({
    resolveBinaryPath: () => launcher,
    resolveExtraArgs: () => []
  })
  const result = await actual.inspect('https://www.instagram.com/fixture/')
  assert.equal(result.complete, false)
  assert.equal(result.categories.find((x) => x.category === 'posts')?.state, 'auth-required')
  assert.equal(result.categories.find((x) => x.category === 'reels')?.errorCode, 'rate-limited')
  assert.equal(result.categories.find((x) => x.category === 'reels')?.assetCount, 1)
  assert.equal(result.categories.find((x) => x.category === 'stories')?.state, 'empty')
})
