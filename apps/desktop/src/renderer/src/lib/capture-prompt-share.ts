import { SHARE_CARD_WASH } from '@renderer/components/transcript/TranscriptShareCardChrome'
import { snapdom } from '@zumer/snapdom'

/**
 * Wait for the next two animation frames so layout and paint can settle.
 */
const nextPaint = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })

/**
 * Wait until an image has finished loading or failed.
 *
 * @param image Image node inside the share card.
 */
const waitForImage = (image: HTMLImageElement): Promise<void> => {
  if (image.complete) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    const done = (): void => resolve()
    image.addEventListener('load', done, { once: true })
    image.addEventListener('error', done, { once: true })
    void image.decode().then(done).catch(done)
  })
}

/**
 * Decode images inside the share card so snapdom can paint them.
 *
 * @param element Root of the off-screen share card.
 */
const waitForImages = async (element: HTMLElement): Promise<void> => {
  await Promise.all([...element.querySelectorAll('img')].map((image) => waitForImage(image)))
}

/**
 * Rasterize a decoded image to a PNG data URL.
 *
 * Custom-protocol covers often taint the canvas; callers must fall back to fetch.
 *
 * @param image Decoded image node.
 * @returns Data URL when the canvas is readable.
 */
const decodedImageToDataUrl = (image: HTMLImageElement): string | null => {
  if (!(image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)) {
    return null
  }
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }
  context.drawImage(image, 0, 0)
  try {
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

/**
 * Read a blob as a data URL.
 *
 * @param blob Image bytes.
 */
const readBlobAsDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image blob'))
    reader.readAsDataURL(blob)
  })

/**
 * Fetch an image URL as a data URL for snapdom.
 *
 * @param src Image URL, including `vidbee://` cached covers.
 */
const fetchImageAsDataUrl = async (src: string): Promise<string | null> => {
  try {
    const response = await fetch(src)
    if (!response.ok) {
      return null
    }
    const blob = await response.blob()
    if (blob.size === 0) {
      return null
    }
    return await readBlobAsDataUrl(blob)
  } catch {
    return null
  }
}

/**
 * Rewrite card images to data URLs so snapdom does not re-fetch `vidbee://` covers.
 *
 * @param element Root of the off-screen share card.
 */
const inlineShareCardImages = async (element: HTMLElement): Promise<void> => {
  const images = [...element.querySelectorAll('img')]
  await Promise.all(
    images.map(async (image) => {
      const src = image.currentSrc || image.src
      if (!src || src.startsWith('data:')) {
        return
      }
      const dataUrl = decodedImageToDataUrl(image) ?? (await fetchImageAsDataUrl(src))
      if (!dataUrl) {
        return
      }
      image.src = dataUrl
      await waitForImage(image)
    })
  )
}

/**
 * Wait until fonts, images, and layout are ready to capture.
 *
 * @param element Root of the off-screen share card.
 */
export const waitForShareCard = async (element: HTMLElement): Promise<void> => {
  await waitForImages(element)
  await inlineShareCardImages(element)
  if (document.fonts?.ready) {
    await document.fonts.ready
  }
  await nextPaint()
}

/**
 * Build a filesystem-safe PNG name from a media title.
 *
 * @param title Source title shown on the share card.
 */
export const shareImageFileName = (title?: string | null): string => {
  const cleaned = (title?.trim() || 'VidBee')
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 80)
  return `${cleaned || 'VidBee'}.png`
}

/**
 * Rasterize the branded share card as a 2x PNG blob.
 *
 * @param element Root of the share card.
 */
export const captureShareImageBlob = async (element: HTMLElement): Promise<Blob> => {
  const blob = await snapdom.toBlob(element, {
    backgroundColor: SHARE_CARD_WASH,
    dpr: 2,
    embedFonts: true,
    type: 'png'
  })
  return blob.type === 'image/png' ? blob : new Blob([blob], { type: 'image/png' })
}

/**
 * Copy a PNG blob to the system clipboard.
 *
 * @param png PNG bytes from `captureShareImageBlob`.
 */
export const copyShareImageBlob = async (png: Blob): Promise<void> => {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
}

/**
 * Capture the branded prompt card and copy a PNG to the clipboard.
 *
 * @param element Root of the share card.
 */
export const copyPromptShareImage = async (element: HTMLElement): Promise<void> => {
  await copyShareImageBlob(await captureShareImageBlob(element))
}
