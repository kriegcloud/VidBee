import { formatBytes } from '@renderer/components/settings/asr-model-shared'
import { formatClock } from '@renderer/lib/format-clock'
import { isAsrTierId } from '@vidbee/transcription/asr'
import { DownloadPlatformIcon } from '@vidbee/ui/components/ui/download-platform-icon'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

export interface TranscriptInfoFields {
  asrTier?: string | null
  audioCodec?: string | null
  channel?: string | null
  codec?: string | null
  completedAt?: number | null
  createdAt?: number | null
  description?: string | null
  downloadPath?: string | null
  downloadedAt?: number | null
  durationMs?: number
  fileName?: string | null
  fileSize?: number | null
  format?: string | null
  formatNote?: string | null
  fps?: string | null
  language?: string | null
  platformDomain?: string | null
  platformLabel?: string | null
  playlist?: string | null
  protocol?: string | null
  quality?: string | null
  segmentCount: number
  sourceKind?: 'asr' | 'captions' | null
  speakerCount: number
  startedAt?: number | null
  subscription?: string | null
  tags?: string | null
  url?: string | null
  videoCodec?: string | null
  views?: string | null
  width?: string | null
}

interface InfoRow {
  href?: string
  key: string
  label: string
  platformDomain?: string | null
  showPlatformIcon?: boolean
  value: string
}

/**
 * Take the last path segment from a local file path.
 */
export const fileNameFromPath = (path: string | null | undefined): string | null => {
  if (!path) {
    return null
  }
  const name = path.split(/[/\\]/).pop()?.trim()
  return name || null
}

/**
 * True when the string is an http(s) URL that can be opened in a browser.
 */
