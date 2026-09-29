import { ipcServices } from '@renderer/lib/ipc'
import { formatDimensions, formatMediaBytes, formatMediaDuration } from '@renderer/lib/media-format'
import type { DownloadRecord } from '@renderer/store/downloads'
import type { MediaAsset, MediaInventory } from '@shared/types/media-assets'
import { DownloadPlatformIcon } from '@vidbee/ui/components/ui/download-platform-icon'
import {
  downloadPlatformDisplayLabel,
  resolveDownloadPlatform
} from '@vidbee/ui/lib/download-platform'
import { FolderOpen } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface InfoRow {
  label: string
  value: ReactNode
}

function InfoSection({ rows, title }: { rows: InfoRow[]; title: string }) {
  if (rows.length === 0) {
    return null
  }
  return (
    <section>
      <h3 className="bg-muted/40 px-4 py-2 font-medium text-muted-foreground text-xs">{title}</h3>
      <dl className="divide-y divide-border/60">
        {rows.map((row) => (
          <div
            className="grid grid-cols-[6.5rem_1fr] gap-3 px-4 py-2.5 text-[13px]"
            key={row.label}
          >
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0 break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

const formatDate = (value: number | undefined, locale: string): string | null =>
  value ? new Date(value).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : null

interface MediaInfoPanelProps {
  download: DownloadRecord | null
  inventory: MediaInventory
  asset: MediaAsset | null
}

/** Download-level facts plus the selected file's details. */
export function MediaInfoPanel({ asset, download, inventory }: MediaInfoPanelProps) {
  const { i18n, t } = useTranslation()
  const rows = (entries: [string, ReactNode | null | undefined][]): InfoRow[] =>
    entries
      .filter(
        (entry): entry is [string, ReactNode] =>
          entry[1] !== null && entry[1] !== undefined && entry[1] !== ''
      )
      .map(([label, value]) => ({ label, value }))

  const platform = download ? resolveDownloadPlatform(download.url) : null
  const counts = inventory.counts
  const images = counts.image + counts.animated
  const summary = [
    images > 0 ? t('media.counts.images', { count: images }) : null,
    counts.video > 0 ? t('media.counts.videos', { count: counts.video }) : null,
    counts.audio > 0 ? t('media.counts.audio', { count: counts.audio }) : null
  ]
    .filter(Boolean)
    .join(' · ')

  const downloadRows = rows([
    [
      t('media.info.platform'),
      platform ? (
        <span className="inline-flex items-center gap-1.5" key="platform">
          <DownloadPlatformIcon className="block size-3.5" domain={platform.domain} />
          {downloadPlatformDisplayLabel(platform, {
            local: t('download.localSource'),
            other: t('download.otherSource')
          })}
        </span>
      ) : null
    ],
    [t('media.info.creator'), download?.uploader || download?.channel],
    [
      t('media.info.source'),
      download?.url && /^https?:/i.test(download.url) ? (
        <a
          className="text-primary hover:underline"
          href={download.url}
          key="source"
          rel="noopener noreferrer"
          target="_blank"
        >
          {download.url}
        </a>
      ) : null
    ],
    [t('media.info.contents'), summary || null],
    [
      t('media.info.totalSize'),
      inventory.totalSize > 0 ? formatMediaBytes(inventory.totalSize) : null
    ],
    [
      t('media.info.downloaded'),
      formatDate(download?.completedAt ?? download?.downloadedAt, i18n.language)
    ],
    [
      t('media.info.folder'),
      inventory.rootDirectory ? (
        <button
          className="inline-flex max-w-full items-start gap-1.5 text-left text-primary hover:underline"
          key="folder"
          onClick={() => void ipcServices.fs.openFile(inventory.rootDirectory as string)}
          type="button"
        >
          <FolderOpen className="mt-0.5 size-3.5 shrink-0" />
          <span className="break-all">{inventory.rootDirectory}</span>
        </button>
      ) : null
    ],
    [
      t('media.info.description'),
      download?.description ? (
        <p className="line-clamp-6 whitespace-pre-line text-muted-foreground" key="description">
          {download.description}
        </p>
      ) : null
    ]
  ])

  const assetRows = asset
    ? rows([
        [t('media.info.fileName'), asset.fileName],
        [t('media.info.type'), `${asset.ext.toUpperCase()} · ${t(`media.kind.${asset.kind}`)}`],
        [t('media.info.dimensions'), formatDimensions(asset.width, asset.height)],
        [t('media.info.duration'), asset.durationMs ? formatMediaDuration(asset.durationMs) : null],
        [t('media.info.fileSize'), formatMediaBytes(asset.size)],
        [t('media.info.modified'), formatDate(asset.mtimeMs, i18n.language)]
      ])
    : []

  return (
    <div className="h-full overflow-y-auto">
      <InfoSection rows={assetRows} title={t('media.info.fileSection')} />
      <InfoSection rows={downloadRows} title={t('media.info.downloadSection')} />
      {inventory.truncated ? (
        <p className="px-4 py-3 text-muted-foreground text-xs">{t('media.info.truncated')}</p>
      ) : null}
    </div>
  )
}
