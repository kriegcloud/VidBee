import { resolveMappedProfileSource } from '@vidbee/downloader-core/mapped-profile-source'
import { resolveSocialSource } from '@vidbee/downloader-core/social-media'
import { isTikTokShortLink } from '@vidbee/downloader-core/tiktok-short-link'
import { useCallback, useRef, useState } from 'react'
import { resolveDownloadWorkflow } from './download-workflow'
import { classifyIngestText } from './ingest'
import {
  isFacebookGalleryUrl,
  isThreadsUrl,
  isTikTokPhotoUrl,
  isVscoGalleryUrl,
  resolveCollectionProfile
} from './url-kind'

const isLikelyUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/** Expand share-sheet links so photo posts route like their canonical URL. */
const resolveSubmittedUrl = async (
  url: string,
  onResolveUrl: ((url: string) => Promise<string>) | undefined
): Promise<string> => {
  if (!(onResolveUrl && isTikTokShortLink(url))) {
    return url
  }
  try {
    return (await onResolveUrl(url)).trim() || url
  } catch {
    return url
  }
}

interface UseAddUrlInteractionOptions {
  activeTab: 'single' | 'playlist' | 'profile'
  isOneClickDownloadEnabled: boolean
  isPlaylistBusy: boolean
  isProfileBusy: boolean
  onEmptyUrl: () => void
  onInvalidUrl: () => void
  onOneClickDownload: (url: string) => Promise<boolean | undefined> | Promise<void> | boolean | void
  onParseSocial?: (url: string) => Promise<void> | void
  onParseCollection?: (url: string) => Promise<void> | void
  onParseProfile: (url: string) => Promise<void> | void
  onParsePlaylist: (url: string) => Promise<void> | void
  onParseSingle: (url: string) => Promise<void> | void
  /** Expands short links (for example `vm.tiktok.com`) before routing. */
  onResolveUrl?: (url: string) => Promise<string>
}

interface UseAddUrlInteractionResult {
  isSubmitting: boolean
  addUrlPopoverOpen: boolean
  addUrlValue: string
  batchRequiresOneClick: boolean
  canConfirmAddUrl: boolean
  hasAddUrlValue: boolean
  handleConfirmAddUrl: () => Promise<void>
  handleOpenAddUrlPopover: () => Promise<void>
  setAddUrlPopoverOpen: (open: boolean) => void
  setAddUrlValue: (value: string) => void
  submitUrl: (rawUrl: string) => Promise<void>
}

