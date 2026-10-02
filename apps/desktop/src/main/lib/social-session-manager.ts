import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { resolveBrowserExecutable } from '@vidbee/browser-capture'
import { resolveSocialSource } from '@vidbee/downloader-core/social-media'
import { app } from 'electron'

type SocialSessionSite = 'x' | 'tiktok'

const site = (url: string): SocialSessionSite | null => {
  const platform = resolveSocialSource(url)?.platform
  return platform === 'x' || platform === 'tiktok' ? platform : null
}

class SocialSessionManager {
  private readonly loginBrowsers = new Map<SocialSessionSite, ChildProcess>()

  private directory(platform: SocialSessionSite): string {
    return path.join(app.getPath('userData'), 'social-sessions', platform, 'browser-session')
  }

  async open(url: string): Promise<void> {
    const platform = site(url)
    if (!platform) {
      throw new Error('A dedicated browser session is available for X and TikTok profiles.')
    }
    const executable = resolveBrowserExecutable('chrome')
    if (!executable) {
      throw new Error('Install Chrome or Chromium to sign in to this profile.')
    }
    const directory = this.directory(platform)
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const previous = this.loginBrowsers.get(platform)
    if (previous && previous.exitCode === null && previous.signalCode === null) {
      throw new Error('The dedicated login window is already open.')
    }
    const child = spawn(
      executable,
      [
        `--user-data-dir=${directory}`,
        '--no-first-run',
        platform === 'x' ? 'https://x.com/home' : 'https://www.tiktok.com/'
      ],
      { stdio: 'ignore' }
    )
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve)
      child.once('error', reject)
    })
    this.loginBrowsers.set(platform, child)
  }

  cookieArgs(url: string): readonly string[] | null {
    const platform = site(url)
    if (!platform) {
      return null
    }
    const directory = this.directory(platform)
    if (!existsSync(directory)) {
      return null
    }
    const child = this.loginBrowsers.get(platform)
    if (child && child.exitCode === null && child.signalCode === null) {
      throw new Error('Close the dedicated login window before mapping or downloading.')
    }
    return ['--cookies-from-browser', `chrome:${directory}`]
  }
}

export const socialSessionManager = new SocialSessionManager()
