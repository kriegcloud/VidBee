import { Button } from '@renderer/components/ui/button'
import { CardContent, CardHeader } from '@renderer/components/ui/card'
import { Checkbox } from '@renderer/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { cn } from '@renderer/lib/utils'
import { DownloadEmptyState } from '@vidbee/ui/components/ui/download-empty-state'
import type { DownloadFilterItem } from '@vidbee/ui/components/ui/download-filter-bar'
import { DownloadQueueStatus } from '@vidbee/ui/components/ui/download-queue-status'
import { DownloadSelectionToolbar } from '@vidbee/ui/components/ui/download-selection-toolbar'
import {
  ALL_DOWNLOAD_PLATFORM_FILTER,
  downloadPlatformDisplayLabel,
  listDownloadPlatformCounts,
  matchesDownloadPlatformFilter
} from '@vidbee/ui/lib/download-platform'
import { getDownloadQueueProgress } from '@vidbee/ui/lib/download-queue-progress'
import { prepareDownloadTransferTarget } from '@vidbee/ui/lib/download-transfer-target'
import {
  indexOnlyFansChatOwners,
  indexSavedSocialProfileGroups,
  type SavedSocialProfileGroup
} from '@vidbee/ui/lib/saved-social-profile-groups'
import { useAtomValue, useSetAtom, useStore } from 'jotai'
import { ChevronDown, Layers, ListFilter } from 'lucide-react'
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  buildFilePathCandidates,
  normalizeSavedFileName
} from '../../../../shared/utils/download-file'
import { useDownloadOriginContexts } from '../../hooks/use-download-origin-contexts'
import { useDownloadSelection } from '../../hooks/use-download-selection'
import { useExtensionCookieConnection } from '../../hooks/use-extension-cookie-connection'
import { takeDownloadListFocus } from '../../lib/download-list-focus'
import { buildDownloadListModel } from '../../lib/download-list-rows'
import { ipcServices } from '../../lib/ipc'
import { logger } from '../../lib/logger'
import { buildTranscriptPlaybackInput } from '../../lib/transcript-playback-source'
import { flyCoverToPlaylistButton } from '../../lib/transcript-playlist-fly'
import type { DownloadRecord } from '../../store/downloads'
import {
  addDownloadAtom,
  downloadsArrayAtom,
  removeHistoryRecordsAtom,
  removeHistoryRecordsByPlaylistAtom
} from '../../store/downloads'
import { settingsAtom } from '../../store/settings'
import { takePlaybackSessionAtom } from '../../store/transcript-playback'
import { addPlaybackPlaylistItemsAtom } from '../../store/transcript-playlist'
import { transcriptMapAtom } from '../../store/transcripts'
import { ScrollArea } from '../ui/scroll-area'
import { DownloadDialog } from './DownloadDialog'
import { DownloadHistoryVirtualList } from './DownloadHistoryVirtualList'
import { DownloadSelectionContextMenuItems } from './DownloadSelectionContextMenuItems'
import { HomeDownloadFilterBar } from './HomeDownloadFilterBar'
import { usePlaylistExpanded } from './playlist-expanded-state'

const SOURCE_FILTER_OPTIONS = [
  ['all', 'download.allSources'],
  ['manual', 'download.createdManually'],
  ['agent', 'download.createdByAgent'],
  ['subscription', 'download.createdBySubscription']
] as const

type ConfirmAction =
  | { type: 'delete-selected'; ids: string[] }
  | { type: 'delete-playlist'; playlistId: string; title: string; ids: string[] }

const tryFileOperation = async (
  paths: string[],
  operation: (filePath: string) => Promise<boolean>
): Promise<boolean> => {
  for (const filePath of paths) {
    const success = await operation(filePath)
    if (success) {
      return true
    }
  }
  return false
}

const getSavedFileExtension = (fileName?: string): string | undefined => {
  const normalized = normalizeSavedFileName(fileName)
  if (!normalized) {
    return undefined
  }
  if (!normalized.includes('.')) {
    return undefined
  }
  const ext = normalized.split('.').pop()
  return ext?.toLowerCase()
}

