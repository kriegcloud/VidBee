import type { Browser, Page } from 'playwright-core'
import type { PlaywrightCookie } from './cookies'
import { virtualDisplayEnv } from './display'
import { playbackPageUrl } from './drm'
import {
  evenSize,
  pinHighestQualityInPage,
  spoofLargePlayerBoxInPage,
  type DecodedQuality
} from './quality'

export interface PlaybackSession {
  waitUntilPlaying: () => Promise<DecodedQuality & { duration: number }>
  waitUntilEnded: (onProgress: (state: { currentTime: number; duration: number }) => void) => Promise<void>
  close: () => Promise<void>
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const PLAYING_TIMEOUT_MS = 60_000
const QUALITY_SETTLE_MS = 2500
const QUALITY_WAIT_MS = 12_000
const ENDED_SLACK_MS = 15_000

const hideChromeCss = `
html, body { background: #000 !important; overflow: hidden !important; margin: 0 !important; }
video {
  position: fixed !important;
  left: 0 !important;
  top: 0 !important;
  margin: 0 !important;
  max-width: none !important;
  max-height: none !important;
  object-fit: fill !important;
  background: #000 !important;
  z-index: 2147483647 !important;
}
`

const readMediaState = async (
  page: Page
): Promise<{ currentTime: number; duration: number; paused: boolean; ended: boolean } | null> => {
  return page.evaluate(() => {
    const video = document.querySelector('video')
    if (!video) {
      return null
    }
    return {
      currentTime: video.currentTime || 0,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      paused: video.paused,
      ended: video.ended
    }
  })
}

const waitForSettledQuality = async (page: Page, signal: AbortSignal): Promise<DecodedQuality> => {
  const deadline = Date.now() + QUALITY_WAIT_MS
  let best: DecodedQuality = { fps: 0, height: 0, method: 'none', width: 0 }
  let bestPixels = 0
  let stableSince = Date.now()
  while (Date.now() < deadline) {
    if (signal.aborted) {
      throw new Error('Capture cancelled')
    }
    const quality = await page.evaluate(pinHighestQualityInPage)
    const pixels = quality.width * quality.height
    if (pixels > bestPixels) {
      best = quality
      bestPixels = pixels
      stableSince = Date.now()
    } else if (bestPixels > 0 && Date.now() - stableSince >= QUALITY_SETTLE_MS) {
      break
    }
    await sleep(300)
  }
  if (best.width > 0 && best.height > 0) {
    return { ...best, ...evenSize(best.width, best.height) }
  }
  return best
}

/**
 * `--kiosk` only covers the first window, and Playwright opens each context in
 * a new one, so ask the browser to drop its tab strip and toolbar. Without
 * this the viewport (and the pinned video) starts below the browser chrome
 * while ffmpeg grabs from the screen origin.
 */
const enterWindowFullscreen = async (page: Page): Promise<void> => {
  try {
    const cdp = await page.context().newCDPSession(page)
    const { windowId } = await cdp.send('Browser.getWindowForTarget')
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'fullscreen' } })
    await cdp.detach()
  } catch {
    /* best effort: some builds refuse window control */
  }
}

/**
 * Launch headed Chromium on the virtual display, inject cookies, and play the
 * first media element so ffmpeg can record the composited (decrypted) frames.
 */
export const startPlayback = async (input: {
  url: string
  cookies: PlaywrightCookie[]
  localStorage?: Record<string, string>
  executablePath: string
  display: string
  pulseSink?: string
  width: number
  height: number
  signal: AbortSignal
}): Promise<PlaybackSession> => {
  const { chromium } = await import('playwright-core')
  const env = virtualDisplayEnv(process.env, input.display, input.pulseSink)

  const browser: Browser = await chromium.launch({
    executablePath: input.executablePath,
    headless: false,
    env,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--ozone-platform=x11',
      `--window-size=${input.width},${input.height}`,
      '--window-position=0,0',
      '--kiosk',
      '--start-fullscreen',
      '--no-first-run',
      '--noerrdialogs',
      '--disable-infobars',
      '--disable-session-crashed-bubble',
      '--disable-features=Translate,MediaRouter,AutomationControlled',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-blink-features=AutomationControlled',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--force-device-scale-factor=1',
      '--high-dpi-support=1'
    ]
  })

  const context = await browser.newContext({
    viewport: { width: input.width, height: input.height },
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true
  })
  await context.addInitScript(spoofLargePlayerBoxInPage)
  if (input.cookies.length > 0) {
    await context.addCookies(input.cookies)
  }
  if (input.localStorage && Object.keys(input.localStorage).length > 0) {
    const seed = input.localStorage
    await context.addInitScript((values: Record<string, string>) => {
      for (const [key, value] of Object.entries(values)) {
        try {
          window.localStorage.setItem(key, value)
        } catch {
          /* quota / disabled */
        }
      }
    }, seed)
  }

  const page = await context.newPage()
  await enterWindowFullscreen(page)
  const target = playbackPageUrl(input.url)
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await page.evaluate(() => {
    const mediaId = new URLSearchParams(window.location.search).get('media')
    if (!mediaId) {
      return
    }
    const match = Array.from(document.querySelectorAll('a, button, [role="button"]')).find(
      (element) => {
        const href = element.getAttribute('href') || ''
        return href.includes(mediaId) || element.innerHTML.includes(mediaId)
      }
    )
    if (match instanceof HTMLElement) {
      match.click()
    }
  })
  await page.waitForSelector('video', { timeout: 45_000 })
  await page.addStyleTag({ content: hideChromeCss })

  const throwIfAborted = (): void => {
    if (input.signal.aborted) {
      throw new Error('Capture cancelled')
    }
  }

  return {
    waitUntilPlaying: async () => {
      const deadline = Date.now() + PLAYING_TIMEOUT_MS
      while (Date.now() < deadline) {
        throwIfAborted()
        const state = await readMediaState(page)
        if (state && state.currentTime > 0.05 && !state.paused) {
          const quality = await waitForSettledQuality(page, input.signal)
          try {
            await page.evaluate(() => {
              const video = document.querySelector('video')
              if (video && video.currentTime > 0.4) {
                video.currentTime = 0
              }
            })
          } catch {
            /* DRM may block seeking */
          }
          const duration = state.duration > 0 ? state.duration : 0
          return { ...quality, duration }
        }
        await page.evaluate(pinHighestQualityInPage)
        await sleep(250)
      }
      throw new Error('Timed out waiting for in-browser playback to start')
    },
    waitUntilEnded: async (onProgress) => {
      const started = Date.now()
      let duration = 0
      while (true) {
        throwIfAborted()
        const state = await readMediaState(page)
        if (!state) {
          await sleep(250)
          continue
        }
        duration = state.duration > 0 ? state.duration : duration
        onProgress({ currentTime: state.currentTime, duration })
        if (state.ended || (duration > 0 && state.currentTime >= duration - 0.35)) {
          return
        }
        if (duration > 0 && Date.now() - started > duration * 1000 + ENDED_SLACK_MS) {
          return
        }
        await sleep(400)
      }
    },
    close: async () => {
      await context.close().catch(() => undefined)
      await browser.close().catch(() => undefined)
    }
  }
}
