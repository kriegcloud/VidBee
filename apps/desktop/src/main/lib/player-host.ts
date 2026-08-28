import { existsSync } from 'node:fs'
import path from 'node:path'
import type { PlayerAttachInput, PlayerAttachResult } from '@shared/types/player'
import { app } from 'electron'
import { isNativelyPlayableAudio } from '../../shared/utils/native-playable'
import { scopedLoggers } from '../utils/logger'
import { ffmpegManager } from './ffmpeg-manager'
import { preparePlayableMedia } from './playable-media'

const logger = scopedLoggers.player

/**
 * Directory for remuxed/transcoded previews. The renderer loads them as `file://`,
 * same as already-playable MP4 downloads.
 */
const previewCacheDir = (): string => path.join(app.getPath('userData'), 'html5-preview')

/**
 * Prepare a Chromium-playable local file for the in-page Video.js player.
 */
class PlayerHost {
  private attachGeneration = 0

  /**
   * Remux or transcode a local file so Video.js can play it in-page.
   */
  async attach(input: PlayerAttachInput): Promise<PlayerAttachResult> {
    const generation = ++this.attachGeneration
    if (!existsSync(input.filePath)) {
      throw new Error(`Media file is missing: ${input.filePath}`)
    }
    if (isNativelyPlayableAudio(input.filePath)) {
      logger.info('Prepared in-page media:', 'original', input.filePath)
      return { playablePath: input.filePath }
    }

    await ffmpegManager.ensureInitialized()
    try {
      const prepared = await preparePlayableMedia(ffmpegManager.getPath(), input.filePath, {
        cacheDir: previewCacheDir()
      })
      if (generation !== this.attachGeneration) {
        return { playablePath: prepared.playablePath }
      }
      logger.info('Prepared in-page media:', prepared.mode, prepared.playablePath)
      return { playablePath: prepared.playablePath }
    } catch (error) {
      logger.warn('Failed to prepare in-page media:', input.filePath, error)
      throw error
    }
  }

  /**
   * Cancel an in-flight prepare when leaving the transcript page.
   */
  async detach(): Promise<void> {
    this.attachGeneration += 1
  }

  /**
   * Cancel work during app shutdown.
   */
  async dispose(): Promise<void> {
    this.attachGeneration += 1
  }
}

let playerHost: PlayerHost | null = null

/**
 * Return the process-wide player host, creating it on first use.
 */
export const getPlayerHost = (): PlayerHost => {
  if (!playerHost) {
    playerHost = new PlayerHost()
  }
  return playerHost
}

/**
 * Dispose the process-wide player host during app shutdown.
 */
export const stopPlayerHost = async (): Promise<void> => {
  const host = playerHost
  playerHost = null
  await host?.dispose()
}
