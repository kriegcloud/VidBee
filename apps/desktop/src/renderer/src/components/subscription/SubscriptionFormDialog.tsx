import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { ipcServices } from '@renderer/lib/ipc'
import { withDesktopUtm } from '@renderer/lib/url'
import { cn } from '@renderer/lib/utils'
import { settingsAtom } from '@renderer/store/settings'
import { resolveFeedAtom } from '@renderer/store/subscriptions'
import { DEFAULT_SUBSCRIPTION_FILENAME_TEMPLATE, type SubscriptionRule } from '@shared/types'
import { useAtom, useSetAtom } from 'jotai'
import { ChevronRight } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { logger } from '../../lib/logger'

/**
 * Split a comma-separated string into unique trimmed entries.
 *
 * @param value Raw comma-separated input.
 * @returns Deduplicated non-empty entries.
 */
const sanitizeCommaList = (value: string) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry, index, array) => entry.length > 0 && array.indexOf(entry) === index)

/**
 * Normalize a filename template to use single forward slashes.
 *
 * @param value Raw template input.
 * @returns Sanitized template.
 */
const sanitizeTemplateInput = (value: string) => value.replace(/\\/g, '/').replace(/\/{2,}/g, '/')

/**
 * Build the default Subscriptions folder under the user's download path.
 *
 * @param downloadPath Configured download directory.
 * @returns Subscriptions directory path.
 */
const buildDefaultSubscriptionDirectory = (downloadPath: string) => {
  const trimmed = downloadPath.trim().replace(/[\\/]+$/, '')
  if (!trimmed) {
    return 'Subscriptions'
  }
  return `${trimmed}/Subscriptions`
}

export interface SubscriptionFormData {
  url?: string
  keywords?: string[]
  tags?: string[]
  onlyDownloadLatest?: boolean
  autoDownload?: boolean
  downloadDirectory?: string
  namingTemplate?: string
  enabled?: boolean
}

interface SubscriptionFormDialogProps {
  mode: 'add' | 'edit'
  subscription?: SubscriptionRule
  open: boolean
  onSave: (data: SubscriptionFormData) => Promise<void>
  onClose: () => void
}

/**
 * Add or edit an RSS subscription, including auto-download options.
 */
