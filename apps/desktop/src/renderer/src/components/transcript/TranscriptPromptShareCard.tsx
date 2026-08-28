import { TranscriptShareCardChrome } from '@renderer/components/transcript/TranscriptShareCardChrome'
import { Response } from '@renderer/components/ui/response'
import type { Ref } from 'react'

interface TranscriptPromptShareCardProps {
  cardRef: Ref<HTMLDivElement>
  coverSrc?: string | null
  markdown: string
  promptTitle: string
  sourceTitle?: string | null
  tagline: string
}

/**
 * Poster share card snapdom captures as a shareable PNG.
 *
 * @param props.cardRef Root node passed to snapdom.
 * @param props.coverSrc Cover URL; RemoteImage caches remote hosts for CSP.
 * @param props.markdown Prompt result markdown.
 * @param props.promptTitle Visible prompt name.
 * @param props.sourceTitle Media title in the header.
 * @param props.tagline One-line VidBee intro in the footer.
 */
export function TranscriptPromptShareCard({
  cardRef,
  coverSrc,
  markdown,
  promptTitle,
  sourceTitle,
  tagline
}: TranscriptPromptShareCardProps) {
  return (
    <TranscriptShareCardChrome
      cardRef={cardRef}
      coverSrc={coverSrc}
      sourceTitle={sourceTitle}
      tagline={tagline}
    >
      {promptTitle ? (
        <p className="mb-3 font-medium text-[15px] text-white/70">{promptTitle}</p>
      ) : null}
      <div className="text-white [&_*]:text-white">
        <Response
          className="text-[16px] leading-relaxed"
          isAnimating={false}
          mermaid={{ config: { theme: 'dark' } }}
          shikiTheme={['github-dark', 'github-dark']}
        >
          {markdown}
        </Response>
      </div>
    </TranscriptShareCardChrome>
  )
}
