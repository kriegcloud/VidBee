import { useRef, useState } from 'react'
import { classifyDataTransfer, dataTransferHasIngest, mediaKindFromName } from './ingest'
import { shouldIgnoreAddUrlShortcutTarget } from './use-add-url-shortcut'
import { useMountEffect } from './use-mount-effect'

export type HomeIngestDropKind = 'url' | 'media' | 'mixed'

export interface UseHomeIngestOptions {
  enabled: boolean
  resolveFilePath?: (file: File) => string | null
  readClipboardPaths?: () => Promise<string[]> | string[]
  onUrls: (urls: string[]) => Promise<void> | void
  onMediaPaths: (paths: string[]) => Promise<void> | void
  onMediaFiles?: (files: File[]) => Promise<void> | void
  onUnsupported?: () => void
}

export interface UseHomeIngestResult {
  dropKind: HomeIngestDropKind | null
  isDragging: boolean
}

/**
 * Deduplicate non-empty strings.
 */
const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))]

/**
 * Guess the overlay kind from a drag DataTransfer before drop details are readable.
 */
const peekDropKind = (data: DataTransfer | null): HomeIngestDropKind | null => {
  if (!data) {
    return null
  }
  const types = Array.from(data.types ?? [])
  const hasFiles = types.includes('Files') || (data.files && data.files.length > 0)
  const hasUrl = types.includes('text/uri-list') || types.includes('text/plain')
  if (hasFiles && hasUrl) {
    return 'mixed'
  }
  if (hasFiles) {
    return 'media'
  }
  if (hasUrl) {
    return 'url'
  }
  return null
}

/**
 * Collect filesystem paths from dropped or pasted File objects.
 */
const pathsFromFiles = (
  files: File[],
  resolveFilePath?: (file: File) => string | null
): string[] => {
  if (!resolveFilePath) {
    return []
  }
  return unique(
    files
      .map((file) => resolveFilePath(file)?.trim() ?? '')
      .filter((path) => mediaKindFromName(path) !== null)
  )
}

/**
 * Register window-level paste and drag-and-drop ingest for the home page.
 */
export const useHomeIngest = ({
  enabled,
  resolveFilePath,
  readClipboardPaths,
  onUrls,
  onMediaPaths,
  onMediaFiles,
  onUnsupported
}: UseHomeIngestOptions): UseHomeIngestResult => {
  const [isDragging, setIsDragging] = useState(false)
  const [dropKind, setDropKind] = useState<HomeIngestDropKind | null>(null)
  const dragDepthRef = useRef(0)
  const enabledRef = useRef(enabled)
  const resolveFilePathRef = useRef(resolveFilePath)
  const readClipboardPathsRef = useRef(readClipboardPaths)
  const onUrlsRef = useRef(onUrls)
  const onMediaPathsRef = useRef(onMediaPaths)
  const onMediaFilesRef = useRef(onMediaFiles)
  const onUnsupportedRef = useRef(onUnsupported)
  enabledRef.current = enabled
  resolveFilePathRef.current = resolveFilePath
  readClipboardPathsRef.current = readClipboardPaths
  onUrlsRef.current = onUrls
  onMediaPathsRef.current = onMediaPaths
  onMediaFilesRef.current = onMediaFiles
  onUnsupportedRef.current = onUnsupported

  useMountEffect(() => {
    const resetDrag = () => {
      dragDepthRef.current = 0
      setIsDragging(false)
      setDropKind(null)
    }

    const handlePayload = (payload: ReturnType<typeof classifyDataTransfer>) => {
      const paths = unique([
        ...payload.mediaPaths,
        ...pathsFromFiles(payload.mediaFiles, resolveFilePathRef.current)
      ])
      const unresolvedFiles =
        paths.length === 0 && !resolveFilePathRef.current ? payload.mediaFiles : []
      const hasWork = payload.urls.length > 0 || paths.length > 0 || unresolvedFiles.length > 0
      if (!hasWork) {
        if (payload.hadInput) {
          onUnsupportedRef.current?.()
        }
        return false
      }
      if (payload.urls.length > 0) {
        void onUrlsRef.current(payload.urls)
      }
      if (paths.length > 0) {
        void onMediaPathsRef.current(paths)
      } else if (unresolvedFiles.length > 0) {
        void onMediaFilesRef.current?.(unresolvedFiles)
      }
      return true
    }

    const handleDragEnter = (event: DragEvent) => {
      if (!enabledRef.current) {
        return
      }
      if (!dataTransferHasIngest(event.dataTransfer)) {
        return
      }
      event.preventDefault()
      dragDepthRef.current += 1
      setIsDragging(true)
      setDropKind(peekDropKind(event.dataTransfer))
    }

    const handleDragOver = (event: DragEvent) => {
      if (!enabledRef.current) {
        return
      }
      if (!dataTransferHasIngest(event.dataTransfer)) {
        return
      }
      event.preventDefault()
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy'
      }
      setDropKind(peekDropKind(event.dataTransfer))
    }

    const handleDragLeave = (event: DragEvent) => {
      if (!enabledRef.current) {
        return
      }
      event.preventDefault()
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
      if (dragDepthRef.current === 0) {
        resetDrag()
      }
    }

    const handleDrop = (event: DragEvent) => {
      if (!enabledRef.current) {
        return
      }
      const data = event.dataTransfer
      if (!data) {
        resetDrag()
        return
      }
      event.preventDefault()
      resetDrag()
      handlePayload(classifyDataTransfer(data))
    }

    const handlePaste = (event: ClipboardEvent) => {
      if (!enabledRef.current) {
        return
      }
      if (shouldIgnoreAddUrlShortcutTarget(event.target)) {
        return
      }
      const data = event.clipboardData
      if (!data) {
        return
      }
      const payload = classifyDataTransfer(data)
      const handled = handlePayload(payload)
      if (handled) {
        event.preventDefault()
        return
      }
      const clipboardReader = readClipboardPathsRef.current
      if (!clipboardReader) {
        return
      }
      void Promise.resolve(clipboardReader()).then((paths) => {
        const next = paths.filter(Boolean)
        if (next.length === 0) {
          return
        }
        event.preventDefault()
        void onMediaPathsRef.current(next)
      })
    }

    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)
    window.addEventListener('paste', handlePaste)
    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
      window.removeEventListener('paste', handlePaste)
    }
  })

  return { dropKind, isDragging }
}