export const useAddUrlInteraction = ({
  activeTab,
  isOneClickDownloadEnabled,
  isPlaylistBusy,
  onEmptyUrl,
  onInvalidUrl,
  onOneClickDownload,
  onParseSocial,
  onParseCollection,
  onParseProfile,
  onParsePlaylist,
  onParseSingle,
  onResolveUrl
}: UseAddUrlInteractionOptions): UseAddUrlInteractionResult => {
  const [addUrlPopoverOpen, setAddUrlPopoverOpen] = useState(false)
  const [addUrlValue, setAddUrlValue] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingRef = useRef(false)

  const trimmedAddUrlValue = addUrlValue.trim()
  const hasAddUrlValue = trimmedAddUrlValue.length > 0
  const addUrlValues = classifyIngestText(trimmedAddUrlValue).urls
  const batchRequiresOneClick = addUrlValues.length > 1 && !isOneClickDownloadEnabled
  const canConfirmAddUrl = addUrlValues.length > 0 && !batchRequiresOneClick

  /** Keep the source popover alive until the first accepted task can fly from it. */
  const submitOneClickUrls = useCallback(
    async (urls: string[]) => {
      if (submittingRef.current) {
        return
      }
      submittingRef.current = true
      setIsSubmitting(true)
      try {
        for (const nextUrl of urls) {
          const queued = await onOneClickDownload(nextUrl)
          if (queued !== false) {
            setAddUrlPopoverOpen(false)
          }
        }
        if (urls.length > 1) {
          setAddUrlValue('')
        }
      } finally {
        setAddUrlPopoverOpen(false)
        submittingRef.current = false
        setIsSubmitting(false)
      }
    },
    [onOneClickDownload]
  )

  const handleOpenAddUrlPopover = useCallback(async () => {
    setAddUrlPopoverOpen(true)
    if (!navigator.clipboard?.readText) {
      setAddUrlValue('')
      return
    }

    try {
      const text = await navigator.clipboard.readText()
      const trimmedText = text.trim()
      setAddUrlValue(classifyIngestText(trimmedText).urls.length > 0 ? trimmedText : '')
    } catch {
      setAddUrlValue('')
    }
  }, [])

  /**
   * Route a confirmed URL into one-click download or the parse dialog.
   */
  const submitUrl = useCallback(
    async (rawUrl: string) => {
      const inputUrl = rawUrl.trim()
      if (!inputUrl) {
        onEmptyUrl()
        return
      }
      if (!isLikelyUrl(inputUrl)) {
        onInvalidUrl()
        return
      }

      const trimmedUrl = await resolveSubmittedUrl(inputUrl, onResolveUrl)
      const mappedSource = resolveMappedProfileSource(trimmedUrl)

      if (mappedSource && mappedSource.platform !== 'facebook') {
        setAddUrlPopoverOpen(false)
        await onParseProfile(trimmedUrl)
        return
      }

      if (resolveCollectionProfile(trimmedUrl) && onParseCollection) {
        setAddUrlPopoverOpen(false)
        await onParseCollection(trimmedUrl)
        return
      }

      if (resolveSocialSource(trimmedUrl) && onParseSocial) {
        setAddUrlPopoverOpen(false)
        await onParseSocial(trimmedUrl)
        return
      }

      if (
        isVscoGalleryUrl(trimmedUrl) ||
        isFacebookGalleryUrl(trimmedUrl) ||
        isTikTokPhotoUrl(trimmedUrl) ||
        isThreadsUrl(trimmedUrl)
      ) {
        await onOneClickDownload(trimmedUrl)
        return
      }

      const workflow = resolveDownloadWorkflow(trimmedUrl)
      if (workflow.surface === 'browser-profile' || workflow.surface === 'native-profile') {
        setAddUrlPopoverOpen(false)
        await onParseProfile(trimmedUrl)
        return
      }

      if (workflow.surface === 'playlist') {
        if (isPlaylistBusy) {
          return
        }
        setAddUrlPopoverOpen(false)
        await onParsePlaylist(trimmedUrl)
        return
      }

      if (activeTab === 'playlist') {
        if (isPlaylistBusy) {
          return
        }
        setAddUrlPopoverOpen(false)
        await onParsePlaylist(trimmedUrl)
        return
      }

      if (isOneClickDownloadEnabled) {
        await submitOneClickUrls([trimmedUrl])
        return
      }

      setAddUrlPopoverOpen(false)
      await onParseSingle(trimmedUrl)
    },
    [
      activeTab,
      isOneClickDownloadEnabled,
      isPlaylistBusy,
      onEmptyUrl,
      onInvalidUrl,
      onOneClickDownload,
      onParseSocial,
      onParseCollection,
      onParseProfile,
      submitOneClickUrls,
      onParsePlaylist,
      onParseSingle,
      onResolveUrl
    ]
  )

  /** Queue multiline input in one-click mode, or route a single URL through the standard flow. */
  const handleConfirmAddUrl = useCallback(async () => {
    const urls = classifyIngestText(addUrlValue).urls
    if (urls.length === 0) {
      await submitUrl(addUrlValue)
      return
    }

    if (urls.length > 1) {
      if (!isOneClickDownloadEnabled) {
        return
      }
      await submitOneClickUrls(urls)
      return
    }

    await submitUrl(urls[0])
  }, [addUrlValue, isOneClickDownloadEnabled, submitOneClickUrls, submitUrl])

  return {
    isSubmitting,
    addUrlPopoverOpen,
    addUrlValue,
    batchRequiresOneClick,
    canConfirmAddUrl,
    hasAddUrlValue,
    handleConfirmAddUrl,
    handleOpenAddUrlPopover,
    setAddUrlPopoverOpen,
    setAddUrlValue,
    submitUrl
  }
}
