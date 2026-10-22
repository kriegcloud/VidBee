import type { Browser, BrowserContext, Page, Response } from 'playwright-core'
import type { PlaywrightCookie } from './cookies'
import { capturePageUrl } from './drm'
import {
  type ChatVideoAttachment,
  chatVideoAttachments,
  chatVideoByOrdinal,
  onlyFansChatResponse
} from './onlyfans-profile'
import {
  type DecodedQuality,
  evenSize,
  pinHighestQualityInPage,
  spoofLargePlayerBoxInPage
} from './quality'
import { measureGrabOrigin } from './recorder'

export interface PlaybackSession {
  mediaId: string | null
  waitUntilPlaying: () => Promise<
    DecodedQuality & { duration: number; originX: number; originY: number }
  >
  waitUntilEnded: (
    onProgress: (state: { currentTime: number; duration: number }) => void
  ) => Promise<void>
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

export interface MediaClock {
  currentTime: number
  duration: number
  paused: boolean
  ended: boolean
}

/** Playback has started only after the media clock moves while the element is playing. */
export const playbackHasAdvanced = (state: MediaClock | null): boolean =>
  Boolean(state && state.currentTime > 0.05 && !state.paused)

/**
 * Resolves with the first clock sample that has advanced.
 * Staying at 0 until the deadline rejects.
 */
export const waitUntilPlaybackAdvances = async (
  read: () => Promise<MediaClock | null>,
  input: {
    timeoutMs: number
    signal: AbortSignal
    sleep: (ms: number) => Promise<void>
  }
): Promise<MediaClock> => {
  const deadline = Date.now() + input.timeoutMs
  while (Date.now() < deadline) {
    if (input.signal.aborted) {
      throw new Error('Capture cancelled')
    }
    const state = await read()
    if (state && playbackHasAdvanced(state)) {
      return state
    }
    await input.sleep(250)
  }
  throw new Error('Timed out waiting for in-browser playback to start')
}

const readMediaState = async (page: Page, expectedDuration = 0): Promise<MediaClock | null> => {
  return page.evaluate((expected) => {
    const videos = [...document.querySelectorAll('video')]
    const video =
      (expected > 0
        ? videos.find(
            (entry) => Number.isFinite(entry.duration) && Math.abs(entry.duration - expected) < 2
          )
        : undefined) ??
      videos.find((entry) => !entry.paused && entry.currentTime > 0) ??
      videos.find((entry) => entry.videoWidth > 0) ??
      videos[0]
    if (!video) {
      return null
    }
    return {
      currentTime: video.currentTime || 0,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      paused: video.paused,
      ended: video.ended
    }
  }, expectedDuration)
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
 * tsx compiles named helpers to `__name()` and Playwright sends that source into the page.
 * The page has no bundler runtime, so install the identity helper before any page script.
 */
const installPageNameHelper = async (context: BrowserContext): Promise<void> => {
  await context.addInitScript('globalThis.__name = (target) => target')
}

const browserArgs = (width: number, height: number): string[] => [
  `--window-size=${width},${height}`,
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
  '--high-dpi-support=1',
  '--ozone-platform=x11'
]

const clockLabels = (durationSec: number | null): string[] => {
  if (!durationSec || durationSec <= 0) {
    return []
  }
  const total = Math.round(durationSec)
  const minutes = Math.floor(total / 60)
  const seconds = String(total % 60).padStart(2, '0')
  const short = `${minutes}:${seconds}`
  const padded = `${String(minutes).padStart(2, '0')}:${seconds}`
  return short === padded ? [short] : [short, padded]
}

const attachmentNeedles = (video: ChatVideoAttachment): string[] => {
  const needles = [video.id]
  if (!video.previewPath) {
    return needles
  }
  needles.push(video.previewPath)
  const file = video.previewPath.split('/').pop() ?? ''
  for (const part of file.split(/[._]/)) {
    if (part.length >= 16) {
      needles.push(part)
    }
  }
  return needles
}

const listStartsAt = (payload: unknown, messageId: string | null): boolean => {
  if (!messageId) {
    return true
  }
  if (!payload || typeof payload !== 'object') {
    return false
  }
  const list = (payload as { list?: unknown }).list
  if (!Array.isArray(list) || list.length === 0) {
    return false
  }
  const first = list[0]
  if (!first || typeof first !== 'object') {
    return false
  }
  return String((first as { id?: unknown }).id ?? '') === messageId
}

/** First chat-message payload for this navigation. Prefer the page anchored at `firstId`. */
const waitForPresentedMessages = (
  page: Page,
  chatId: string,
  anchorId: string | null
): Promise<unknown> =>
  new Promise((resolve, reject) => {
    let first: unknown = null
    const finish = (payload: unknown): void => {
      clearTimeout(timer)
      page.off('response', onResponse)
      resolve(payload)
    }
    const timer = setTimeout(() => {
      page.off('response', onResponse)
      if (first) {
        resolve(first)
        return
      }
      reject(new Error('Timed out waiting for the chat message list'))
    }, 30_000)
    const onResponse = (response: Response): void => {
      let url: URL
      try {
        url = new URL(response.url())
      } catch {
        return
      }
      if (!(onlyFansChatResponse(url, chatId) && response.ok())) {
        return
      }
      void response
        .json()
        .then((body: unknown) => {
          first ??= body
          if (listStartsAt(body, anchorId)) {
            finish(body)
          }
        })
        .catch(() => undefined)
    }
    page.on('response', onResponse)
  })

/** Move the message carousel to this media id and click that slide. */
const openSwiperMedia = async (page: Page, mediaId: string): Promise<boolean> => {
  const stepToMedia = (id: string): { active: number; index: number } | null => {
    const handle = (
      element: Element
    ): {
      activeIndex: number
      virtual?: { slides?: Array<{ key?: string | number }> }
      slideNext?: () => void
      slideTo?: (index: number) => void
    } | null => (element as HTMLElement & { swiper?: ReturnType<typeof handle> }).swiper ?? null
    let found: { element: HTMLElement; swiper: NonNullable<ReturnType<typeof handle>> } | null =
      null
    for (const candidate of document.querySelectorAll('.b-slideshow')) {
      const swiper = handle(candidate)
      const slides = swiper?.virtual?.slides ?? []
      if (swiper && slides.some((slide) => String(slide?.key ?? '') === id)) {
        found = { element: candidate as HTMLElement, swiper }
        break
      }
    }
    if (!found?.swiper.slideNext) {
      return null
    }
    found.element.scrollIntoView({ block: 'center', inline: 'center' })
    const index = (found.swiper.virtual?.slides ?? []).findIndex(
      (slide) => String(slide?.key ?? '') === id
    )
    if (index < 0) {
      return null
    }
    if (found.swiper.activeIndex < index) {
      found.swiper.slideNext()
    } else if (found.swiper.activeIndex > index && found.swiper.slideTo) {
      found.swiper.slideTo(index)
    }
    return { active: found.swiper.activeIndex, index }
  }
  let landed = false
  for (let step = 0; step < 16; step += 1) {
    const state = await page.evaluate(stepToMedia, mediaId)
    if (!state) {
      await sleep(500)
      continue
    }
    if (state.active === state.index) {
      landed = true
      break
    }
    // One slide per turn. A jump mounts the wrong player; the carousel needs the animation to finish.
    await sleep(1500)
  }
  if (!landed) {
    return false
  }
  await sleep(400)
  const point = await page.evaluate((id: string) => {
    let element: HTMLElement | null = null
    for (const candidate of document.querySelectorAll('.b-slideshow')) {
      const swiper = (
        candidate as HTMLElement & {
          swiper?: { virtual?: { slides?: Array<{ key?: string | number }> } }
        }
      ).swiper
      if (swiper?.virtual?.slides?.some((slide) => String(slide?.key ?? '') === id)) {
        element = candidate as HTMLElement
        break
      }
    }
    const active = element?.querySelector('.swiper-slide-active img, .swiper-slide-active button')
    if (!(active instanceof HTMLElement)) {
      return null
    }
    active.scrollIntoView({ block: 'center', inline: 'center' })
    const box = active.getBoundingClientRect()
    if (box.width < 2 || box.height < 2) {
      return null
    }
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }, mediaId)
  if (!point) {
    return false
  }
  await page.mouse.click(point.x, point.y)
  return true
}

const clickAttachment = async (page: Page, video: ChatVideoAttachment): Promise<boolean> => {
  const point = await page.evaluate(
    ({ needles, labels }) => {
      const nodes = [...document.querySelectorAll('a, button, [role="button"], img, div, span')]
      const targetFor = (element: Element): HTMLElement | null => {
        const clickable = element.closest('button, a, [role="button"]')
        const chosen = clickable ?? element
        return chosen instanceof HTMLElement ? chosen : null
      }
      const boxOf = (element: HTMLElement): { x: number; y: number } | null => {
        element.scrollIntoView({ block: 'center', inline: 'center' })
        const box = element.getBoundingClientRect()
        if (box.width < 2 || box.height < 2) {
          return null
        }
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      }
      for (const needle of needles) {
        const match = nodes.find((element) =>
          [...element.attributes].some((attribute) => attribute.value.includes(needle))
        )
        const target = match ? targetFor(match) : null
        const box = target ? boxOf(target) : null
        if (box) {
          return box
        }
      }
      for (const label of labels) {
        const match = nodes.find((element) => (element.textContent ?? '').trim() === label)
        const target = match ? targetFor(match) : null
        const box = target ? boxOf(target) : null
        if (box) {
          return box
        }
      }
      return null
    },
    { needles: attachmentNeedles(video), labels: clockLabels(video.durationSec) }
  )
  if (!point) {
    return false
  }
  await page.mouse.click(point.x, point.y)
  return true
}

const assertPlayingDuration = async (
  page: Page,
  video: ChatVideoAttachment,
  signal: AbortSignal
): Promise<void> => {
  if (!video.durationSec) {
    return
  }
  const deadline = Date.now() + 15_000
  let duration = 0
  while (Date.now() < deadline) {
    if (signal.aborted) {
      throw new Error('Capture cancelled')
    }
    duration = (await readMediaState(page, video.durationSec ?? 0))?.duration ?? 0
    if (duration > 0) {
      break
    }
    await sleep(200)
  }
  if (duration > 0 && Math.abs(duration - video.durationSec) > 2) {
    throw new Error(
      `Playing duration ${duration}s does not match media ${video.id} (${video.durationSec}s)`
    )
  }
}

interface LaunchedBrowser {
  browser: Browser | null
  context: BrowserContext
  page: Page
  close: () => Promise<void>
}

const launchCaptureBrowser = async (input: {
  executablePath: string
  display: string
  pulseSink?: string
  width: number
  height: number
  userDataDir?: string
  cookies: PlaywrightCookie[]
  localStorage?: Record<string, string>
}): Promise<LaunchedBrowser> => {
  const { chromium } = await import('playwright-core')
  // The desktop session is Wayland. Leaving WAYLAND_DISPLAY set makes Chrome paint
  // there, so the Xvfb framebuffer x11grab records stays black.
  const { WAYLAND_DISPLAY: _waylandDisplay, ...sessionEnv } = process.env
  const env: NodeJS.ProcessEnv = {
    ...sessionEnv,
    DISPLAY: input.display,
    XDG_SESSION_TYPE: 'x11',
    GDK_BACKEND: 'x11'
  }
  if (input.pulseSink) {
    env.PULSE_SINK = input.pulseSink
  }
  const args = browserArgs(input.width, input.height)
  const closeBoth = async (context: BrowserContext, browser: Browser | null): Promise<void> => {
    await context.close().catch(() => undefined)
    await browser?.close().catch(() => undefined)
  }
  if (input.userDataDir) {
    const context = await chromium.launchPersistentContext(input.userDataDir, {
      executablePath: input.executablePath,
      headless: false,
      env,
      args,
      ignoreDefaultArgs: ['--enable-automation'],
      viewport: { width: input.width, height: input.height },
      deviceScaleFactor: 1,
      ignoreHTTPSErrors: true
    })
    await installPageNameHelper(context)
    await context.addInitScript(spoofLargePlayerBoxInPage)
    const page = context.pages()[0] ?? (await context.newPage())
    return { browser: null, context, page, close: () => closeBoth(context, null) }
  }
  const browser = await chromium.launch({
    executablePath: input.executablePath,
    headless: false,
    env,
    args,
    ignoreDefaultArgs: ['--enable-automation']
  })
  const context = await browser.newContext({
    viewport: { width: input.width, height: input.height },
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true
  })
  await installPageNameHelper(context)
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
  return { browser, context, page, close: () => closeBoth(context, browser) }
}

const preparePage = async (
  page: Page,
  input: {
    url: string
    videoOrdinal?: number
    signal: AbortSignal
    onLog?: (message: string) => void
  }
): Promise<{ mediaId: string | null; durationSec: number | null }> => {
  const target = capturePageUrl(input.url, input.videoOrdinal)
  const chatId = (() => {
    try {
      const parts = new URL(target).pathname.split('/').filter(Boolean)
      return parts[3] && /^\d+$/.test(parts[3]) ? parts[3] : null
    } catch {
      return null
    }
  })()
  const ordinal = input.videoOrdinal
  const onChat =
    Boolean(chatId) && new URL(target).pathname.replace(/\/$/, '') === `/my/chats/chat/${chatId}`
  const selecting = Boolean(ordinal && onChat)
  const anchorId = selecting ? new URL(target).searchParams.get('firstId') : null
  let presentedError: unknown = null
  const presented =
    selecting && chatId
      ? waitForPresentedMessages(page, chatId, anchorId).catch((error: unknown) => {
          presentedError = error
          return null
        })
      : null
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  if (!(selecting && ordinal && presented)) {
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
    return { mediaId: null, durationSec: null }
  }
  const payload = await presented
  if (!payload) {
    throw presentedError instanceof Error
      ? presentedError
      : new Error('Timed out waiting for the chat message list')
  }
  const videos = chatVideoAttachments(payload)
  input.onLog?.(
    `Chat videos: ${videos
      .map((video, index) => `${index + 1}:${video.id}:${video.durationSec ?? 0}`)
      .join(' ')}`
  )
  const video = chatVideoByOrdinal(payload, ordinal)
  if (!video) {
    throw new Error(`The chat message list has no video at position ${ordinal}`)
  }
  if (video.state === 'locked') {
    throw new Error(`Video ${ordinal} (${video.id}) is locked`)
  }
  input.onLog?.(`Recording OnlyFans media ${video.id}`)
  const opened = (await openSwiperMedia(page, video.id)) || (await clickAttachment(page, video))
  input.onLog?.(
    opened
      ? `Opened OnlyFans media ${video.id}`
      : `Could not click OnlyFans media ${video.id}; opening its gallery page`
  )
  if (!opened && chatId) {
    await page.goto(`https://onlyfans.com/my/chats/chat/${chatId}/gallery?media=${video.id}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000
    })
  }
  await page.waitForSelector('video', { timeout: 45_000 })
  await assertPlayingDuration(page, video, input.signal)
  await page.addStyleTag({ content: hideChromeCss })
  return { mediaId: video.id, durationSec: video.durationSec }
}

/**
 * Launch headed Chromium on the virtual display, inject cookies, and play the
 * first media element so ffmpeg can record the composited (decrypted) frames.
 * A chat `videoOrdinal` plays that video from the opened message list instead.
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
  userDataDir?: string
  videoOrdinal?: number
  ffmpegPath: string
  onLog?: (message: string) => void
}): Promise<PlaybackSession> => {
  const launched = await launchCaptureBrowser(input)
  const { page } = launched
  try {
    const selected = await preparePage(page, input)
    const mediaId = selected.mediaId
    const expectedDuration = selected.durationSec ?? 0

    const throwIfAborted = (): void => {
      if (input.signal.aborted) {
        throw new Error('Capture cancelled')
      }
    }

    return {
      mediaId,
      waitUntilPlaying: async () => {
        const state = await waitUntilPlaybackAdvances(
          () => readMediaState(page, expectedDuration),
          {
            timeoutMs: PLAYING_TIMEOUT_MS,
            signal: input.signal,
            sleep: async (ms) => {
              await page.evaluate(pinHighestQualityInPage).catch(() => undefined)
              await sleep(ms)
            }
          }
        )
        const quality = await waitForSettledQuality(page, input.signal)
        try {
          await page.evaluate((expected) => {
            const videos = [...document.querySelectorAll('video')]
            const video =
              (expected > 0
                ? videos.find(
                    (entry) =>
                      Number.isFinite(entry.duration) && Math.abs(entry.duration - expected) < 2
                  )
                : undefined) ??
              videos.find((entry) => !entry.paused && entry.currentTime > 0) ??
              videos[0]
            if (!video) {
              return
            }
            if (video.currentTime > 0.4) {
              video.currentTime = 0
            }
            void video.play()
          }, expectedDuration)
        } catch {
          /* DRM may block seeking */
        }
        const placed = await page.evaluate(
          ({ expected, width, height }: { expected: number; width: number; height: number }) => {
            const videos = [...document.querySelectorAll('video')]
            const video =
              (expected > 0
                ? videos.find(
                    (entry) =>
                      Number.isFinite(entry.duration) && Math.abs(entry.duration - expected) < 2
                  )
                : undefined) ??
              videos.find((entry) => entry.videoWidth > 0) ??
              videos[0]
            if (!video) {
              return null
            }
            // A transformed player traps position:fixed, so the element never reaches the viewport corner.
            document.documentElement.appendChild(video)
            video.style.position = 'fixed'
            video.style.left = '0'
            video.style.top = '0'
            video.style.margin = '0'
            video.style.opacity = '1'
            video.style.visibility = 'visible'
            video.style.zIndex = '2147483647'
            if (width > 0 && height > 0) {
              video.style.width = `${width}px`
              video.style.height = `${height}px`
            }
            const mark = document.createElement('div')
            mark.id = 'vidbee-grab-mark'
            mark.style.cssText =
              'position:fixed;left:0;top:0;width:8px;height:8px;background:#ff00ff;z-index:2147483647;pointer-events:none'
            document.documentElement.appendChild(mark)
            const rect = video.getBoundingClientRect()
            return {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            }
          },
          {
            expected: expectedDuration,
            width: quality.width,
            height: quality.height
          }
        )
        await sleep(200)
        const viewport = await measureGrabOrigin({
          ffmpegPath: input.ffmpegPath,
          display: input.display,
          scanWidth: input.width,
          scanHeight: input.height
        }).catch((error: unknown) => {
          input.onLog?.(
            `Grab origin scan failed: ${error instanceof Error ? error.message : String(error)}`
          )
          return { x: 0, y: 0 }
        })
        await page.evaluate(() => document.getElementById('vidbee-grab-mark')?.remove())
        const origin = {
          x: Math.max(0, Math.round(viewport.x + (placed?.x ?? 0))),
          y: Math.max(0, Math.round(viewport.y + (placed?.y ?? 0)))
        }
        if (placed && placed.width > 2 && placed.height > 2) {
          quality.width = Math.round(placed.width) - (Math.round(placed.width) % 2)
          quality.height = Math.round(placed.height) - (Math.round(placed.height) % 2)
        }
        input.onLog?.(
          `Grab origin ${origin.x},${origin.y} video ${quality.width}x${quality.height}`
        )
        const duration = state.duration > 0 ? state.duration : 0
        return { ...quality, duration, originX: origin.x, originY: origin.y }
      },
      waitUntilEnded: async (onProgress) => {
        const started = Date.now()
        let duration = 0
        while (true) {
          throwIfAborted()
          const state = await readMediaState(page, expectedDuration)
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
      close: launched.close
    }
  } catch (error) {
    await launched.close()
    throw error
  }
}
