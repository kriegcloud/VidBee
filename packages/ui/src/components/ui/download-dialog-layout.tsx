import { Instagram, List, Rocket, Video } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Button } from './button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './dialog'
import { TabItem, TabPanel, Tabs, TabsList } from './tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

/** Chip/list/button radius for the download dialog — never larger than rounded-md. */
export const downloadDialogRadius = 'rounded-md'

interface DownloadDialogLayoutProps {
  open: boolean
  lockDialogHeight: boolean
  oneClickDownloadEnabled: boolean
  oneClickTooltip: string
  activeTab: 'single' | 'playlist' | 'profile'
  dialogTitle: string
  dialogSubtitle: string
  singleTabLabel: string
  playlistTabLabel: string
  profileTabLabel: string
  addUrlPopover: ReactNode
  singleTabContent: ReactNode
  playlistTabContent: ReactNode
  profileTabContent: ReactNode
  footer: ReactNode
  onOpenChange: (open: boolean) => void
  onToggleOneClickDownload: () => void
  onActiveTabChange: (tab: 'single' | 'playlist' | 'profile') => void
}

/**
 * Download dialog chrome modeled on a title / chips / preview / footer card.
 */
export const DownloadDialogLayout = ({
  open,
  lockDialogHeight,
  oneClickDownloadEnabled,
  oneClickTooltip,
  activeTab,
  dialogTitle,
  dialogSubtitle,
  singleTabLabel,
  playlistTabLabel,
  profileTabLabel,
  addUrlPopover,
  singleTabContent,
  playlistTabContent,
  profileTabContent,
  footer,
  onOpenChange,
  onToggleOneClickDownload,
  onActiveTabChange
}: DownloadDialogLayoutProps) => {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <div className="flex items-center gap-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative">
              <Button
                className="rounded-full"
                onClick={onToggleOneClickDownload}
                size="icon"
                variant="ghost"
              >
                <Rocket className="h-4 w-4 text-muted-foreground" />
              </Button>
              <span
                className={`absolute top-0 -right-2 inline-flex h-3.5 items-center justify-center whitespace-nowrap rounded-full px-1 font-semibold text-xs leading-none ${oneClickDownloadEnabled ? 'bg-being-green-400 text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}
              >
                {oneClickDownloadEnabled ? 'ON' : 'OFF'}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs" side="bottom">
            {oneClickTooltip}
          </TooltipContent>
        </Tooltip>
        {addUrlPopover}
      </div>
      <DialogContent
        className={cn(
          'flex max-h-[90vh] flex-col gap-0 overflow-hidden rounded-md p-6 sm:max-w-lg',
          lockDialogHeight && 'min-h-[24rem]'
        )}
      >
        <DialogHeader className="items-start space-y-1.5 pr-8 text-left">
          <DialogTitle className="text-xl leading-tight">{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogSubtitle}</DialogDescription>
        </DialogHeader>

        <Tabs
          className="flex min-h-0 w-full flex-col"
          defaultValue="single"
          onValueChange={(value) => onActiveTabChange(value as 'single' | 'playlist' | 'profile')}
          size="compact"
          value={activeTab}
        >
          <div className="mt-3 border-border/60 border-t pt-3">
            <TabsList className={cn('w-fit', downloadDialogRadius, '[&>div]:rounded-md')}>
              <TabItem icon={Video} label={singleTabLabel} value="single" />
              <TabItem icon={List} label={playlistTabLabel} value="playlist" />
              <TabItem icon={Instagram} label={profileTabLabel} value="profile" />
            </TabsList>
          </div>
          <TabPanel className="min-h-0 pt-3 [&[hidden]]:hidden" value="single">
            {singleTabContent}
          </TabPanel>
          <TabPanel className="min-h-0 pt-3 [&[hidden]]:hidden" value="playlist">
            {playlistTabContent}
          </TabPanel>
          <TabPanel className="min-h-0 pt-3 [&[hidden]]:hidden" value="profile">
            {profileTabContent}
          </TabPanel>
        </Tabs>
        <DialogFooter className="relative z-10 mt-3 shrink-0 border-border/60 border-t pt-3">
          {footer}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
