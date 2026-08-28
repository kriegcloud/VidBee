'use client'

import { AnimatePresence, motion } from 'framer-motion'
import type { RefObject } from 'react'
import {
  type ItemRect,
  useProximityHover,
  useRegisterProximityItem
} from '../../hooks/use-proximity-hover'
import { cn } from '../../lib/cn'
import { spring } from '../../lib/springs'

interface TravelingHighlightProps {
  itemRects: ItemRect[]
  isMeasured: boolean
  sessionRef: RefObject<number>
  selectedIndex: number | null
  hoveredIndex: number | null
  selectedClassName?: string
  hoverClassName?: string
  shapeClassName?: string
}

/**
 * Render the Fluid Functionalism traveling selected and hover backgrounds.
 *
 * @param props.itemRects Layout boxes for each registered nav item.
 * @param props.isMeasured Whether item rects match the current layout.
 * @param props.sessionRef Hover-session counter used to restart enter motion.
 * @param props.selectedIndex Index of the current item, or null.
 * @param props.hoveredIndex Index nearest the pointer, or null.
 * @param props.selectedClassName Fill classes for the selected overlay.
 * @param props.hoverClassName Fill classes for the hover overlay.
 * @param props.shapeClassName Corner radius classes shared by both overlays.
 */
function TravelingHighlight({
  itemRects,
  isMeasured,
  sessionRef,
  selectedIndex,
  hoveredIndex,
  selectedClassName = 'bg-primary/10',
  hoverClassName = 'bg-hover',
  shapeClassName = 'rounded-lg'
}: TravelingHighlightProps) {
  if (!isMeasured) {
    return null
  }

  const selectedRect = selectedIndex === null ? null : (itemRects[selectedIndex] ?? null)
  const hoverRect = hoveredIndex === null ? null : (itemRects[hoveredIndex] ?? null)

  return (
    <>
      <AnimatePresence>
        {selectedRect ? (
          <motion.div
            animate={{
              top: selectedRect.top,
              left: selectedRect.left,
              width: selectedRect.width,
              height: selectedRect.height,
              opacity: 1
            }}
            aria-hidden
            className={cn('pointer-events-none absolute z-0', shapeClassName, selectedClassName)}
            data-slot="traveling-highlight-selected"
            exit={{ opacity: 0, transition: spring.moderate.exit }}
            initial={false}
            transition={{ ...spring.moderate, opacity: { duration: 0.08 } }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {hoverRect ? (
          <motion.div
            animate={{
              opacity: 1,
              top: hoverRect.top,
              left: hoverRect.left,
              width: hoverRect.width,
              height: hoverRect.height
            }}
            aria-hidden
            className={cn('pointer-events-none absolute z-0', shapeClassName, hoverClassName)}
            data-slot="traveling-highlight-hover"
            exit={{ opacity: 0, transition: spring.fast.exit }}
            initial={{
              opacity: 0,
              top: selectedRect?.top ?? hoverRect.top,
              left: selectedRect?.left ?? hoverRect.left,
              width: selectedRect?.width ?? hoverRect.width,
              height: selectedRect?.height ?? hoverRect.height
            }}
            key={sessionRef.current}
            transition={{ ...spring.fast, opacity: { duration: 0.08 } }}
          />
        ) : null}
      </AnimatePresence>
    </>
  )
}

export type { ItemRect, TravelingHighlightProps }
export { TravelingHighlight, useProximityHover, useRegisterProximityItem }