/** A returning list may mount before its rows settle, so the reveal gets more than a frame. */
const FOCUS_RESTORE_TIMEOUT_MS = 2000

const resolveDownloadExtension = (download: DownloadRecord): string => {
  const savedExt = getSavedFileExtension(download.savedFileName)
  if (savedExt) {
    return savedExt
  }
  const selectedExt = download.selectedFormat?.ext?.toLowerCase()
  if (selectedExt) {
    return selectedExt
  }
  return download.type === 'audio' ? 'mp3' : 'mp4'
}

/** Ignore native text selection and editable controls when handling list shortcuts. */
const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target && target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }
  const tagName = target.tagName
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT'
}

interface UnifiedDownloadHistoryProps {
  topContent?: ReactNode
  onOpenSupportedSites?: () => void
  onOpenSettings?: () => void
  onOpenCookiesSettings?: () => void
}

export function UnifiedDownloadHistory({
  topContent,
  onOpenSupportedSites,
  onOpenSettings,
  onOpenCookiesSettings
}: UnifiedDownloadHistoryProps) {
  const { t } = useTranslation()
  const allRecords = useAtomValue(downloadsArrayAtom)
  const addDownload = useSetAtom(addDownloadAtom)
  const removeHistoryRecords = useSetAtom(removeHistoryRecordsAtom)
  const removeHistoryRecordsByPlaylist = useSetAtom(removeHistoryRecordsByPlaylistAtom)
  const addPlaylistItems = useSetAtom(addPlaybackPlaylistItemsAtom)
  const takePlaybackSession = useSetAtom(takePlaybackSessionAtom)
  const store = useStore()
  const settings = useAtomValue(settingsAtom)
  const extensionConnection = useExtensionCookieConnection()
  const [platformFilter, setPlatformFilter] = useState(ALL_DOWNLOAD_PLATFORM_FILTER)
  const [savedProfileGroups, setSavedProfileGroups] = useState<
    Map<string, SavedSocialProfileGroup>
  >(new Map())
  const [onlyFansChatOwners, setOnlyFansChatOwners] = useState<Map<string, string>>(new Map())
  const [originFilter, setOriginFilter] = useState('all')
  const [stopAllOpen, setStopAllOpen] = useState(false)
  const [stoppingAll, setStoppingAll] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let cancelled = false
    void Promise.all([
      ipcServices.download.listSocialProfiles(),
      ipcServices.download.listOnlyFansProfiles()
    ])
      .then(([profiles, onlyFansProfiles]) => {
        if (!cancelled) {
          setSavedProfileGroups(indexSavedSocialProfileGroups(profiles))
          setOnlyFansChatOwners(indexOnlyFansChatOwners(onlyFansProfiles))
        }
      })
      .catch((error: unknown) => logger.warn('Failed to list saved profile groups:', error))
    return () => {
      cancelled = true
    }
  }, [])
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)
  const prefixRef = useRef<HTMLDivElement>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [alsoDeleteFiles, setAlsoDeleteFiles] = useState(false)
  const alsoDeleteFilesId = useId()
  const hasCookieConfig = useMemo(() => {
    const cookiesPath = settings.cookiesPath?.trim()
    if (cookiesPath) {
      return true
    }
    const browserSetting = settings.browserForCookies?.trim()
    return Boolean(browserSetting && browserSetting !== 'none')
  }, [settings.browserForCookies, settings.cookiesPath])
  const showCookiesTip = !(hasCookieConfig || extensionConnection.connected)
  const canOpenCookiesSettings = Boolean(onOpenCookiesSettings ?? onOpenSettings)

  const historyRecords = useMemo(
    () => allRecords.filter((record) => record.entryType === 'history'),
    [allRecords]
  )
  const queueProgress = useMemo(() => getDownloadQueueProgress(allRecords), [allRecords])

  const handleStopAll = async () => {
    setStoppingAll(true)
    try {
      const result = await ipcServices.download.cancelAllDownloads()
      if (result.failed > 0) {
        toast.error(t('download.stopAllFailed', { count: result.failed }))
      } else {
        toast.success(t('download.jobsStopped', { count: result.cancelled }))
      }
      setStopAllOpen(false)
    } catch (error) {
      logger.error('Failed to stop all downloads:', error)
      toast.error(t('download.stopAllFailed', { count: queueProgress?.active ?? 0 }))
    } finally {
      setStoppingAll(false)
    }
  }

  const platformCounts = useMemo(
    () => listDownloadPlatformCounts(allRecords.map((record) => record.url)),
    [allRecords]
  )

  const filteredRecords = useMemo(() => {
    return allRecords.filter(
      (record) =>
        matchesDownloadPlatformFilter(record.url, platformFilter) &&
        (originFilter === 'all' || (record.origin ?? 'manual') === originFilter)
    )
  }, [allRecords, platformFilter, originFilter])
  const originContexts = useDownloadOriginContexts(allRecords, originFilter, platformFilter)
  const { expand, isExpanded, toggle } = usePlaylistExpanded()
  const listModel = useMemo(
    () =>
      buildDownloadListModel({
        contexts: originContexts,
        filtered: filteredRecords,
        isExpanded,
        records: allRecords,
        savedProfileGroups,
        onlyFansChatOwners
      }),
    [
      allRecords,
      filteredRecords,
      isExpanded,
      originContexts,
      savedProfileGroups,
      onlyFansChatOwners
    ]
  )

  const restoredFocusRef = useRef(false)
  const hasRows = listModel.rows.length > 0
  // Returning from a detail page: reveal the row it was opened from, once.
  useEffect(() => {
    if (restoredFocusRef.current || !(viewport && hasRows)) {
      return
    }
    restoredFocusRef.current = true
    const downloadId = takeDownloadListFocus()
    if (!downloadId) {
      return
    }
    void prepareDownloadTransferTarget(downloadId, {
      align: 'center',
      timeoutMs: FOCUS_RESTORE_TIMEOUT_MS
    })
  }, [hasRows, viewport])

  const visibleHistoryIds = useMemo(
    () =>
      filteredRecords.filter((record) => record.entryType === 'history').map((record) => record.id),
    [filteredRecords]
  )

  const filters = useMemo((): DownloadFilterItem<string>[] => {
    const items: DownloadFilterItem<string>[] = [
      {
        key: ALL_DOWNLOAD_PLATFORM_FILTER,
        label: t('download.all'),
        count: allRecords.length,
        icon: <Layers className="size-3.5" />
      }
    ]
    for (const platform of platformCounts) {
      items.push({
        key: platform.key,
        label: downloadPlatformDisplayLabel(platform, {
          local: t('download.localSource'),
          other: t('download.otherSource')
        }),
        count: platform.count,
        domain: platform.domain
      })
    }
    return items
  }, [allRecords.length, platformCounts, t])

  useEffect(() => {
    if (platformFilter === ALL_DOWNLOAD_PLATFORM_FILTER) {
      return
    }
    if (platformCounts.some((platform) => platform.key === platformFilter)) {
      return
    }
    setPlatformFilter(ALL_DOWNLOAD_PLATFORM_FILTER)
  }, [platformCounts, platformFilter])

  const selectableIds = useMemo(() => {
    const matchingHistory = new Set(visibleHistoryIds)
    return [...listModel.locations.keys()].filter((id) => matchingHistory.has(id))
  }, [listModel.locations, visibleHistoryIds])
  const rangeIds = useMemo(() => {
    const selectable = new Set(selectableIds)
    return listModel.rows.flatMap((row) =>
      row.kind === 'task' && selectable.has(row.record.id) ? [row.record.id] : []
    )
  }, [listModel.rows, selectableIds])
  const {
    allSelected,
    clearSelection,
    selectAll,
    selectedIds,
    selectIds,
    selectItem,
    setSelectedIds,
    toggleSelectAll
  } = useDownloadSelection(selectableIds, rangeIds)
  const selectedCount = selectedIds.size
  const selectedRecords = useMemo(() => {
    const byId = new Map(historyRecords.map((record) => [record.id, record]))
    return selectableIds.flatMap((id) => {
      const record = byId.get(id)
      return record && selectedIds.has(id) ? [record] : []
    })
  }, [historyRecords, selectableIds, selectedIds])
  const selectionSummary = t('history.selectedCount', { count: selectedCount })

  /** Keep the selection on selected rows and retarget it when opening another row's menu. */
  const handleContextMenuSelect = (id: string): void => {
    if (selectedIds.has(id)) {
      return
    }
    if (selectableIds.includes(id)) {
      selectItem(id, { toggle: false })
    } else {
      clearSelection()
    }
  }

  /** Confirm removal of the same selection used by the toolbar and context menu. */
  const handleRequestDeleteSelected = () => {
    if (selectedIds.size === 0) {
      return
    }
    setAlsoDeleteFiles(false)
    setConfirmAction({ type: 'delete-selected', ids: Array.from(selectedIds) })
  }

  /**
   * Queue the selected downloads and start the first playable item.
   */
  const handleAddSelectedToPlaylist = (): void => {
    const selectedInOrder = selectedRecords.map((record) => record.id)
    if (selectedInOrder.length === 0) {
      return
    }
    addPlaylistItems(selectedInOrder)
    const transcriptMap = store.get(transcriptMapAtom)
    const recordsById = new Map(historyRecords.map((record) => [record.id, record]))
    const firstPlayable = selectedInOrder
      .map((id) => recordsById.get(id) ?? null)
      .find((record) => {
        if (!record) {
          return false
        }
        return Boolean(
          buildTranscriptPlaybackInput({
            download: record,
            downloadId: record.id,
            fallbackTitle: record.title,
            snapshot: transcriptMap[record.id] ?? null
          }).filePath
        )
      })
    if (firstPlayable) {
      const playbackInput = buildTranscriptPlaybackInput({
        download: firstPlayable,
        downloadId: firstPlayable.id,
        fallbackTitle: firstPlayable.title,
        snapshot: transcriptMap[firstPlayable.id] ?? null
      })
      takePlaybackSession(playbackInput)
      const row = listRef.current?.querySelector(`[data-download-id="${firstPlayable.id}"]`)
      const image = row?.querySelector('img')
      flyCoverToPlaylistButton({
        from: row?.querySelector('.aspect-video')?.getBoundingClientRect() ?? null,
        src: image?.currentSrc || image?.src || firstPlayable.thumbnail || null
      })
    }
    toast.success(t('transcript.player.playlist.addedCount', { count: selectedInOrder.length }))
    clearSelection()
  }

  /**
   * Retry every failed download in one profile or playlist group.
   */
  const handleRetryGroupFailed = async (records: DownloadRecord[]) => {
    const failed = records.filter((record) => record.status === 'error' && record.url)
    if (failed.length === 0) {
      return
    }
    let retried = 0
    for (const record of failed) {
      try {
        if (!(await ipcServices.download.retryDownload(record.id))) {
          continue
        }
        addDownload({ ...record, error: undefined, progress: { percent: 0 }, status: 'pending' })
        retried += 1
      } catch (error) {
        logger.error('Failed to retry download:', error)
      }
    }
    if (retried === 0) {
      toast.info(t('notifications.downloadAlreadyQueued'))
      return
    }
    toast.success(t('playlist.groupRetriedFailed', { count: retried }))
  }

  const handleRequestDeletePlaylist = (playlistId: string, title: string, ids: string[]) => {
    if (ids.length === 0) {
      return
    }
    setConfirmAction({ type: 'delete-playlist', playlistId, title, ids })
  }

  const pruneSelectedIds = (ids: string[]) => {
    if (ids.length === 0) {
      return
    }
    setSelectedIds((prev) => {
      const next = new Set(prev)
      let changed = false
      ids.forEach((id) => {
        if (next.delete(id)) {
          changed = true
        }
      })
      return changed ? next : prev
    })
  }

  const confirmContent = useMemo(() => {
    if (!confirmAction) {
      return null
    }
    switch (confirmAction.type) {
      case 'delete-selected': {
        return {
          title: t('history.confirmDeleteSelectedTitle'),
          description: t('history.confirmDeleteSelectedDescription', {
            count: confirmAction.ids.length
          }),
          actionLabel: t('history.removeAction')
        }
      }
      case 'delete-playlist': {
        return {
          title: t('history.confirmDeletePlaylistTitle'),
          description: t('history.confirmDeletePlaylistDescription', {
            count: confirmAction.ids.length,
            title: confirmAction.title
          }),
          actionLabel: t('history.removeAction')
        }
      }
      default:
        return null
    }
  }, [confirmAction, t])

  const deleteHistoryFiles = async (records: DownloadRecord[]) => {
    const failedIds: string[] = []
    for (const record of records) {
      if (!record.title) {
        continue
      }
      const downloadPath = record.downloadPath || settings.downloadPath
      if (!downloadPath) {
        continue
      }
      const formatForPath = resolveDownloadExtension(record)
      const filePaths = buildFilePathCandidates(
        downloadPath,
        record.title,
        formatForPath,
        record.savedFileName
      )
      const deleted = await tryFileOperation(filePaths, (filePath) =>
        ipcServices.fs.deleteFile(filePath)
      )
      if (!deleted) {
        failedIds.push(record.id)
      }
    }
    if (failedIds.length > 0) {
      logger.warn('Failed to delete some playlist files:', failedIds)
    }
  }

  const handleConfirmAction = async () => {
    if (!confirmAction) {
      return
    }
    setConfirmBusy(true)
    try {
      if (confirmAction.type === 'delete-selected') {
        await ipcServices.history.removeHistoryItems(confirmAction.ids)
        removeHistoryRecords(confirmAction.ids)
        if (alsoDeleteFiles) {
          const idSet = new Set(confirmAction.ids)
          const recordsToDelete = historyRecords.filter((record) => idSet.has(record.id))
          await deleteHistoryFiles(recordsToDelete)
        }
        pruneSelectedIds(confirmAction.ids)
        toast.success(t('notifications.itemsRemoved', { count: confirmAction.ids.length }))
      }
      if (confirmAction.type === 'delete-playlist') {
        const idSet = new Set(confirmAction.ids)
        const playlistRecords = historyRecords.filter((record) => idSet.has(record.id))
        await ipcServices.history.removeHistoryByPlaylistId(confirmAction.playlistId)
        removeHistoryRecordsByPlaylist(confirmAction.playlistId)
        await deleteHistoryFiles(playlistRecords)
        pruneSelectedIds(confirmAction.ids)
        toast.success(
          t('notifications.playlistHistoryRemoved', { count: confirmAction.ids.length })
        )
      }
      setConfirmAction(null)
      setAlsoDeleteFiles(false)
    } catch (error) {
      if (confirmAction.type === 'delete-selected') {
        logger.error('Failed to remove selected history items:', error)
        toast.error(t('notifications.itemsRemoveFailed'))
      }
      if (confirmAction.type === 'delete-playlist') {
        logger.error('Failed to remove playlist history:', error)
        toast.error(t('notifications.playlistHistoryRemoveFailed'))
      }
    } finally {
      setConfirmBusy(false)
    }
  }

  /** Handle selection shortcuts only while focus belongs to the list or its toolbar. */
  const handleSelectionKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.defaultPrevented || confirmAction || isEditableTarget(event.target)) {
      return
    }
    const target = event.target
    if (!(target instanceof HTMLElement)) {
      return
    }
    if (
      !(
        listRef.current?.contains(target) ||
        target === viewport ||
        target.closest('[data-download-selection-toolbar]')
      )
    ) {
      return
    }
    if (target.closest('[role="dialog"], [role="alertdialog"], [role="menu"]')) {
      return
    }
    if (event.key === 'Escape' && selectedCount > 0) {
      event.preventDefault()
      clearSelection()
      listRef.current?.focus({ preventScroll: true })
    } else if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === 'a' &&
      selectableIds.length > 0
    ) {
      event.preventDefault()
      selectAll()
    }
  }

  /** Clear the selection when clicking unused scrollport space rather than rows or controls. */
  const handleBackgroundClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (!(event.target instanceof Node && event.currentTarget.contains(event.target))) {
      return
    }
    if (
      event.target instanceof Element &&
      event.target.closest(
        '[data-download-id], button, a, input, [role="checkbox"], [data-download-list-prefix]'
      )
    ) {
      return
    }
    if (!(event.metaKey || event.ctrlKey || event.shiftKey)) {
      clearSelection()
      listRef.current?.focus({ preventScroll: true })
    }
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: library group scopes keyboard events for the list and floating toolbar
    <div className={cn('flex h-full flex-col')} onKeyDown={handleSelectionKeyDown} role="group">
      <CardHeader className="z-50 gap-4 bg-background p-0 px-6 py-4">
        <HomeDownloadFilterBar
          actions={
            <div className="flex items-center gap-2">
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label={t('download.creationSource')}
                    className={cn(
                      'h-8 max-w-40 gap-1.5 rounded-md border-0 px-2.5 text-xs hover:bg-[color:var(--hover)] [&_svg]:size-3.5',
                      originFilter === 'all'
                        ? 'text-muted-foreground'
                        : 'bg-[color:var(--active)] text-foreground'
                    )}
                    data-testid="download-source-filter"
                    size="sm"
                    variant="ghost"
                  >
                    <ListFilter />
                    <span className="truncate">
                      {t(
                        SOURCE_FILTER_OPTIONS.find(([value]) => value === originFilter)?.[1] ??
                          'download.allSources'
                      )}
                    </span>
                    <ChevronDown className="opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-40 rounded-xl" sideOffset={6}>
                  <DropdownMenuRadioGroup
                    onValueChange={(value) => {
                      setOriginFilter(value)
                      clearSelection()
                    }}
                    value={originFilter}
                  >
                    {SOURCE_FILTER_OPTIONS.map(([value, label]) => (
                      <DropdownMenuRadioItem
                        className="rounded-lg text-xs"
                        data-source-filter={value}
                        key={value}
                        value={value}
                      >
                        {t(label)}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <DownloadDialog
                onOpenSettings={onOpenSettings}
                onOpenSupportedSites={onOpenSupportedSites}
              />
            </div>
          }
          activeFilter={platformFilter}
          filters={filters}
          onFilterChange={(value) => {
            setPlatformFilter(value)
            clearSelection()
          }}
          overflowLabel={t('download.morePlatforms')}
        />
        {queueProgress && (
          <DownloadQueueStatus
            active={queueProgress.active}
            label={t('download.queueProgress', {
              finished: queueProgress.finished,
              total: queueProgress.total,
              active: queueProgress.active
            })}
            onStopAll={() => setStopAllOpen(true)}
            percent={queueProgress.percent}
            stopLabel={t('download.stopAllJobs')}
            stopping={stoppingAll}
          />
        )}
      </CardHeader>
      <ScrollArea
        className="flex-1 overflow-y-auto"
        viewportProps={{ onClick: handleBackgroundClick }}
        viewportRef={setViewport}
      >
        <CardContent
          className="w-full space-y-3 overflow-x-hidden p-0"
          data-download-transfer-list=""
        >
          <div data-download-list-prefix="" ref={prefixRef}>
            {topContent}
            {showCookiesTip && (
              <div className="mx-6 mt-4 rounded-xl bg-muted/40 px-6 py-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col items-start gap-2.5">
                    <div className="space-y-1">
                      <p className="font-bold text-[10px] text-muted-foreground/70 uppercase tracking-wider">
                        {t('history.cookiesTipTitle')}
                      </p>
                      <p className="max-w-[540px] text-foreground/85 text-sm leading-relaxed">
                        <Trans
                          components={{
                            strong: <strong className="font-semibold text-foreground" />
                          }}
                          i18nKey="history.cookiesTipDescription"
                        />
                      </p>
                    </div>
                    <Button
                      className="h-8 rounded-lg px-4 font-medium text-xs"
                      disabled={!canOpenCookiesSettings}
                      onClick={() => {
                        if (onOpenCookiesSettings) {
                          onOpenCookiesSettings()
                          return
                        }
                        onOpenSettings?.()
                      }}
                      size="sm"
                      variant="secondary"
                    >
                      {t('history.cookiesTipCta')}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
          {listModel.rows.length === 0 ? (
            <DownloadEmptyState
              className="mx-6 mb-4"
              hint={t('download.ingestEmptyHint')}
              message={t('download.noItems')}
            />
          ) : (
            <DownloadHistoryVirtualList
              expandPlaylist={expand}
              isPlaylistExpanded={isExpanded}
              listRef={listRef}
              model={listModel}
              onContextMenuSelect={handleContextMenuSelect}
              onDeletePlaylist={originFilter === 'all' ? handleRequestDeletePlaylist : undefined}
              onRetryGroupFailed={(records) => {
                void handleRetryGroupFailed(records)
              }}
              onSelectIds={selectIds}
              onTogglePlaylist={toggle}
              onToggleSelect={selectItem}
              prefixRef={prefixRef}
              selectedIds={selectedIds}
              selectionActive={selectedCount > 0}
              selectionContextMenu={
                selectedRecords.length > 1 ? (
                  <DownloadSelectionContextMenuItems
                    onAddToPlaylist={handleAddSelectedToPlaylist}
                    onDelete={handleRequestDeleteSelected}
                    records={selectedRecords}
                  />
                ) : undefined
              }
              viewport={viewport}
            />
          )}
        </CardContent>
      </ScrollArea>
      {selectedCount > 0 && (
        <div
          className="fixed bottom-[calc(1rem+var(--playback-bar-height,0px))] left-1/2 z-40 -translate-x-1/2 sm:right-6 sm:left-auto sm:translate-x-0"
          data-download-selection-toolbar=""
        >
          <DownloadSelectionToolbar
            addToPlaylistLabel={t('transcript.player.playlist.add')}
            allSelected={allSelected}
            clearLabel={t('history.clearSelection')}
            countLabel={selectionSummary}
            deleteLabel={t('history.deleteSelected')}
            onAddToPlaylist={handleAddSelectedToPlaylist}
            onDelete={handleRequestDeleteSelected}
            onToggleSelectAll={toggleSelectAll}
            selectAllLabel={t('history.selectAll')}
          />
        </div>
      )}
      <Dialog
        onOpenChange={(open) => {
          if (!(open || confirmBusy)) {
            setConfirmAction(null)
            setAlsoDeleteFiles(false)
          }
        }}
        open={Boolean(confirmAction)}
      >
        {confirmContent && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{confirmContent.title}</DialogTitle>
              <DialogDescription>{confirmContent.description}</DialogDescription>
            </DialogHeader>
            {confirmAction?.type === 'delete-selected' && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={alsoDeleteFiles}
                  id={alsoDeleteFilesId}
                  onCheckedChange={(checked) => setAlsoDeleteFiles(checked === true)}
                />
                <label
                  className="cursor-pointer font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  htmlFor={alsoDeleteFilesId}
                >
                  {t('history.alsoDeleteFiles')}
                </label>
              </div>
            )}
            <DialogFooter>
              <Button
                disabled={confirmBusy}
                onClick={() => {
                  setConfirmAction(null)
                  setAlsoDeleteFiles(false)
                }}
                variant="outline"
              >
                {t('download.cancel')}
              </Button>
              <Button disabled={confirmBusy} onClick={handleConfirmAction} variant="destructive">
                {confirmContent.actionLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
      <Dialog
        onOpenChange={(open) => {
          if (!stoppingAll) {
            setStopAllOpen(open)
          }
        }}
        open={stopAllOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('download.stopAllConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('download.stopAllConfirmDescription', { count: queueProgress?.active ?? 0 })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button disabled={stoppingAll} onClick={() => setStopAllOpen(false)} variant="outline">
              {t('download.cancel')}
            </Button>
            <Button
              disabled={stoppingAll}
              onClick={() => void handleStopAll()}
              variant="destructive"
            >
              {t('download.stopAllJobs')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
