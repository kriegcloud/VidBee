import * as os from 'node:os'
import { randomUUID } from 'node:crypto'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { DownloadHost } from '../../downloader-core/src/DownloadHost.service.js'
export const DownloadHostLegacy = Layer.succeed(DownloadHost, {
  platform: () => process.platform,
  homeDirectory: () => os.homedir(),
  tempDirectory: () => os.tmpdir(),
  environment: () => ({ ...process.env }),
  setEnvironment: (key, value) => Effect.sync(() => { process.env[key] = value }),
  makeAbortController: () => new AbortController(),
  uuid: () => randomUUID()
})
