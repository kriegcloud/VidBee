// Bun resolves catalog/workspace versions when packing but does not project
// publishConfig.exports. Apply that publication metadata for the pack lifetime.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
const manifest = new URL('../package.json', import.meta.url)
const backup = new URL('../.package-prepack.json', import.meta.url)
if (process.argv[2] === 'restore') {
  writeFileSync(manifest, readFileSync(backup))
  unlinkSync(backup)
} else {
  const original = readFileSync(manifest)
  const metadata = JSON.parse(original)
  writeFileSync(backup, original, { flag: 'wx' })
  writeFileSync(manifest, JSON.stringify({ ...metadata, exports: metadata.publishConfig.exports, main: metadata.publishConfig.main }, null, 2) + '\n')
}
