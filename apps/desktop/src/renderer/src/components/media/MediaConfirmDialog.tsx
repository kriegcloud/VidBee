import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'

interface MediaConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  destructive?: boolean
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
}

/** Small confirmation used for trash and overwrite. Enter confirms. */
export function MediaConfirmDialog({
  cancelLabel,
  confirmLabel,
  description,
  destructive = false,
  onConfirm,
  onOpenChange,
  open,
  title
}: MediaConfirmDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            {cancelLabel}
          </Button>
          <Button
            autoFocus
            onClick={() => {
              onOpenChange(false)
              onConfirm()
            }}
            variant={destructive ? 'destructive' : 'default'}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
