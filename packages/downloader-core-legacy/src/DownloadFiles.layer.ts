import * as fs from 'node:fs'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { DownloadFiles } from '../../downloader-core/src/DownloadFiles.service.js'
import { HostFailure } from '../../downloader-core/src/Downloader.errors.js'

const sync = <A>(operation: string, evaluate: () => A) => Effect.try({
  try: evaluate,
  catch: (cause) => new HostFailure({ operation, cause, legacyMessage: cause instanceof Error ? cause.message : String(cause) })
})
export const DownloadFilesLegacy = Layer.succeed(DownloadFiles, {
  read: (file) => sync('read', () => fs.readFileSync(file, 'utf8')),
  exists: (file) => Effect.sync(() => fs.existsSync(file)),
  stat: (file) => sync('stat', () => { const stat = fs.statSync(file); return { size: stat.size, isFile: stat.isFile() } }),
  write: (file, text, mode) => sync('write', () => fs.writeFileSync(file, text, { mode })),
  makeDirectory: (directory, recursive, mode) => sync('makeDirectory', () => { fs.mkdirSync(directory, { recursive, mode }) }),
  makeTempDirectory: (prefix) => sync('makeTempDirectory', () => fs.mkdtempSync(prefix)),
  rename: (source, target) => sync('rename', () => fs.renameSync(source, target)),
  readDirectory: (directory) => sync('readDirectory', () => fs.readdirSync(directory)),
  remove: (file, recursive) => sync('remove', () => fs.rmSync(file, { recursive, force: true })),
  chmod: (file, mode) => sync('chmod', () => fs.chmodSync(file, mode))
})