export function SubscriptionFormDialog({
  mode,
  subscription,
  open,
  onSave,
  onClose
}: SubscriptionFormDialogProps) {
  const { t } = useTranslation()
  const [settings] = useAtom(settingsAtom)
  const resolveFeed = useSetAtom(resolveFeedAtom)

  // Form state
  const [url, setUrl] = useState('')
  const [keywords, setKeywords] = useState('')
  const [tags, setTags] = useState('')
  const [onlyLatest, setOnlyLatest] = useState(false)
  const [autoDownload, setAutoDownload] = useState(true)
  const [downloadDirectory, setDownloadDirectory] = useState('')
  const [namingTemplate, setNamingTemplate] = useState('')

  // Feed detection state
  const [detectingFeed, setDetectingFeed] = useState(false)

  const detectTimeout = useRef<NodeJS.Timeout | null>(null)
  const prevDefaultPathRef = useRef(buildDefaultSubscriptionDirectory(settings.downloadPath))
  const urlInputId = useId()
  const advancedOptionsId = useId()
  const [advancedOptionsOpen, setAdvancedOptionsOpen] = useState(false)

  // Initialize form values based on mode
  useEffect(() => {
    if (!open) {
      return
    }

    setAdvancedOptionsOpen(false)

    if (mode === 'edit' && subscription) {
      setUrl(subscription.feedUrl)
      setKeywords(subscription.keywords.join(', '))
      setTags(subscription.tags.join(', '))
      setOnlyLatest(subscription.onlyDownloadLatest)
      setAutoDownload(subscription.autoDownload !== false)
      setDownloadDirectory(subscription.downloadDirectory || '')
      setNamingTemplate(subscription.namingTemplate || '')
    } else {
      // Add mode - use defaults from settings
      setUrl('')
      setKeywords('')
      setTags('')
      setOnlyLatest(settings.subscriptionOnlyLatestDefault)
      setAutoDownload(true)
      setDownloadDirectory(buildDefaultSubscriptionDirectory(settings.downloadPath))
      setNamingTemplate(DEFAULT_SUBSCRIPTION_FILENAME_TEMPLATE)
    }
  }, [open, mode, subscription, settings.subscriptionOnlyLatestDefault, settings.downloadPath])

  // Sync download directory with settings changes (only in add mode)
  useEffect(() => {
    if (mode === 'add') {
      const newPath = buildDefaultSubscriptionDirectory(settings.downloadPath)
      setDownloadDirectory((prev) => {
        if (!prev || prev === prevDefaultPathRef.current) {
          return newPath
        }
        return prev
      })
      prevDefaultPathRef.current = newPath
    }
  }, [settings.downloadPath, mode])

  // Sync onlyLatest with settings changes (only in add mode)
  useEffect(() => {
    if (mode === 'add') {
      setOnlyLatest(settings.subscriptionOnlyLatestDefault)
    }
  }, [settings.subscriptionOnlyLatestDefault, mode])

  // Feed detection logic
  useEffect(() => {
    if (!url.trim()) {
      return
    }

    // In edit mode, don't detect if URL hasn't changed
    if (mode === 'edit' && subscription && url.trim() === subscription.feedUrl) {
      return
    }

    if (detectTimeout.current) {
      clearTimeout(detectTimeout.current)
    }

    detectTimeout.current = setTimeout(async () => {
      setDetectingFeed(true)
      try {
        await resolveFeed(url.trim())
      } catch (error) {
        logger.error('Failed to resolve feed:', error)
      } finally {
        setDetectingFeed(false)
      }
    }, 500)

    return () => {
      if (detectTimeout.current) {
        clearTimeout(detectTimeout.current)
      }
    }
  }, [url, resolveFeed, mode, subscription])

  /**
   * Open a native directory picker and store the chosen path.
   */
  const handleSelectDirectory = async () => {
    try {
      const path = await ipcServices.fs.selectDirectory()
      if (path) {
        setDownloadDirectory(path)
      }
    } catch (error) {
      logger.error('Failed to select directory:', error)
      toast.error(t('subscriptions.notifications.directoryError'))
    }
  }

  /**
   * Open the RSS documentation in the default browser.
   */
  const handleOpenRSSHubDocs = async () => {
    try {
      await ipcServices.fs.openExternal(withDesktopUtm('https://vidbee.org/docs/rss/'))
    } catch (error) {
      logger.error('Failed to open RSS documentation:', error)
      toast.error(t('subscriptions.notifications.openLinkError'))
    }
  }

  /**
   * Validate the form, resolve the feed URL when needed, and persist the subscription.
   */
  const handleSave = async () => {
    // Validate URL for add mode
    if (mode === 'add' && !url.trim()) {
      toast.error(t('subscriptions.notifications.missingUrl'))
      return
    }

    const formData: SubscriptionFormData = {
      keywords: sanitizeCommaList(keywords),
      tags: sanitizeCommaList(tags),
      onlyDownloadLatest: onlyLatest,
      autoDownload,
      downloadDirectory: downloadDirectory || undefined,
      namingTemplate: namingTemplate || undefined
    }

    // Include URL if it's provided and different from current (for edit mode)
    if (
      url.trim() &&
      (mode === 'add' || (mode === 'edit' && subscription && url.trim() !== subscription.feedUrl))
    ) {
      try {
        await resolveFeed(url.trim())
        formData.url = url.trim()
      } catch (error) {
        logger.error('Failed to resolve feed:', error)
        toast.error(t('subscriptions.notifications.resolveError'))
        return
      }
    }

    await onSave(formData)
  }

  const titleKey = mode === 'add' ? 'subscriptions.add.title' : 'subscriptions.edit.title'
  const descriptionKey =
    mode === 'add' ? 'subscriptions.add.description' : 'subscriptions.edit.description'
  const saveButtonKey = mode === 'add' ? 'subscriptions.actions.add' : 'subscriptions.actions.save'

  return (
    <Dialog onOpenChange={(isOpen) => !isOpen && onClose()} open={open}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'edit' && subscription
              ? t(titleKey, { name: subscription.title })
              : t(titleKey)}
          </DialogTitle>
          <DialogDescription>{t(descriptionKey)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor={urlInputId}>{t('subscriptions.fields.url')}</Label>
            <Input
              id={urlInputId}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://docs.rsshub.app/routes/youtube/user/@FKJ"
              value={url}
            />
            {detectingFeed && (
              <p className="text-muted-foreground text-xs">{t('subscriptions.detecting')}</p>
            )}
            {mode === 'add' && !url.trim() && (
              <div className="flex items-center gap-2 rounded-md bg-primary/5 px-3 py-2">
                <p className="flex-1 text-muted-foreground text-xs">
                  {t('subscriptions.rssHub.hint')}
                </p>
                <Button
                  className="h-5 w-5 shrink-0 p-0"
                  onClick={() => void handleOpenRSSHubDocs()}
                  size="sm"
                  title={t('subscriptions.rssHub.openDocs')}
                  variant="ghost"
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>{t('subscriptions.fields.customDirectory')}</Label>
            <div className="flex gap-2">
              <Input readOnly value={downloadDirectory} />
              <Button onClick={() => void handleSelectDirectory()} variant="secondary">
                {t('subscriptions.actions.selectDirectory')}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
              <p className="text-sm">{t('subscriptions.fields.autoDownload')}</p>
              <Switch
                checked={autoDownload}
                label=""
                onToggle={() => setAutoDownload((current) => !current)}
              />
            </div>
            {autoDownload ? (
              <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
                <p className="text-sm">{t('subscriptions.fields.onlyLatest')}</p>
                <Switch
                  checked={onlyLatest}
                  label=""
                  onToggle={() => setOnlyLatest((current) => !current)}
                />
              </div>
            ) : null}
          </div>
          <div
            aria-hidden={!advancedOptionsOpen}
            className={cn(
              'grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out',
              advancedOptionsOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            )}
            data-state={advancedOptionsOpen ? 'open' : 'closed'}
          >
            <div className={cn('min-h-0', !advancedOptionsOpen && 'pointer-events-none')}>
              <div className="space-y-3 border-t pt-4">
                <div className="space-y-2">
                  <Label>{t('subscriptions.fields.keywords')}</Label>
                  <Input onChange={(event) => setKeywords(event.target.value)} value={keywords} />
                </div>
                <div className="space-y-2">
                  <Label>{t('subscriptions.fields.tags')}</Label>
                  <Input onChange={(event) => setTags(event.target.value)} value={tags} />
                </div>
                <div className="space-y-2">
                  <Label>{t('subscriptions.fields.namingTemplate')}</Label>
                  <Input
                    onChange={(event) =>
                      setNamingTemplate(sanitizeTemplateInput(event.target.value))
                    }
                    value={namingTemplate}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={advancedOptionsOpen}
                id={advancedOptionsId}
                onCheckedChange={(checked) => setAdvancedOptionsOpen(checked === true)}
              />
              <Label className="cursor-pointer" htmlFor={advancedOptionsId}>
                {t('advancedOptions.title')}
              </Label>
            </div>
            <div className="ml-auto flex gap-2">
              {mode === 'add' && (
                <Button onClick={onClose} variant="outline">
                  {t('download.cancel')}
                </Button>
              )}
              <Button onClick={() => void handleSave()}>{t(saveButtonKey)}</Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
