import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { scopedLoggers } from '../utils/logger'
import { resolveBundledResourcesPath } from './bundled-resources-path'

class GalleryDlManager {
  private binaryPath: string | null = null

  getPath(): string {
    if (!(this.binaryPath && fs.existsSync(this.binaryPath))) {
      this.binaryPath = this.resolvePath()
    }
    return this.binaryPath
  }

  private getBundledName(): string {
    if (process.platform === 'win32') {
      return 'gallery-dl.exe'
    }
    if (process.platform === 'darwin') {
      return 'gallery-dl_macos'
    }
    return 'gallery-dl_linux'
  }

  private resolvePath(): string {
    const override = process.env.GALLERY_DL_PATH?.trim()
    if (override) {
      if (!fs.existsSync(override)) {
        throw new Error(`GALLERY_DL_PATH does not exist: ${override}`)
      }
      return override
    }

    const bundledName = this.getBundledName()
    const resourcesPath = resolveBundledResourcesPath([bundledName])
    const bundledPath = path.join(resourcesPath, bundledName)
    if (fs.existsSync(bundledPath)) {
      if (os.platform() !== 'win32') {
        try {
          fs.chmodSync(bundledPath, 0o755)
        } catch (error) {
          scopedLoggers.engine.warn('Failed to set gallery-dl executable permission:', error)
        }
      }
      return bundledPath
    }

    try {
      const lookupCommand = process.platform === 'win32' ? 'where' : 'which'
      const candidates = execFileSync(lookupCommand, ['gallery-dl'], {
        stdio: ['ignore', 'pipe', 'ignore']
      })
        .toString()
        .split(/\r?\n/)
        .map((candidate) => candidate.trim())
        .filter(Boolean)
      const resolved = candidates.find((candidate) => fs.existsSync(candidate))
      if (resolved) {
        return resolved
      }
    } catch {
      // Fall through to the actionable error below.
    }

    throw new Error(
      `gallery-dl binary not found. Set GALLERY_DL_PATH or package ${bundledName} in resources.`
    )
  }
}

export const galleryDlManager = new GalleryDlManager()
