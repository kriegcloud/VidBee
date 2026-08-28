import { join } from 'node:path'
import { createGithubMirrorFetch, preferChinaMirrors } from '@vidbee/transcription/download-mirrors'
import { app } from 'electron'
import { settingsManager } from '../settings'
import { scopedLoggers } from '../utils/logger'
import { resolveBundledResourcesPath } from './bundled-resources-path'
import { readElectronLocaleHints } from './system-locale'
import { runKernelCommand } from './ytdlp-kernel-command'
import { YtDlpKernelService } from './ytdlp-kernel-service'
import { ytdlpManager } from './ytdlp-manager'

let kernelService: YtDlpKernelService | null = null

/**
 * Return the packaged yt-dlp filename for the current platform.
 */
function getBundledYtDlpName(): string {
  if (process.platform === 'win32') {
    return 'yt-dlp.exe'
  }
  return process.platform === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp_linux'
}

/**
 * Return the packaged Node filename for the current platform.
 */
function getBundledNodeName(): string {
  return process.platform === 'win32' ? 'node.exe' : 'node'
}

/**
 * Create the process-wide kernel service after Electron paths are ready.
 */
export function initializeYtDlpKernelService(): YtDlpKernelService {
  if (kernelService) {
    return kernelService
  }
  const ytDlpName = getBundledYtDlpName()
  const nodeName = getBundledNodeName()
  const resourcesPath = resolveBundledResourcesPath([ytDlpName, join('node', nodeName)])
  kernelService = new YtDlpKernelService({
    activate: (paths) => ytdlpManager.activate(paths),
    bundledNodePath: join(resourcesPath, 'node', nodeName),
    bundledYtDlpPath: join(resourcesPath, ytDlpName),
    fetch: createGithubMirrorFetch(fetch, () =>
      preferChinaMirrors({
        ...readElectronLocaleHints(),
        mirror: settingsManager.get('downloadMirror')
      })
    ),
    kernelRoot: join(app.getPath('userData'), 'kernels', 'yt-dlp'),
    logger: {
      error: (message) => scopedLoggers.engine.error(message),
      info: (message) => scopedLoggers.engine.info(message),
      warn: (message) => scopedLoggers.engine.warn(message)
    },
    platform: process.platform,
    runCommand: runKernelCommand
  })
  return kernelService
}

/**
 * Return the initialized process-wide kernel service.
 */
export function getYtDlpKernelService(): YtDlpKernelService {
  if (!kernelService) {
    throw new Error('yt-dlp kernel service is not initialized')
  }
  return kernelService
}

/**
 * Stop the process-wide kernel service when Electron exits.
 */
export function stopYtDlpKernelService(): void {
  kernelService?.stop()
}
