'use client'

import { GripVerticalIcon } from 'lucide-react'
import type * as React from 'react'
import * as ResizablePrimitive from 'react-resizable-panels'
import { cn } from '../../lib/cn'

/**
 * Lay out sibling panels in a row or column that can be resized.
 */
function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Group>) {
  return (
    <ResizablePrimitive.Group
      className={cn('flex h-full w-full aria-[orientation=vertical]:flex-col', className)}
      data-slot="resizable-panel-group"
      {...props}
    />
  )
}

/**
 * Wrap one pane of a resizable group.
 */
function ResizablePanel({ ...props }: React.ComponentProps<typeof ResizablePrimitive.Panel>) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

/**
 * Drag target between panels. Cursor is set in CSS because Electron often
 * skips the library's adopted-stylesheet hover cursor.
 */
function ResizableHandle({
  withHandle,
  autoHide,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator> & {
  autoHide?: boolean
  withHandle?: boolean
}) {
  return (
    <ResizablePrimitive.Separator
      className={cn(
        'group relative z-10 flex cursor-ew-resize items-center justify-center focus-visible:outline-hidden aria-[orientation=horizontal]:cursor-ns-resize',
        autoHide
          ? '-mx-2 w-4 bg-transparent aria-[orientation=horizontal]:mx-0 aria-[orientation=horizontal]:-my-2 aria-[orientation=horizontal]:h-4 aria-[orientation=horizontal]:w-full'
          : 'w-px bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2',
        '[&[aria-orientation=horizontal]>div]:rotate-90',
        className
      )}
      data-slot="resizable-handle"
      {...props}
    >
      {autoHide ? (
        <div
          className="pointer-events-none z-10 h-12 w-1.5 rounded-full bg-neutral-400 opacity-0 shadow-sm transition-[opacity,height,width,background-color] duration-200 group-hover:h-14 group-hover:w-2 group-hover:bg-neutral-500 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[separator=active]:h-14 group-data-[separator=active]:w-2 group-data-[separator=active]:bg-neutral-600 group-data-[separator=active]:opacity-100 group-data-[separator=focus]:opacity-100 dark:bg-neutral-300 dark:group-hover:bg-neutral-200 dark:group-data-[separator=active]:bg-white"
          data-slot="resize-thumb"
        />
      ) : withHandle ? (
        <div className="z-10 flex h-4 w-3 items-center justify-center rounded-xs border bg-border">
          <GripVerticalIcon className="size-2.5" />
        </div>
      ) : null}
    </ResizablePrimitive.Separator>
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
