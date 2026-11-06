import {
  downloadPlatformDisplayLabel,
  resolveDownloadPlatform
} from '@vidbee/ui/lib/download-platform'
import i18n from 'i18next'
import type { DownloadRecord } from '../store/downloads'

const URL_TITLE = /^(?:[a-z][a-z\d+.-]*:\/\/|www\.)/i
const FILE_EXTENSION = /\.[^.]+$/
/** A filename such as `2` or `07` is a counter, not a title. */
const UNTITLED_BASENAME = /^[\d\s._-]*$/
const MIN_BASENAME_LENGTH = 3
const ID_PREVIEW_LENGTH = 8

/** Resolve a human-readable media title without ever using the source URL as a title. */
export const downloadDisplayTitle = (
  download: Pick<DownloadRecord, 'title' | 'url' | 'savedFileName'>,
  metadataTitle?: string | null
): string => {
  for (const candidate of [download.title, metadataTitle]) {
    const title = candidate?.trim()
    if (title && title !== download.url && !URL_TITLE.test(title)) {
      return title
    }
  }
  const basename = download.savedFileName?.split(/[\\/]/).pop()?.replace(FILE_EXTENSION, '').trim()
  if (
    basename &&
    basename.length >= MIN_BASENAME_LENGTH &&
    !UNTITLED_BASENAME.test(basename) &&
    !URL_TITLE.test(basename)
  ) {
    return basename
  }
  const platform = resolveDownloadPlatform(download.url)
  const source = downloadPlatformDisplayLabel(platform, {
    local: i18n.t('download.localSource', 'Local'),
    other: i18n.t('download.otherSource', 'Other')
  })
  try {
    const url = new URL(download.url)
    const segments = url.pathname.split('/').filter(Boolean)
    const id = segments.at(-1)
    const kind = segments.length > 1 ? segments.at(-2) : undefined
    if (id && kind) {
      const shortId = id.length > ID_PREVIEW_LENGTH ? `${id.slice(0, ID_PREVIEW_LENGTH)}…` : id
      return `${source} · ${kind} ${shortId}`
    }
    const detail = `${url.hostname}${id ? `/${id}` : ''}`
    return `${source} · ${detail.length > 48 ? `${detail.slice(0, 45)}…` : detail}`
  } catch {
    return `${source} · —`
  }
}
