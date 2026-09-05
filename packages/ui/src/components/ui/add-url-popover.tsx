import { ChevronDown, FileAudio, Plus } from 'lucide-react'
import { useId } from 'react'
import { cn } from '../../lib/cn'
import { Button } from './button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from './dropdown-menu'
import { Label } from './label'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Switch } from './switch'
import { Textarea } from './textarea'

interface AddUrlPopoverProps {
  open: boolean
  value: string
  triggerLabel: string
  title: string
  placeholder: string
  cancelLabel: string
  confirmLabel: string
  confirmDisabled?: boolean
  invalidMessage?: string
  supportedSitesLabel?: string
  onOpenSupportedSites?: () => void
  onOpenChange: (open: boolean) => void
  onTriggerClick: () => void
  onValueChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
  onAddLocalMedia?: () => void
  addLocalMediaLabel?: string
  moreActionsLabel?: string
  oneClickDownloadEnabled?: boolean
  oneClickDownloadLabel?: string
  oneClickDownloadDescription?: string
  onToggleOneClickDownload?: () => void
}

/**
 * Popover for pasting a video URL, toggling one-click download, and opening supported sites.
 */
export const AddUrlPopover = ({
  open,
  value,
  triggerLabel,
  title,
  placeholder,
  cancelLabel,
  confirmLabel,
  confirmDisabled = false,
  invalidMessage,
  supportedSitesLabel,
  onOpenSupportedSites,
  onOpenChange,
  onTriggerClick,
  onValueChange,
  onCancel,
  onConfirm,
  onAddLocalMedia,
  addLocalMediaLabel,
  moreActionsLabel,
  oneClickDownloadEnabled = false,
  oneClickDownloadLabel,
  oneClickDownloadDescription,
  onToggleOneClickDownload
}: AddUrlPopoverProps) => {
  const textareaId = useId()
  const showLocalMenu = Boolean(onAddLocalMedia && addLocalMediaLabel && moreActionsLabel)

  return (
    <div className={showLocalMenu ? 'inline-flex overflow-hidden rounded-full' : 'contents'}>
      <Popover onOpenChange={onOpenChange} open={open}>
        <PopoverTrigger asChild>
          <Button
            className={cn(
              'h-[34px] px-3.5',
              showLocalMenu ? 'rounded-none rounded-l-full' : 'rounded-full'
            )}
            onClick={onTriggerClick}
          >
            <Plus className="h-4 w-4" />
            {triggerLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 p-5">
          <div className="flex flex-col gap-5">
            <div className="space-y-3">
              <Label className="font-semibold text-base leading-snug" htmlFor={textareaId}>
                {title}
              </Label>
              <Textarea
                autoFocus
                className="min-h-[4.5rem] resize-none"
                id={textareaId}
                onChange={(event) => {
                  onValueChange(event.target.value.replace(/\r?\n/g, ''))
                }}
                placeholder={placeholder}
                rows={3}
                value={value}
              />
            </div>
            {invalidMessage ? <p className="text-destructive text-xs">{invalidMessage}</p> : null}
            {onToggleOneClickDownload && oneClickDownloadLabel ? (
              <div className="flex items-center justify-between gap-4 rounded-md bg-muted/50 px-3.5 py-3">
                <div className="min-w-0 space-y-1.5">
                  <p className="font-medium text-sm leading-snug">{oneClickDownloadLabel}</p>
                  {oneClickDownloadDescription ? (
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      {oneClickDownloadDescription}
                    </p>
                  ) : null}
                </div>
                <Switch
                  aria-label={oneClickDownloadLabel}
                  checked={oneClickDownloadEnabled}
                  className="shrink-0"
                  data-testid="add-url-one-click"
                  label=""
                  onToggle={onToggleOneClickDownload}
                  size="compact"
                />
              </div>
            ) : null}
            <div className="flex items-center justify-end gap-2 border-border/60 border-t pt-3">
              {onOpenSupportedSites && supportedSitesLabel ? (
                <Button
                  className="mr-auto h-auto px-0 text-xs"
                  onClick={onOpenSupportedSites}
                  type="button"
                  variant="link"
                >
                  {supportedSitesLabel}
                </Button>
              ) : null}
              <Button onClick={onCancel} variant="outline">
                {cancelLabel}
              </Button>
              <Button disabled={confirmDisabled} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {showLocalMenu ? (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={moreActionsLabel}
              className="h-[34px] rounded-none border-primary-foreground/25 border-l px-2"
              data-testid="add-url-more"
              type="button"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              data-testid="add-local-media"
              onSelect={() => {
                onAddLocalMedia?.()
              }}
            >
              <FileAudio className="h-4 w-4" />
              {addLocalMediaLabel}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}
