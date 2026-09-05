import { type ListMarquee, listMarqueeStyle } from '../../lib/list-marquee'

interface ListMarqueeBoxProps {
  marquee: ListMarquee
}

/**
 * Finder-style selection rectangle over a list.
 */
export const ListMarqueeBox = ({ marquee }: ListMarqueeBoxProps) => {
  const box = listMarqueeStyle(marquee)
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-20 rounded-sm border border-primary/70 bg-primary/15"
      data-testid="list-marquee"
      style={{ height: box.height, left: box.left, top: box.top, width: box.width }}
    />
  )
}
