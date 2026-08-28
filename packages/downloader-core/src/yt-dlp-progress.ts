import type { TaskProgress } from '@vidbee/task-queue'

/**
 * Raw progress object emitted by yt-dlp-wrap-plus.
 *
 * The wrap regex copies `totalSize` (not `total`) and never fills
 * `downloaded`. Callers may also pass the names we use internally.
 */
export interface YtDlpProgressPayload {
  percent?: number
  currentSpeed?: string
  eta?: string
  downloaded?: string
  total?: string
  totalSize?: string
}

interface ParsedYtDlpProgress {
  percent: number | null
  bytesDownloaded: number | null
  bytesTotal: number | null
  speedBps: number | null
  etaMs: number | null
}

const SIDECAR_MAX_BYTES = 512 * 1024
const MEDIA_MIN_BYTES = 2 * 1024 * 1024
const LARGE_FILE_MIN_BYTES = 8 * 1024 * 1024
const NEW_STREAM_DROP = 0.2
const NEW_STREAM_MAX_PERCENT = 0.25
const NEW_STREAM_MIN_TOTAL_RATIO = 0.03
const NEW_STREAM_MAX_TOTAL_RATIO = 0.8
const LARGE_FILE_TAKEOVER_RATIO = 4

/**
 * Parse a yt-dlp-wrap progress event into TaskProgress units (percent 0..1).
 *
 * Rejects wrap false-positives such as `Downloading 234 fragments of 234`,
 * which `parseFloat` turns into NaN.
 */
export function parseYtDlpProgressPayload(payload: YtDlpProgressPayload): ParsedYtDlpProgress {
  const rawPercent = payload.percent
  const percent =
    typeof rawPercent === 'number' && Number.isFinite(rawPercent) && rawPercent >= 0
      ? Math.max(0, Math.min(1, rawPercent / 100))
      : null
  const bytesTotal = parseSize(payload.totalSize ?? payload.total)
  const explicitDownloaded = parseSize(payload.downloaded)
  const bytesDownloaded =
    explicitDownloaded ??
    (percent != null && bytesTotal != null ? Math.round(bytesTotal * percent) : null)
  return {
    percent,
    bytesDownloaded,
    bytesTotal,
    speedBps: parseSpeed(payload.currentSpeed),
    etaMs: parseEtaMs(payload.eta)
  }
}

/**
 * Fold per-file / per-fragment yt-dlp percents into a single overall
 * TaskProgress that does not jump backwards in the UI.
 *
 * yt-dlp-wrap-plus reports the current output file (video, then audio,
 * then sidecars) and HLS/DASH estimates can revise the total, so a raw
 * passthrough makes the bar bounce while the download is still heading
 * toward 100%.
 */
export class DownloadProgressAggregator {
  private highWater = 0
  private maxTotal = 0
  private completedBytes = 0
  private currentDownloaded = 0
  private currentTotal: number | null = null
  private ticks = 0

  /**
   * Apply one wrap progress event. Returns null when the event is junk
   * and the previous overall progress should be kept.
   */
  apply(payload: YtDlpProgressPayload): TaskProgress | null {
    const parsed = parseYtDlpProgressPayload(payload)
    if (parsed.percent == null) {
      return null
    }

    const total = parsed.bytesTotal
    const downloaded = parsed.bytesDownloaded

    if (total != null && total <= SIDECAR_MAX_BYTES) {
      if (total > this.maxTotal && this.maxTotal < LARGE_FILE_MIN_BYTES) {
        this.maxTotal = total
      }
      return this.snapshot(parsed, this.highWater)
    }

    if (this.isLargeFileTakeover(total)) {
      this.completedBytes = 0
      this.currentDownloaded = downloaded ?? 0
      this.currentTotal = total
      this.maxTotal = total ?? this.maxTotal
      this.highWater = parsed.percent
      return this.snapshot(parsed, this.highWater)
    }

    const startedNewStream = this.isNewMediaStream(parsed.percent, total)
    if (startedNewStream) {
      const finished = Math.max(this.currentDownloaded, this.currentTotal ?? this.currentDownloaded)
      this.completedBytes += finished
      this.currentDownloaded = downloaded ?? 0
      this.currentTotal = total
      if (total != null && total > this.maxTotal) {
        this.maxTotal = total
      }
    } else {
      this.rememberCurrentFile(total, downloaded)
    }

    if (
      parsed.percent >= 0.99 &&
      (total == null || total < LARGE_FILE_MIN_BYTES) &&
      this.maxTotal < LARGE_FILE_MIN_BYTES
    ) {
      return this.snapshot(parsed, this.highWater)
    }

    const candidate = this.overallPercent(parsed.percent)
    // A new audio/video stream is allowed one small dip so the bar can
    // represent remaining bytes instead of freezing at 100%.
    this.highWater = startedNewStream ? candidate : Math.max(this.highWater, candidate)
    return this.snapshot(parsed, this.highWater)
  }

