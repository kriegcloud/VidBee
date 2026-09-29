import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import {
  ADJUSTMENT_SPECS,
  ASPECT_PRESETS,
  buildFilter,
  type CropHandle,
  centeredCrop,
  defaultOutputMime,
  dragCrop,
  drawOriented,
  type EncodedImageMime,
  flipCrop,
  type ImageAdjustments,
  type ImageEditState,
  INITIAL_EDIT_STATE,
  isNeutralEdit,
  mimeToFormat,
  NEUTRAL_ADJUSTMENTS,
  type NormalizedRect,
  orientedSize,
  outputSize,
  type RightAngle,
  renderEditedImage,
  rotateCrop
} from '@renderer/lib/image-edit'
import { ipcServices } from '@renderer/lib/ipc'
import { cn } from '@renderer/lib/utils'
import type { EditedImageSaveMode, MediaAsset } from '@shared/types/media-assets'
import {
  ChevronDown,
  Crop,
  Eye,
  FlipHorizontal2,
  FlipVertical2,
  Loader2,
  Redo2,
  RotateCcw,
  RotateCw,
  Scaling,
  SlidersHorizontal,
  Undo2,
  X
} from 'lucide-react'
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { MediaConfirmDialog } from './MediaConfirmDialog'
import { assetSrc } from './MediaViewer'

/** Longest edge of the working preview canvas; export always uses full resolution. */
const PREVIEW_MAX_EDGE = 2048
const STAGE_PADDING_PX = 32
const HISTORY_LIMIT = 100

type Tool = 'crop' | 'adjust' | 'resize'

interface History {
  past: ImageEditState[]
  present: ImageEditState
  future: ImageEditState[]
}

const FORMAT_OPTIONS: readonly { mime: EncodedImageMime; label: string }[] = [
  { label: 'PNG', mime: 'image/png' },
  { label: 'JPEG', mime: 'image/jpeg' },
  { label: 'WebP', mime: 'image/webp' }
]

const EXT_FOR_MIME: Record<EncodedImageMime, readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp']
}

/** `4:5` → `5:4` when that preset exists; free/original/square are unchanged. */
const invertAspectId = (id: string): string => {
  const [width, height] = id.split(':')
  if (!(width && height)) {
    return id
  }
  const inverse = `${height}:${width}`
  return ASPECT_PRESETS.some((preset) => preset.id === inverse) ? inverse : 'free'
}

const HANDLES: readonly { id: CropHandle; className: string }[] = [
  { className: '-top-1.5 -left-1.5 cursor-nwse-resize', id: 'nw' },
  { className: '-top-1.5 -right-1.5 cursor-nesw-resize', id: 'ne' },
  { className: '-bottom-1.5 -left-1.5 cursor-nesw-resize', id: 'sw' },
  { className: '-right-1.5 -bottom-1.5 cursor-nwse-resize', id: 'se' },
  { className: '-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize', id: 'n' },
  { className: '-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize', id: 's' },
  { className: 'top-1/2 -left-1.5 -translate-y-1/2 cursor-ew-resize', id: 'w' },
  { className: 'top-1/2 -right-1.5 -translate-y-1/2 cursor-ew-resize', id: 'e' }
]

interface ImageEditorProps {
  asset: MediaAsset
  onClose: () => void
  /** Called after a successful write with the path and how it was written. */
  onSaved: (path: string, mode: EditedImageSaveMode) => void
}

/**
 * Full-screen, non-destructive image editor. The preview applies the same CSS
 * filter string the exporter feeds to `ctx.filter`, so what you see is what
 * gets written.
 */
