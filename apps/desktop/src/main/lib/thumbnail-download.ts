import { randomUUID } from 'node:crypto'
import { rename, rm, writeFile } from 'node:fs/promises'

const MAX_THUMBNAIL_BYTES = 10 * 1024 * 1024
const THUMBNAIL_TIMEOUT_MS = 15_000
const MAX_CONCURRENT_FETCHES = 4
let activeFetches = 0
const waiting: (() => void)[] = []

/** Fetch small images with a deadline, a streaming byte cap, and bounded concurrency. */
export const fetchThumbnail = async (
  url: string,
  options: { maxBytes?: number; timeoutMs?: number } = {}
): Promise<{ buffer: Buffer; contentType: string | null }> => {
  if (activeFetches >= MAX_CONCURRENT_FETCHES) {
    await new Promise<void>((resolve) => waiting.push(resolve))
  } else {
    activeFetches++
  }
  try {
    const maxBytes = options.maxBytes ?? MAX_THUMBNAIL_BYTES
    const response = await fetch(url, {
      signal: AbortSignal.timeout(options.timeoutMs ?? THUMBNAIL_TIMEOUT_MS)
    })
    const contentType = response.headers.get('content-type')
    const length = Number(response.headers.get('content-length'))
    if (
      !response.ok ||
      length > maxBytes ||
      (contentType &&
        !contentType.toLowerCase().startsWith('image/') &&
        !contentType.toLowerCase().startsWith('application/octet-stream'))
    ) {
      await response.body?.cancel()
      throw new Error(`Invalid thumbnail response (${response.status})`)
    }
    if (!response.body) {
      throw new Error('Thumbnail response has no body')
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let bytes = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) {
          break
        }
        bytes += chunk.value.byteLength
        if (bytes > maxBytes) {
          throw new Error('Thumbnail exceeds size limit')
        }
        chunks.push(chunk.value)
      }
      if (bytes === 0) {
        throw new Error('Thumbnail response is empty')
      }
      return { buffer: Buffer.concat(chunks, bytes), contentType }
    } finally {
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  } finally {
    const next = waiting.shift()
    if (next) {
      next()
    } else {
      activeFetches--
    }
  }
}

/** Publish a complete thumbnail without leaving partial files at the cache key. */
export const writeThumbnailAtomically = async (
  destination: string,
  buffer: Buffer
): Promise<void> => {
  const temporary = `${destination}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, buffer, { flag: 'wx' })
    await rename(temporary, destination)
  } finally {
    await rm(temporary, { force: true })
  }
}