  /** Overall 0..1 from accumulated bytes, or the current file percent. */
  private overallPercent(fallback: number): number {
    const overallTotal = this.completedBytes + (this.currentTotal ?? 0)
    if (overallTotal <= 0) {
      return fallback
    }
    return (this.completedBytes + this.currentDownloaded) / overallTotal
  }

  /** Remember the largest total and current-file byte counters. */
  private rememberCurrentFile(total: number | null, downloaded: number | null): void {
    if (total != null && total > this.maxTotal) {
      this.maxTotal = total
    }
    // Fragments report a tiny total; never let that replace the media file.
    if (total != null && (this.currentTotal == null || total >= this.currentTotal)) {
      this.currentTotal = total
    }
    if (downloaded != null) {
      this.currentDownloaded = Math.max(this.currentDownloaded, downloaded)
    }
  }

  /**
   * True when a much larger file appears after a thumbnail/json sidecar so
   * we should follow the media file instead of keeping a fake 100%.
   */
  private isLargeFileTakeover(total: number | null): boolean {
    return (
      total != null &&
      total >= LARGE_FILE_MIN_BYTES &&
      (this.maxTotal === 0 || total > this.maxTotal * LARGE_FILE_TAKEOVER_RATIO)
    )
  }

  /**
   * True when video finished and a substantial next file (usually audio)
   * starts at ~0%. Fragments of a known large file do not match.
   */
  private isNewMediaStream(percent: number, total: number | null): boolean {
    if (this.highWater - percent < NEW_STREAM_DROP || percent > NEW_STREAM_MAX_PERCENT) {
      return false
    }
    if (total == null || this.currentTotal == null) {
      return false
    }
    return (
      total >= MEDIA_MIN_BYTES &&
      total >= this.maxTotal * NEW_STREAM_MIN_TOTAL_RATIO &&
      total < this.currentTotal * NEW_STREAM_MAX_TOTAL_RATIO
    )
  }

  /** Build a TaskProgress snapshot, bumping the tick counter. */
  private snapshot(parsed: ParsedYtDlpProgress, percent: number): TaskProgress {
    this.ticks += 1
    const bytesDownloaded = this.completedBytes + this.currentDownloaded
    const currentTotal = this.currentTotal
    const bytesTotal = currentTotal == null ? null : this.completedBytes + currentTotal
    return {
      percent: Math.max(0, Math.min(1, percent)),
      bytesDownloaded: bytesDownloaded > 0 ? bytesDownloaded : parsed.bytesDownloaded,
      bytesTotal: bytesTotal != null && bytesTotal > 0 ? bytesTotal : parsed.bytesTotal,
      speedBps: parsed.speedBps,
      etaMs: parsed.etaMs,
      ticks: this.ticks
    }
  }
}

/** Parse a yt-dlp size token such as `1.55MiB` or `512KiB`. */
export function parseSize(value: string | undefined): number | null {
  if (!value) {
    return null
  }
  const m = /([0-9]+(?:\.[0-9]+)?)\s*(B|KB|KiB|MB|MiB|GB|GiB|TB|TiB)/i.exec(value)
  if (!m) {
    return null
  }
  const n = Number.parseFloat(m[1] ?? '')
  if (!Number.isFinite(n)) {
    return null
  }
  const unit = (m[2] ?? 'B').toLowerCase()
  const factor =
    unit === 'kb' || unit === 'kib'
      ? 1024
      : unit === 'mb' || unit === 'mib'
        ? 1024 ** 2
        : unit === 'gb' || unit === 'gib'
          ? 1024 ** 3
          : unit === 'tb' || unit === 'tib'
            ? 1024 ** 4
            : 1
  return Math.round(n * factor)
}

/** Parse a yt-dlp speed token such as `1.55MiB/s`. */
export function parseSpeed(value: string | undefined): number | null {
  if (!value) {
    return null
  }
  const cleaned = value.replace(/\/s$/i, '').trim()
  return parseSize(cleaned)
}

/** Parse a yt-dlp ETA token (`MM:SS` or `HH:MM:SS`) into milliseconds. */
export function parseEtaMs(value: string | undefined): number | null {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed || trimmed === 'Unknown') {
    return null
  }
  const parts = trimmed.split(':').map((p) => Number.parseInt(p, 10))
  if (parts.some((n) => !Number.isFinite(n))) {
    return null
  }
  let seconds = 0
  for (const p of parts) {
    seconds = seconds * 60 + p
  }
  return seconds * 1000
}
