import { formatBytes } from '@renderer/components/settings/asr-model-shared'
import { formatClock } from '@renderer/lib/format-clock'
import { isAsrTierId } from '@vidbee/transcription/asr'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

export interface TranscriptInfoFields {
  asrTier?: string | null
  channel?: string | null
  createdAt?: number | null
  durationMs?: number
  fileName?: string | null
  fileSize?: number | null
  language?: string | null
  segmentCount: number
  sourceKind?: 'asr' | 'captions' | null
  speakerCount: number
  url?: string | null
}

interface InfoRow {
  key: string
  label: string
  value: string
  href?: string
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
      (info.durationMs && info.durationMs > 0) ||
      info.fileName ||
      (info.fileSize && info.fileSize > 0) ||
      isRemoteHttpUrl(info.url) ||
      info.sourceKind ||
      info.asrTier ||
      info.language ||
      info.createdAt ||
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
    <dl className="divide-y divide-border/50">
      {rows.map((row) => (
        <div className="flex gap-3 px-4 py-2.5" key={row.key}>
          <dt className="w-24 shrink-0 pt-0.5 text-muted-foreground text-xs">{row.label}</dt>
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
              <span className="wrap-break-word">{row.value}</span>
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
  if (info.channel) {
    rows.push({ key: 'channel', label: t('transcript.info.channel'), value: info.channel })
  }
  if (info.durationMs && info.durationMs > 0) {
    rows.push({
      key: 'duration',
      label: t('transcript.info.duration'),
      value: formatClock(info.durationMs / 1000)
    })
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
  if (isRemoteHttpUrl(info.url)) {
    rows.push({
      href: info.url,
      key: 'url',
      label: t('transcript.info.url'),
      value: info.url
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
