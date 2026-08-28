import { Copy, Maximize2, Minus, X } from 'lucide-react'
import type * as React from 'react'
import { cn } from '../../lib/cn'
import { Button } from './button'
import { DragRegion, NoDrag } from './drag-region'

interface TitleBarProps {
  platform?: string
  isMaximized?: boolean
  onMinimize?: () => void
  onMaximize?: () => void
  onClose?: () => void
  className?: string
  children?: React.ReactNode
  icons?: {
    minimize?: React.ComponentType<{ className?: string }>
    maximize?: React.ComponentType<{ className?: string }>
    restore?: React.ComponentType<{ className?: string }>
    close?: React.ComponentType<{ className?: string }>
  }
}

/**
 * Render the frameless window chrome, optionally hosting page header content.
 */
export function TitleBar({
  platform,
  isMaximized = false,
  onMinimize,
  onMaximize,
  onClose,
  className,
  children,
  icons
}: TitleBarProps) {
  const MinimizeIcon = icons?.minimize ?? Minus
  const MaximizeIcon = icons?.maximize ?? Maximize2
  const RestoreIcon = icons?.restore ?? Copy
  const CloseIcon = icons?.close ?? X

  const isMac = platform === 'darwin'
  const hasContent = Boolean(children)
  const macClass = hasContent ? 'h-12 items-center px-3' : 'h-10 items-center px-4'
  const windowsClass = hasContent ? 'min-h-12 items-center px-3 pt-3' : 'justify-end px-5 pt-4'
  const containerClass = cn(
    'flex bg-background',
    isMac ? macClass : windowsClass,
    hasContent && 'border-border/60 border-b',
    className
  )

  return (
    <DragRegion className={containerClass}>
      {hasContent ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      ) : isMac ? null : (
        <div className="flex-1" />
      )}
      {isMac ? null : (
        <NoDrag className="flex items-center gap-1">
          <Button
            className="h-8 w-8 hover:bg-muted"
            disabled={!onMinimize}
            onClick={onMinimize}
            size="icon"
            variant="ghost"
          >
            <MinimizeIcon className="h-4 w-4" />
          </Button>
          <Button
            className="h-8 w-8 hover:bg-muted"
            disabled={!onMaximize}
            onClick={onMaximize}
            size="icon"
            variant="ghost"
          >
            {isMaximized ? (
              <RestoreIcon className="h-4 w-4" />
            ) : (
              <MaximizeIcon className="h-4 w-4" />
            )}
          </Button>
          <Button
            className="h-8 w-8 hover:bg-red-500 hover:text-white"
            disabled={!onClose}
            onClick={onClose}
            size="icon"
            variant="ghost"
          >
            <CloseIcon className="h-4 w-4" />
          </Button>
        </NoDrag>
      )}
    </DragRegion>
  )
}

export type { TitleBarProps }
