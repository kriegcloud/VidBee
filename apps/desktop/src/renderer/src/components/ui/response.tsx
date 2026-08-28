import { RemoteImage } from '@renderer/components/ui/remote-image'
import { promptStreamdownPlugins } from '@renderer/components/ui/streamdown-plugins'
import { normalizePromptMarkdown } from '@renderer/lib/prompt-markdown'
import { cn } from '@renderer/lib/utils'
import { useTheme } from 'next-themes'
import { type ComponentProps, memo } from 'react'
import { type Components, type ExtraProps, Streamdown, type StreamdownProps } from 'streamdown'

const ORDERED_LIST_CLASS = 'list-outside list-decimal whitespace-normal ps-6 [li_&]:ps-6'
const UNORDERED_LIST_CLASS = 'list-outside list-disc whitespace-normal ps-6 [li_&]:ps-6'
const LIST_ITEM_CLASS = 'py-1 [&>:first-child]:mt-0 [&>p]:my-0 [&>p+p]:mt-1'

export type ResponseProps = StreamdownProps

/**
 * Ordered list with outside markers so the number stays on the first line
 * when a FAQ item wraps its title in a block paragraph.
 *
 * @param props Streamdown list props. `node` is stripped so it is not forwarded to the DOM.
 */
function MarkdownOl({
  children,
  className,
  node: _node,
  ...props
}: ComponentProps<'ol'> & ExtraProps) {
  return (
    <ol className={cn(ORDERED_LIST_CLASS, className)} data-streamdown="ordered-list" {...props}>
      {children}
    </ol>
  )
}

/**
 * Unordered list matching the ordered-list marker position.
 *
 * @param props Streamdown list props. `node` is stripped so it is not forwarded to the DOM.
 */
function MarkdownUl({
  children,
  className,
  node: _node,
  ...props
}: ComponentProps<'ul'> & ExtraProps) {
  return (
    <ul className={cn(UNORDERED_LIST_CLASS, className)} data-streamdown="unordered-list" {...props}>
      {children}
    </ul>
  )
}

/**
 * List item that keeps heading/paragraph margins from pushing the marker
 * onto its own line.
 *
 * @param props Streamdown list-item props. `node` is stripped so it is not forwarded to the DOM.
 */
function MarkdownLi({
  children,
  className,
  node: _node,
  ...props
}: ComponentProps<'li'> & ExtraProps) {
  return (
    <li className={cn(LIST_ITEM_CLASS, className)} data-streamdown="list-item" {...props}>
      {children}
    </li>
  )
}

/**
 * Cache remote markdown images so renderer CSP does not block non-YouTube hosts.
 *
 * @param props Streamdown image props. `node` is stripped so it is not forwarded to the DOM.
 */
function MarkdownImg({ alt, className, node: _node, src }: ComponentProps<'img'> & ExtraProps) {
  return (
    <RemoteImage
      alt={alt ?? ''}
      className={className}
      src={typeof src === 'string' ? src : undefined}
    />
  )
}

const LIST_COMPONENTS: Components = {
  img: MarkdownImg,
  ol: MarkdownOl,
  ul: MarkdownUl,
  li: MarkdownLi
}

/**
 * Map the app color scheme to a Mermaid diagram theme.
 *
 * @param theme Resolved next-themes value.
 */
function mermaidThemeForApp(theme: string | undefined): 'dark' | 'default' {
  return theme === 'dark' ? 'dark' : 'default'
}

/**
 * True when a parent re-render can skip painting. `children` is the streamed
 * markdown; `isAnimating` flips when the run ends.
 *
 * @param prev Previous props.
 * @param next Next props.
 */
function areResponsePropsEqual(prev: ResponseProps, next: ResponseProps): boolean {
  return prev.children === next.children && prev.isAnimating === next.isAnimating
}

/**
 * Streaming markdown renderer (ElevenLabs UI Response). Memoized wrapper
 * around Streamdown that trims first/last child margins and keeps FAQ
 * numbered items on one line.
 *
 * @see https://ui.elevenlabs.io/docs/components/response
 */
export const Response = memo(function Response({
  children,
  className,
  components,
  dir = 'auto',
  mermaid,
  plugins,
  shikiTheme = ['github-light', 'github-dark'],
  ...props
}: ResponseProps) {
  const { resolvedTheme } = useTheme()
  const content = typeof children === 'string' ? normalizePromptMarkdown(children) : children

  return (
    <Streamdown
      className={cn('size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0', className)}
      components={{ ...LIST_COMPONENTS, ...components }}
      dir={dir}
      mermaid={mermaid ?? { config: { theme: mermaidThemeForApp(resolvedTheme) } }}
      plugins={{ ...promptStreamdownPlugins, ...plugins }}
      shikiTheme={shikiTheme}
      {...props}
    >
      {content}
    </Streamdown>
  )
}, areResponsePropsEqual)
