import { Slot } from '@radix-ui/react-slot'
import * as React from 'react'
import { cn } from '../../lib/cn'

interface DragRegionProps extends React.ComponentProps<'div'> {
  asChild?: boolean
}

/**
 * Mark a region as a frameless-window drag handle.
 */
const DragRegion = React.forwardRef<HTMLDivElement, DragRegionProps>(
  ({ asChild = false, className, ...props }, ref) => {
    const Comp = asChild ? Slot : 'div'

    return (
      <Comp
        className={cn('drag-region select-none', className)}
        data-slot="drag-region"
        ref={ref}
        {...props}
      />
    )
  }
)
DragRegion.displayName = 'DragRegion'

/**
 * Exclude interactive controls from a parent window drag region.
 */
const NoDrag = React.forwardRef<HTMLDivElement, DragRegionProps>(
  ({ asChild = false, className, ...props }, ref) => {
    const Comp = asChild ? Slot : 'div'

    return <Comp className={cn('no-drag', className)} data-slot="no-drag" ref={ref} {...props} />
  }
)
NoDrag.displayName = 'NoDrag'

export type { DragRegionProps }
export { DragRegion, NoDrag }