export function ImageEditor({ asset, onClose, onSaved }: ImageEditorProps) {
  const { t } = useTranslation()
  const [source, setSource] = useState<HTMLImageElement | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [history, setHistory] = useState<History>({
    future: [],
    past: [],
    present: INITIAL_EDIT_STATE
  })
  const [tool, setTool] = useState<Tool>('crop')
  const [aspectId, setAspectId] = useState('free')
  const [comparing, setComparing] = useState(false)
  const [mime, setMime] = useState<EncodedImageMime>(() => defaultOutputMime(asset.ext))
  const [quality, setQuality] = useState(92)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<'overwrite' | 'discard' | null>(null)
  const [stage, setStage] = useState({ height: 0, width: 0 })
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gestureStartRef = useRef<ImageEditState | null>(null)
  const state = history.present
  const { flipH, flipV, rotation } = state

  useEffect(() => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => setSource(image)
    image.onerror = () => setLoadError(true)
    image.src = assetSrc(asset)
    return () => {
      image.onload = null
      image.onerror = null
    }
  }, [asset])

  useLayoutEffect(() => {
    const element = stageRef.current
    if (!element) {
      return
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setStage({ height: entry.contentRect.height, width: entry.contentRect.width })
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const sourceWidth = source?.naturalWidth ?? asset.width ?? 1
  const sourceHeight = source?.naturalHeight ?? asset.height ?? 1
  const previewScale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(sourceWidth, sourceHeight))
  const oriented = orientedSize(sourceWidth, sourceHeight, state.rotation)
  const frameAspect = oriented.width / oriented.height

  // Redraw the oriented preview only when geometry changes; filters are live CSS.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!(canvas && source)) {
      return
    }
    drawOriented(source, sourceWidth, sourceHeight, { flipH, flipV, rotation }, canvas, {
      scale: previewScale
    })
  }, [flipH, flipV, previewScale, rotation, source, sourceHeight, sourceWidth])

  const display = useMemo(() => {
    const availableWidth = Math.max(1, stage.width - STAGE_PADDING_PX * 2)
    const availableHeight = Math.max(1, stage.height - STAGE_PADDING_PX * 2)
    const scale = Math.min(availableWidth / oriented.width, availableHeight / oriented.height)
    return { height: oriented.height * scale, scale, width: oriented.width * scale }
  }, [oriented.height, oriented.width, stage.height, stage.width])

  const previewFilter = comparing ? 'none' : buildFilter(state.adjust, display.scale)
  const output = outputSize(sourceWidth, sourceHeight, state)
  const dirty = !isNeutralEdit(state)
  const canOverwrite = EXT_FOR_MIME[mime].includes(asset.ext.toLowerCase())

  /** Replace the present state and record the previous one for undo. */
  const commit = useCallback((next: ImageEditState, from?: ImageEditState) => {
    setHistory((current) => ({
      future: [],
      past: [...current.past, from ?? current.present].slice(-HISTORY_LIMIT),
      present: next
    }))
  }, [])

  /** Update without a history entry (mid-gesture). */
  const preview = useCallback((next: ImageEditState) => {
    setHistory((current) => ({ ...current, present: next }))
  }, [])

  const beginGesture = useCallback(() => {
    gestureStartRef.current = history.present
  }, [history.present])

  const endGesture = useCallback(() => {
    const start = gestureStartRef.current
    gestureStartRef.current = null
    if (start && start !== history.present) {
      commit(history.present, start)
    }
  }, [commit, history.present])

  const undo = useCallback(() => {
    setHistory((current) => {
      const previous = current.past.at(-1)
      if (!previous) {
        return current
      }
      return {
        future: [current.present, ...current.future],
        past: current.past.slice(0, -1),
        present: previous
      }
    })
  }, [])

  const redo = useCallback(() => {
    setHistory((current) => {
      const [next, ...rest] = current.future
      if (!next) {
        return current
      }
      return { future: rest, past: [...current.past, current.present], present: next }
    })
  }, [])

  const rotate = useCallback(
    (clockwise: boolean) => {
      const rotation = ((state.rotation + (clockwise ? 90 : 270)) % 360) as RightAngle
      commit({ ...state, crop: rotateCrop(state.crop, clockwise), rotation })
      // The crop turns with the image, so a locked 4:5 becomes 5:4.
      setAspectId(invertAspectId)
    },
    [commit, state]
  )

  /** Flip what the user sees; with a quarter turn that is the source's other axis. */
  const flip = useCallback(
    (axis: 'horizontal' | 'vertical') => {
      const quarter = state.rotation === 90 || state.rotation === 270
      const sourceAxisIsH = (axis === 'horizontal') !== quarter
      commit({
        ...state,
        crop: flipCrop(state.crop, axis),
        flipH: sourceAxisIsH ? !state.flipH : state.flipH,
        flipV: sourceAxisIsH ? state.flipV : !state.flipV
      })
    },
    [commit, state]
  )

  const lockedRatio = useMemo(() => {
    const preset = ASPECT_PRESETS.find((item) => item.id === aspectId)
    if (!preset || preset.id === 'free') {
      return null
    }
    // "Original" means the frame as currently oriented, so it survives rotation.
    return preset.id === 'original' ? frameAspect : preset.ratio
  }, [aspectId, frameAspect])

  const selectAspect = (id: string) => {
    setAspectId(id)
    const preset = ASPECT_PRESETS.find((item) => item.id === id)
    if (!preset) {
      return
    }
    if (preset.id === 'free') {
      return
    }
    const ratio = preset.id === 'original' ? frameAspect : (preset.ratio ?? 1)
    commit({ ...state, crop: centeredCrop(ratio, frameAspect) })
  }

  const setAdjust = (key: keyof ImageAdjustments, value: number) => {
    preview({ ...state, adjust: { ...state.adjust, [key]: value } })
  }

  const handleSave = useCallback(
    async (mode: EditedImageSaveMode) => {
      if (!source || saving) {
        return
      }
      setSaving(true)
      try {
        const blob = await renderEditedImage(source, state, mime, quality / 100)
        const result = await ipcServices.media.saveEditedImage({
          data: await blob.arrayBuffer(),
          format: mimeToFormat(mime),
          mode,
          sourcePath: asset.path
        })
        if (result.path) {
          toast.success(t('media.editor.saved', { name: result.path.split(/[\\/]/).pop() }))
          onSaved(result.path, mode)
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('media.editor.saveFailed'))
      } finally {
        setSaving(false)
      }
    },
    [asset.path, mime, onSaved, quality, saving, source, state, t]
  )

  const requestClose = useCallback(() => {
    if (dirty) {
      setConfirm('discard')
    } else {
      onClose()
    }
  }, [dirty, onClose])

  useEffect(() => {
    if (confirm) {
      return
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLInputElement && target.type !== 'range') {
        return
      }
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      if (mod && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          redo()
        } else {
          undo()
        }
        return
      }
      if (mod && key === 'y') {
        event.preventDefault()
        redo()
        return
      }
      if (mod && key === 's') {
        event.preventDefault()
        if (event.shiftKey) {
          if (canOverwrite) {
            setConfirm('overwrite')
          }
        } else {
          void handleSave('copy')
        }
        return
      }
      if (mod || event.altKey) {
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        requestClose()
      } else if (key === 'r') {
        rotate(!event.shiftKey)
      } else if (key === 'h') {
        flip('horizontal')
      } else if (key === 'v') {
        flip('vertical')
      } else if (key === 'c') {
        setTool('crop')
      } else if (key === 'a') {
        setTool('adjust')
      } else if (event.key === '\\' && !event.repeat) {
        setComparing(true)
      }
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === '\\') {
        setComparing(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [canOverwrite, confirm, flip, handleSave, redo, requestClose, rotate, undo])

  // --- Crop dragging -------------------------------------------------------
  const cropDragRef = useRef<{
    handle: CropHandle
    pointerId: number
    startX: number
    startY: number
    startCrop: NormalizedRect
    startState: ImageEditState
  } | null>(null)

  const crop = state.crop ?? { height: 1, width: 1, x: 0, y: 0 }

  const startCropDrag = (handle: CropHandle) => (event: ReactPointerEvent<HTMLElement>) => {
    if (tool !== 'crop' || event.button !== 0) {
      return
    }
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    cropDragRef.current = {
      handle,
      pointerId: event.pointerId,
      startCrop: crop,
      startState: state,
      startX: event.clientX,
      startY: event.clientY
    }
  }

  const moveCropDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = cropDragRef.current
    if (!drag || drag.pointerId !== event.pointerId || display.width === 0) {
      return
    }
    const dx = (event.clientX - drag.startX) / display.width
    const dy = (event.clientY - drag.startY) / display.height
    preview({
      ...drag.startState,
      crop: dragCrop(drag.startCrop, drag.handle, dx, dy, lockedRatio, frameAspect)
    })
  }

  const endCropDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = cropDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    cropDragRef.current = null
    setHistory((current) =>
      current.present === drag.startState
        ? current
        : {
            future: [],
            past: [...current.past, drag.startState].slice(-HISTORY_LIMIT),
            present: current.present
          }
    )
  }

  const showCrop = !comparing && (tool === 'crop' || state.crop !== null)

  // Portal to <body> so the app sidebar cannot paint over the editor. Keep z-50: confirm
  // dialogs are also z-50 portals mounted later, so they stack above the editor.
  return createPortal(
    <div
      aria-label={t('media.editor.title')}
      aria-modal
      className="fixed inset-0 z-50 flex flex-col bg-[#0b0b0c] text-white"
      role="dialog"
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-white/10 border-b px-3">
        <Button
          aria-label={t('media.editor.cancel')}
          className="size-8 text-white/80 hover:bg-white/10 hover:text-white"
          onClick={requestClose}
          size="icon"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-[13px]">{asset.fileName}</p>
          <p className="text-[11px] text-white/50 tabular-nums">
            {t('media.editor.output', { height: output.height, width: output.width })}
          </p>
        </div>
        <EditorIconButton
          disabled={history.past.length === 0}
          label={t('media.editor.undo')}
          onClick={undo}
          shortcut="Ctrl+Z"
        >
          <Undo2 className="size-4" />
        </EditorIconButton>
        <EditorIconButton
          disabled={history.future.length === 0}
          label={t('media.editor.redo')}
          onClick={redo}
          shortcut="Ctrl+Shift+Z"
        >
          <Redo2 className="size-4" />
        </EditorIconButton>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={t('media.editor.compare')}
              className={cn(
                'size-8 text-white/80 hover:bg-white/10 hover:text-white',
                comparing && 'bg-white/15'
              )}
              onPointerDown={() => setComparing(true)}
              onPointerLeave={() => setComparing(false)}
              onPointerUp={() => setComparing(false)}
              size="icon"
              variant="ghost"
            >
              <Eye className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('media.editor.compareHint')}</TooltipContent>
        </Tooltip>
        <Button
          className="h-8 text-white/80 hover:bg-white/10 hover:text-white"
          disabled={!dirty}
          onClick={() => {
            setAspectId('free')
            commit(INITIAL_EDIT_STATE)
          }}
          size="sm"
          variant="ghost"
        >
          {t('media.editor.reset')}
        </Button>
        <div className="ml-1 flex items-center">
          <Button
            className="h-8 rounded-r-none"
            disabled={!(dirty && source) || saving}
            onClick={() => void handleSave('copy')}
            size="sm"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {t('media.editor.saveCopy')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={t('media.editor.moreSave')}
                className="h-8 rounded-l-none border-primary-foreground/20 border-l px-2"
                disabled={!source || saving}
                size="sm"
              >
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem disabled={!dirty} onSelect={() => void handleSave('copy')}>
                {t('media.editor.saveCopy')}
                <DropdownMenuShortcut>Ctrl+S</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleSave('save-as')}>
                {t('media.editor.saveAs')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                disabled={!(dirty && canOverwrite)}
                onSelect={() => setConfirm('overwrite')}
              >
                {canOverwrite ? t('media.editor.overwrite') : t('media.editor.overwriteFormat')}
                <DropdownMenuShortcut>Ctrl+Shift+S</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 overflow-hidden" ref={stageRef}>
          {loadError ? (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-white/60">
              {t('media.editor.loadFailed')}
            </p>
          ) : null}
          {source ? null : loadError ? null : (
            <Loader2 className="absolute top-1/2 left-1/2 size-6 -translate-x-1/2 -translate-y-1/2 animate-spin text-white/50" />
          )}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden"
            style={{ height: display.height, width: display.width }}
          >
            <canvas
              className="block h-full w-full"
              ref={canvasRef}
              style={{ filter: previewFilter, visibility: source ? 'visible' : 'hidden' }}
            />
            {showCrop && source ? (
              <div
                className={cn('absolute', tool === 'crop' ? 'cursor-move' : 'pointer-events-none')}
                onPointerCancel={endCropDrag}
                onPointerDown={startCropDrag('move')}
                onPointerMove={moveCropDrag}
                onPointerUp={endCropDrag}
                style={{
                  boxShadow: `0 0 0 9999px rgb(0 0 0 / ${tool === 'crop' ? 0.55 : 0.85})`,
                  height: `${crop.height * 100}%`,
                  left: `${crop.x * 100}%`,
                  top: `${crop.y * 100}%`,
                  width: `${crop.width * 100}%`
                }}
              >
                {tool === 'crop' ? (
                  <>
                    <div className="pointer-events-none absolute inset-0 border border-white/90" />
                    <div className="pointer-events-none absolute inset-y-0 left-1/3 w-px bg-white/30" />
                    <div className="pointer-events-none absolute inset-y-0 left-2/3 w-px bg-white/30" />
                    <div className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-white/30" />
                    <div className="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-white/30" />
                    {HANDLES.map((handle) => (
                      <span
                        aria-hidden
                        className={cn(
                          'absolute size-3 rounded-[2px] border border-black/40 bg-white shadow',
                          handle.className
                        )}
                        key={handle.id}
                        onPointerCancel={endCropDrag}
                        onPointerDown={startCropDrag(handle.id)}
                        onPointerMove={moveCropDrag}
                        onPointerUp={endCropDrag}
                      />
                    ))}
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <aside className="flex w-72 shrink-0 flex-col border-white/10 border-l bg-[#111113]">
          <div className="grid grid-cols-3 gap-1 border-white/10 border-b p-2">
            <ToolTab
              active={tool === 'crop'}
              icon={<Crop className="size-4" />}
              label={t('media.editor.tools.crop')}
              onClick={() => setTool('crop')}
            />
            <ToolTab
              active={tool === 'adjust'}
              icon={<SlidersHorizontal className="size-4" />}
              label={t('media.editor.tools.adjust')}
              onClick={() => setTool('adjust')}
            />
            <ToolTab
              active={tool === 'resize'}
              icon={<Scaling className="size-4" />}
              label={t('media.editor.tools.resize')}
              onClick={() => setTool('resize')}
            />
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
            {tool === 'crop' ? (
              <>
                <section>
                  <PanelHeading>{t('media.editor.aspect')}</PanelHeading>
                  <div className="grid grid-cols-4 gap-1.5">
                    {ASPECT_PRESETS.map((preset) => (
                      <button
                        aria-pressed={aspectId === preset.id}
                        className={cn(
                          'h-8 rounded-md border border-white/10 text-[11px] text-white/75 transition hover:bg-white/10',
                          aspectId === preset.id && 'border-primary bg-primary/15 text-white'
                        )}
                        key={preset.id}
                        onClick={() => selectAspect(preset.id)}
                        type="button"
                      >
                        {preset.id === 'free'
                          ? t('media.editor.aspectFree')
                          : preset.id === 'original'
                            ? t('media.editor.aspectOriginal')
                            : preset.label}
                      </button>
                    ))}
                  </div>
                  {state.crop ? (
                    <Button
                      className="mt-2 h-7 w-full text-white/70 text-xs hover:bg-white/10"
                      onClick={() => {
                        setAspectId('free')
                        commit({ ...state, crop: null })
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      {t('media.editor.clearCrop')}
                    </Button>
                  ) : null}
                </section>
                <section>
                  <PanelHeading>{t('media.editor.orientation')}</PanelHeading>
                  <div className="grid grid-cols-4 gap-1.5">
                    <EditorIconButton
                      label={t('media.editor.rotateLeft')}
                      onClick={() => rotate(false)}
                      shortcut="Shift+R"
                      wide
                    >
                      <RotateCcw className="size-4" />
                    </EditorIconButton>
                    <EditorIconButton
                      label={t('media.editor.rotateRight')}
                      onClick={() => rotate(true)}
                      shortcut="R"
                      wide
                    >
                      <RotateCw className="size-4" />
                    </EditorIconButton>
                    <EditorIconButton
                      label={t('media.editor.flipHorizontal')}
                      onClick={() => flip('horizontal')}
                      shortcut="H"
                      wide
                    >
                      <FlipHorizontal2 className="size-4" />
                    </EditorIconButton>
                    <EditorIconButton
                      label={t('media.editor.flipVertical')}
                      onClick={() => flip('vertical')}
                      shortcut="V"
                      wide
                    >
                      <FlipVertical2 className="size-4" />
                    </EditorIconButton>
                  </div>
                </section>
              </>
            ) : null}

            {tool === 'adjust' ? (
              <section className="space-y-4">
                {ADJUSTMENT_SPECS.map((spec) => {
                  const value = state.adjust[spec.key]
                  const neutral = NEUTRAL_ADJUSTMENTS[spec.key]
                  const id = `media-adjust-${spec.key}`
                  return (
                    <div key={spec.key}>
                      <div className="mb-1 flex items-center justify-between">
                        <label className="text-white/80 text-xs" htmlFor={id}>
                          {t(`media.editor.adjust.${spec.key}`)}
                        </label>
                        <button
                          className={cn(
                            'rounded px-1 text-[11px] text-white/50 tabular-nums hover:bg-white/10 hover:text-white',
                            value === neutral && 'pointer-events-none'
                          )}
                          onClick={() =>
                            commit({ ...state, adjust: { ...state.adjust, [spec.key]: neutral } })
                          }
                          title={t('media.editor.resetValue')}
                          type="button"
                        >
                          {spec.key === 'hue'
                            ? `${value}°`
                            : spec.key === 'blur'
                              ? `${value}px`
                              : `${value}`}
                        </button>
                      </div>
                      <input
                        className="w-full accent-primary"
                        id={id}
                        max={spec.max}
                        min={spec.min}
                        onChange={(event) => setAdjust(spec.key, Number(event.target.value))}
                        onKeyDown={beginGesture}
                        onKeyUp={endGesture}
                        onPointerDown={beginGesture}
                        onPointerUp={endGesture}
                        step={spec.step}
                        type="range"
                        value={value}
                      />
                    </div>
                  )
                })}
              </section>
            ) : null}

            {tool === 'resize' ? (
              <ResizePanel
                cropWidth={Math.max(1, Math.round(oriented.width * crop.width))}
                onChange={(resizeWidth) => commit({ ...state, resizeWidth })}
                output={output}
                resizeWidth={state.resizeWidth}
              />
            ) : null}
          </div>

          <div className="space-y-3 border-white/10 border-t p-3">
            <PanelHeading>{t('media.editor.format')}</PanelHeading>
            <div className="grid grid-cols-3 gap-1.5">
              {FORMAT_OPTIONS.map((option) => (
                <button
                  aria-pressed={mime === option.mime}
                  className={cn(
                    'h-8 rounded-md border border-white/10 text-white/75 text-xs transition hover:bg-white/10',
                    mime === option.mime && 'border-primary bg-primary/15 text-white'
                  )}
                  key={option.mime}
                  onClick={() => setMime(option.mime)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
            {mime === 'image/png' ? null : (
              <div>
                <div className="mb-1 flex items-center justify-between text-white/80 text-xs">
                  <label htmlFor="media-quality">{t('media.editor.quality')}</label>
                  <span className="text-white/50 tabular-nums">{quality}</span>
                </div>
                <input
                  className="w-full accent-primary"
                  id="media-quality"
                  max={100}
                  min={40}
                  onChange={(event) => setQuality(Number(event.target.value))}
                  type="range"
                  value={quality}
                />
              </div>
            )}
          </div>
        </aside>
      </div>

      <MediaConfirmDialog
        cancelLabel={t('media.editor.cancel')}
        confirmLabel={t('media.editor.overwriteConfirm')}
        description={t('media.editor.overwriteDescription', { name: asset.fileName })}
        destructive
        onConfirm={() => void handleSave('overwrite')}
        onOpenChange={(open) => setConfirm(open ? 'overwrite' : null)}
        open={confirm === 'overwrite'}
        title={t('media.editor.overwriteTitle')}
      />
      <MediaConfirmDialog
        cancelLabel={t('media.editor.keepEditing')}
        confirmLabel={t('media.editor.discard')}
        description={t('media.editor.discardDescription')}
        destructive
        onConfirm={onClose}
        onOpenChange={(open) => setConfirm(open ? 'discard' : null)}
        open={confirm === 'discard'}
        title={t('media.editor.discardTitle')}
      />
    </div>,
    document.body
  )
}

function PanelHeading({ children }: { children: string }) {
  return (
    <h3 className="mb-2 font-medium text-[11px] text-white/45 uppercase tracking-wider">
      {children}
    </h3>
  )
}

function ToolTab({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        'flex h-12 flex-col items-center justify-center gap-1 rounded-md text-[11px] text-white/60 transition hover:bg-white/5 hover:text-white',
        active && 'bg-white/10 text-white'
      )}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  )
}

function EditorIconButton({
  children,
  disabled,
  label,
  onClick,
  shortcut,
  wide = false
}: {
  children: React.ReactNode
  disabled?: boolean
  label: string
  onClick: () => void
  shortcut?: string
  wide?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          className={cn(
            'text-white/80 hover:bg-white/10 hover:text-white',
            wide ? 'h-9 w-full border border-white/10' : 'size-8'
          )}
          disabled={disabled}
          onClick={onClick}
          size="icon"
          variant="ghost"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        {shortcut ? <span className="ml-2 text-muted-foreground">{shortcut}</span> : null}
      </TooltipContent>
    </Tooltip>
  )
}

const RESIZE_PERCENTS = [100, 75, 50, 25] as const

function ResizePanel({
  cropWidth,
  onChange,
  output,
  resizeWidth
}: {
  cropWidth: number
  onChange: (width: number | null) => void
  output: { width: number; height: number }
  resizeWidth: number | null
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(String(output.width))

  useEffect(() => {
    setDraft(String(output.width))
  }, [output.width])

  const apply = () => {
    const width = Math.round(Number(draft))
    if (!Number.isFinite(width) || width < 1) {
      setDraft(String(output.width))
      return
    }
    onChange(width === cropWidth ? null : Math.min(width, cropWidth * 4))
  }

  return (
    <section className="space-y-3">
      <PanelHeading>{t('media.editor.tools.resize')}</PanelHeading>
      <div className="grid grid-cols-4 gap-1.5">
        {RESIZE_PERCENTS.map((percent) => {
          const width = Math.max(1, Math.round((cropWidth * percent) / 100))
          const active = (resizeWidth ?? cropWidth) === width
          return (
            <button
              aria-pressed={active}
              className={cn(
                'h-8 rounded-md border border-white/10 text-white/75 text-xs transition hover:bg-white/10',
                active && 'border-primary bg-primary/15 text-white'
              )}
              key={percent}
              onClick={() => onChange(percent === 100 ? null : width)}
              type="button"
            >
              {percent}%
            </button>
          )
        })}
      </div>
      <div className="flex items-end gap-2">
        <label className="flex-1 text-white/70 text-xs">
          {t('media.editor.width')}
          <input
            className="mt-1 h-8 w-full rounded-md border border-white/15 bg-transparent px-2 text-sm text-white tabular-nums outline-none focus:border-primary"
            inputMode="numeric"
            onBlur={apply}
            onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                apply()
              }
            }}
            value={draft}
          />
        </label>
        <span className="pb-2 text-white/40 text-xs">×</span>
        <div className="flex-1 text-white/70 text-xs">
          {t('media.editor.height')}
          <div className="mt-1 flex h-8 items-center rounded-md border border-white/10 px-2 text-sm text-white/60 tabular-nums">
            {output.height}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-white/45">{t('media.editor.resizeHint')}</p>
    </section>
  )
}
