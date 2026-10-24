import { Instagram, List, Video } from 'lucide-react'
import type { ReactNode, Ref } from 'react'
import { cn } from '../../lib/cn'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './dialog'
import { TabItem, TabPanel, Tabs, TabsList } from './tabs'

/** Chip/list/button radius for the download dialog — never larger than rounded-md. */
export const downloadDialogRadius = 'rounded-md'

interface DownloadDialogLayoutProps {
  contentRef?: Ref<HTMLDivElement>
  open: boolean
  lockDialogHeight: boolean
  tabsDisabled?: boolean
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
  onActiveTabChange: (tab: 'single' | 'playlist' | 'profile') => void
}

/**
 * Download dialog chrome modeled on a title / chips / preview / footer card.
 */
export const DownloadDialogLayout = ({
  contentRef,
  open,
  lockDialogHeight,
  tabsDisabled,
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
  onActiveTabChange
}: DownloadDialogLayoutProps) => {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      {addUrlPopover}
      <DialogContent
        className={cn(
          'flex max-h-[90vh] flex-col gap-0 overflow-hidden rounded-md p-6 sm:max-w-lg',
          lockDialogHeight && 'min-h-[24rem]'
        )}
        ref={contentRef}
      >
        <DialogHeader className="shrink-0 items-start space-y-1.5 pr-8 text-left">
          <DialogTitle className="text-xl leading-tight">{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogSubtitle}</DialogDescription>
        </DialogHeader>

        <Tabs
          className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
          defaultValue="single"
          onValueChange={(value) => onActiveTabChange(value as 'single' | 'playlist' | 'profile')}
          size="compact"
          value={activeTab}
        >
          <div className="mt-3 shrink-0 border-border/60 border-t pt-3">
            <TabsList className={cn('w-fit', downloadDialogRadius, '[&>div]:rounded-md')}>
              <TabItem disabled={tabsDisabled} icon={Video} label={singleTabLabel} value="single" />
              <TabItem
                disabled={tabsDisabled}
                icon={List}
                label={playlistTabLabel}
                value="playlist"
              />
              <TabItem
                disabled={tabsDisabled}
                icon={Instagram}
                label={profileTabLabel}
                value="profile"
              />
            </TabsList>
          </div>
          <TabPanel
            className="min-h-0 overflow-y-auto overscroll-contain pt-3 [&[hidden]]:hidden"
            value="single"
          >
            {singleTabContent}
          </TabPanel>
          <TabPanel
            className="min-h-0 overflow-y-auto overscroll-contain pt-3 [&[hidden]]:hidden"
            value="playlist"
          >
            {playlistTabContent}
          </TabPanel>
          <TabPanel
            className="min-h-0 overflow-y-auto overscroll-contain pt-3 [&[hidden]]:hidden"
            value="profile"
          >
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