export const isRemoteHttpUrl = (url: string | null | undefined): url is string =>
  Boolean(url && /^https?:\/\//i.test(url))

/**
 * Resolve a BCP-47 tag to a locale-aware language name.
 */
export const languageDisplayName = (code: string, locale: string): string => {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

/**
 * True when at least one info field can be shown.
 */
export const hasTranscriptInfo = (info: TranscriptInfoFields): boolean =>
  Boolean(
    info.channel ||
      info.platformLabel ||
      info.playlist ||
      info.quality ||
      info.format ||
      info.codec ||
      info.description ||
      info.views ||
      info.tags ||
      info.downloadPath ||
      info.subscription ||
      (info.durationMs && info.durationMs > 0) ||
      info.fileName ||
      (info.fileSize && info.fileSize > 0) ||
      isRemoteHttpUrl(info.url) ||
      info.sourceKind ||
      info.asrTier ||
      info.language ||
      info.createdAt ||
      info.downloadedAt ||
      info.startedAt ||
      info.completedAt ||
      info.segmentCount > 0 ||
      info.speakerCount > 0
  )

/**
 * Media and transcript metadata for the workspace Info tab.
 */
export function TranscriptInfoPane(info: TranscriptInfoFields) {
  const { t, i18n } = useTranslation()
  const rows = useMemo(() => buildInfoRows(info, t, i18n.language), [i18n.language, info, t])
  if (rows.length === 0) {
    return <p className="px-4 py-6 text-muted-foreground text-sm">{t('transcript.info.empty')}</p>
  }

  return (
    <dl className="divide-y divide-border/50" data-testid="transcript-info">
      {rows.map((row) => (
        <div className="flex gap-3 px-4 py-2.5" key={row.key}>
          <dt className="w-28 shrink-0 pt-0.5 text-muted-foreground text-xs">{row.label}</dt>
          <dd className="min-w-0 flex-1 text-sm">
            {row.href ? (
              <a
                aria-label={t('transcript.info.openUrl')}
                className="wrap-break-word text-primary hover:underline"
                href={row.href}
                rel="noopener noreferrer"
                target="_blank"
              >
                {row.value}
              </a>
            ) : (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                {row.showPlatformIcon ? (
                  <DownloadPlatformIcon className="block size-3.5" domain={row.platformDomain} />
                ) : null}
                <span className="wrap-break-word">{row.value}</span>
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Build the visible Info tab rows from media and transcript fields.
 */
const buildInfoRows = (
  info: TranscriptInfoFields,
  t: (key: string, options?: Record<string, unknown>) => string,
  locale: string
): InfoRow[] => {
  const rows: InfoRow[] = []
  if (info.platformLabel) {
    rows.push({
      key: 'platform',
      label: t('download.metadata.platform'),
      platformDomain: info.platformDomain,
      showPlatformIcon: true,
      value: info.platformLabel
    })
  }
  if (info.channel) {
    rows.push({ key: 'channel', label: t('transcript.info.channel'), value: info.channel })
  }
  if (info.playlist) {
    rows.push({ key: 'playlist', label: t('download.metadata.playlist'), value: info.playlist })
  }
  if (info.durationMs && info.durationMs > 0) {
    rows.push({
      key: 'duration',
      label: t('transcript.info.duration'),
      value: formatClock(info.durationMs / 1000)
    })
  }
  if (info.quality) {
    rows.push({ key: 'quality', label: t('download.metadata.quality'), value: info.quality })
  }
  if (info.format) {
    rows.push({ key: 'format', label: t('download.metadata.format'), value: info.format })
  }
  if (info.codec) {
    rows.push({ key: 'codec', label: t('download.metadata.codec'), value: info.codec })
  }
  if (info.width) {
    rows.push({ key: 'width', label: t('download.metadata.width'), value: info.width })
  }
  if (info.fps) {
    rows.push({ key: 'fps', label: t('download.metadata.fps'), value: info.fps })
  }
  if (info.videoCodec) {
    rows.push({
      key: 'videoCodec',
      label: t('download.metadata.videoCodec'),
      value: info.videoCodec
    })
  }
  if (info.audioCodec) {
    rows.push({
      key: 'audioCodec',
      label: t('download.metadata.audioCodec'),
      value: info.audioCodec
    })
  }
  if (info.formatNote) {
    rows.push({
      key: 'formatNote',
      label: t('download.metadata.formatNote'),
      value: info.formatNote
    })
  }
  if (info.protocol) {
    rows.push({ key: 'protocol', label: t('download.metadata.protocol'), value: info.protocol })
  }
  if (info.sourceKind === 'captions' || info.sourceKind === 'asr') {
    rows.push({
      key: 'source',
      label: t('transcript.info.source'),
      value:
        info.sourceKind === 'captions' ? t('transcript.sourceCaptions') : t('transcript.sourceAi')
    })
  }
  if (info.sourceKind !== 'captions' && info.asrTier) {
    rows.push({
      key: 'model',
      label: t('transcript.info.model'),
      value: isAsrTierId(info.asrTier) ? t(`settings.asrTier.${info.asrTier}.title`) : info.asrTier
    })
  }
  if (info.language) {
    rows.push({
      key: 'language',
      label: t('transcript.info.language'),
      value: languageDisplayName(info.language, locale)
    })
  }
  if (info.speakerCount > 0) {
    rows.push({
      key: 'speakers',
      label: t('transcript.info.speakers'),
      value: String(info.speakerCount)
    })
  }
  if (info.segmentCount > 0) {
    rows.push({
      key: 'segments',
      label: t('transcript.info.segments'),
      value: String(info.segmentCount)
    })
  }
  if (info.fileName) {
    rows.push({ key: 'file', label: t('transcript.info.file'), value: info.fileName })
  }
  if (info.fileSize && info.fileSize > 0) {
    rows.push({
      key: 'fileSize',
      label: t('transcript.info.fileSize'),
      value: formatBytes(info.fileSize)
    })
  }
  if (info.downloadPath) {
    rows.push({
      key: 'downloadPath',
      label: t('download.metadata.downloadPath'),
      value: info.downloadPath
    })
  }
  if (isRemoteHttpUrl(info.url)) {
    rows.push({
      href: info.url,
      key: 'url',
      label: t('transcript.info.url'),
      value: info.url
    })
  }
  if (info.description) {
    rows.push({
      key: 'description',
      label: t('download.metadata.description'),
      value: info.description
    })
  }
  if (info.views) {
    rows.push({ key: 'views', label: t('download.metadata.views'), value: info.views })
  }
  if (info.tags) {
    rows.push({ key: 'tags', label: t('download.metadata.tags'), value: info.tags })
  }
  if (info.subscription) {
    rows.push({
      key: 'subscription',
      label: t('download.metadata.subscription'),
      value: info.subscription
    })
  }
  if (info.downloadedAt && info.downloadedAt > 0) {
    rows.push({
      key: 'downloadedAt',
      label: t('history.date'),
      value: new Date(info.downloadedAt).toLocaleString()
    })
  }
  if (info.startedAt && info.startedAt > 0) {
    rows.push({
      key: 'startedAt',
      label: t('download.metadata.startedAt'),
      value: new Date(info.startedAt).toLocaleString()
    })
  }
  if (info.completedAt && info.completedAt > 0) {
    rows.push({
      key: 'completedAt',
      label: t('download.metadata.completedAt'),
      value: new Date(info.completedAt).toLocaleString()
    })
  }
  if (info.createdAt && info.createdAt > 0) {
    rows.push({
      key: 'createdAt',
      label: t('transcript.info.createdAt'),
      value: new Date(info.createdAt).toLocaleString()
    })
  }
  return rows
}
