import { RemoteImage } from '@renderer/components/ui/remote-image'
import type { CSSProperties, ReactNode, Ref } from 'react'

export const SHARE_CARD_WIDTH = 540

/** Warm peach wash behind the quote, matching a Xiaoyuzhou-style poster. */
export const SHARE_CARD_WASH = '#d09468'

export const SHARE_CARD_THEME = {
  colorScheme: 'dark',
  backgroundColor: SHARE_CARD_WASH,
  color: '#ffffff',
  '--background': SHARE_CARD_WASH,
  '--foreground': '#ffffff',
  '--card': SHARE_CARD_WASH,
  '--card-foreground': '#ffffff',
  '--muted': '#44403c',
  '--muted-foreground': 'rgba(255,255,255,0.55)',
  '--border': 'rgba(255,255,255,0.2)',
  '--primary': '#ffffff'
} as CSSProperties

const COVER_FALLBACK = './app-icon.png'

interface TranscriptShareCardChromeProps {
  cardRef: Ref<HTMLDivElement>
  children: ReactNode
  coverSrc?: string | null
  durationLabel?: string
  progressRatio?: number
  sourceTitle?: string | null
  startLabel?: string
  tagline: string
  testId?: string
}

/**
 * Poster-style VidBee chrome snapdom captures as a shareable PNG.
 *
 * Full-bleed cover, quote body, playback bar, and brand footer.
 *
 * @param props.cardRef Root node passed to snapdom.
 * @param props.children Quote or prompt body.
 * @param props.coverSrc Cover URL; RemoteImage caches remote hosts for CSP.
 * @param props.durationLabel Total duration on the progress bar.
 * @param props.progressRatio Fill from 0 to 1 for the quote start.
 * @param props.sourceTitle Media title in the header.
 * @param props.startLabel Quote start time on the progress bar.
 * @param props.tagline One-line VidBee intro in the footer.
 * @param props.testId Optional test id on the captured root.
 */
export function TranscriptShareCardChrome({
  cardRef,
  children,
  coverSrc,
  durationLabel,
  progressRatio,
  sourceTitle,
  startLabel,
  tagline,
  testId
}: TranscriptShareCardChromeProps) {
  const title = sourceTitle?.trim() || ''
  const cover = coverSrc?.trim() || COVER_FALLBACK
  const ratio = progressRatio === undefined ? null : Math.min(1, Math.max(0, progressRatio))
  const showProgress = Boolean(startLabel && durationLabel)
  return (
    <div
      className="relative box-border overflow-hidden text-white"
      data-testid={testId}
      ref={cardRef}
      style={{ ...SHARE_CARD_THEME, width: SHARE_CARD_WIDTH }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="size-full origin-center scale-[2.2]"
          style={{ filter: 'blur(18px) saturate(1.32) brightness(1.12)' }}
        >
          <RemoteImage alt="" className="h-full w-full object-cover" src={cover} />
        </div>
        <div className="absolute inset-0 bg-[#e09a70]/34" />
        <div className="absolute inset-0 bg-black/12" />
      </div>
      <div className="relative flex flex-col gap-8 px-8 py-9">
        <header className="flex items-center gap-5">
          <div
            className="size-[72px] shrink-0 overflow-hidden rounded-[3px] bg-black/20 shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
            data-testid="transcript-share-card-cover"
          >
            <RemoteImage
              alt={title || 'VidBee'}
              className="h-full w-full object-cover"
              src={cover}
            />
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            {title ? (
              <p className="line-clamp-2 font-semibold text-[18px] leading-snug">{title}</p>
            ) : null}
          </div>
        </header>
        <div>{children}</div>
        {showProgress ? (
          <div>
            <div className="mb-2 flex items-center justify-between text-[13px] text-white tabular-nums">
              <span>{startLabel}</span>
              <span>{durationLabel}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/30">
              <div
                className="h-full rounded-full bg-white"
                style={{ width: `${Math.round((ratio ?? 0) * 1000) / 10}%` }}
              />
            </div>
          </div>
        ) : null}
        <footer className="flex items-center gap-4" data-testid="transcript-share-card-footer">
          <img
            alt="VidBee"
            className="size-14 rounded-xl"
            height={56}
            src="./app-icon.png"
            width={56}
          />
          <div>
            <p className="font-semibold text-[26px] leading-tight">VidBee</p>
            <p className="mt-1 whitespace-nowrap text-[14px] text-white/65 leading-snug">
              {tagline}
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}
