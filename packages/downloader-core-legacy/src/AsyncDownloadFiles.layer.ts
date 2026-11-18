import * as fs from 'node:fs/promises'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { DownloadFiles } from '../../downloader-core/src/DownloadFiles.service.js'
import { HostFailure } from '../../downloader-core/src/Downloader.errors.js'
import { DownloadFilesLegacy } from './DownloadFiles.layer.js'

const failure = (operation: string) => (cause: unknown) => HostFailure.make({operation, legacyMessage: cause instanceof Error ? cause.message : String(cause), cause})
/** Preserve the existing Promise boundaries of mapper scratch-file operations. */
export const AsyncDownloadFilesLegacy = Layer.effect(DownloadFiles, Effect.map(DownloadFiles, files => ({
  ...files,
  write: (file: string, text: string, mode?: number) => Effect.tryPromise({try: () => fs.writeFile(file, text, {mode}), catch: failure('write')}),
  makeTempDirectory: (prefix: string) => Effect.tryPromise({try: () => fs.mkdtemp(prefix), catch: failure('makeTempDirectory')}),
  remove: (file: string, recursive: boolean) => Effect.tryPromise({try: () => fs.rm(file, {recursive, force: true}), catch: failure('remove')})
}))).pipe(Layer.provide(DownloadFilesLegacy))
