import { Plus } from 'lucide-react'
import { useId } from 'react'
import { Button } from './button'
import { Label } from './label'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
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
}

/**
 * Popover for pasting a video URL and opening the supported-sites list.
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
  onConfirm
}: AddUrlPopoverProps) => {
  const textareaId = useId()

  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <PopoverTrigger asChild>
        <Button className="rounded-full" onClick={onTriggerClick}>
          <Plus className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] space-y-3">
        <div className="space-y-2">
          <Label htmlFor={textareaId}>{title}</Label>
          <Textarea
            autoFocus
            id={textareaId}
            onChange={(event) => {
              onValueChange(event.target.value.replace(/\r?\n/g, ''))
            }}
            placeholder={placeholder}
            rows={4}
            value={value}
          />
        </div>
        {invalidMessage ? <p className="text-destructive text-xs">{invalidMessage}</p> : null}
        <div className="flex items-center justify-end gap-2">
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
      </PopoverContent>
    </Popover>
  )
}
