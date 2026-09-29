/**
 * Non-destructive image edit model for the gallery editor.
 *
 * Ported in spirit from Omoide's `editorOps.ts`, with one deliberate change:
 * every adjustment is expressed as a CSS filter function, so the live preview
 * (CSS `filter` on a canvas) and the export (`ctx.filter` on a 2D canvas) run
 * the exact same pipeline. Omoide's Filerobot preview and Pillow replay could
 * disagree; here they cannot.
 *
 * Replay order: orient (flip, then clockwise rotation) → filter → crop → resize.
 * Crop is stored normalized (0–1) in the oriented frame, so it survives
 * preview downscaling and applies unchanged at full resolution.
 */

export type RightAngle = 0 | 90 | 180 | 270

export interface NormalizedRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ImageAdjustments {
  /** Percent, 100 = neutral. */
  brightness: number
  contrast: number
  saturation: number
  /** Degrees, 0 = neutral. */
  hue: number
  /** Percent 0–100. */
  grayscale: number
  sepia: number
  /** Pixels at source resolution, 0 = neutral. */
  blur: number
}

export interface ImageEditState {
  rotation: RightAngle
  flipH: boolean
  flipV: boolean
  crop: NormalizedRect | null
  adjust: ImageAdjustments
  /** Output width in px after crop; height follows the aspect ratio. */
  resizeWidth: number | null
}

export const NEUTRAL_ADJUSTMENTS: ImageAdjustments = {
  blur: 0,
  brightness: 100,
  contrast: 100,
  grayscale: 0,
  hue: 0,
  saturation: 100,
  sepia: 0
}

export const INITIAL_EDIT_STATE: ImageEditState = {
  adjust: NEUTRAL_ADJUSTMENTS,
  crop: null,
  flipH: false,
  flipV: false,
  resizeWidth: null,
  rotation: 0
}

export interface AspectPreset {
  id: string
  /** width / height, or null for free-form. */
  ratio: number | null
  label: string
}

/** Crop presets: Omoide's list plus the vertical/horizontal video ratios. */
export const ASPECT_PRESETS: readonly AspectPreset[] = [
  { id: 'free', label: 'Free', ratio: null },
  { id: 'original', label: 'Original', ratio: null },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '3:4', label: '3:4', ratio: 3 / 4 },
  { id: '2:3', label: '2:3', ratio: 2 / 3 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
  { id: '5:4', label: '5:4', ratio: 5 / 4 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '3:2', label: '3:2', ratio: 3 / 2 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 }
]

export interface AdjustmentSpec {
  key: keyof ImageAdjustments
  min: number
  max: number
  step: number
}

export const ADJUSTMENT_SPECS: readonly AdjustmentSpec[] = [
  { key: 'brightness', max: 200, min: 0, step: 1 },
  { key: 'contrast', max: 200, min: 0, step: 1 },
  { key: 'saturation', max: 200, min: 0, step: 1 },
  { key: 'hue', max: 180, min: -180, step: 1 },
  { key: 'grayscale', max: 100, min: 0, step: 1 },
  { key: 'sepia', max: 100, min: 0, step: 1 },
  { key: 'blur', max: 20, min: 0, step: 0.5 }
]

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/**
 * Build the CSS/canvas filter string for a set of adjustments.
 *
 * @param blurScale Multiplier for blur so a downscaled preview matches full-res output.
 */
export const buildFilter = (adjust: ImageAdjustments, blurScale = 1): string => {
  const parts: string[] = []
  if (adjust.brightness !== 100) {
    parts.push(`brightness(${adjust.brightness}%)`)
  }
  if (adjust.contrast !== 100) {
    parts.push(`contrast(${adjust.contrast}%)`)
  }
  if (adjust.saturation !== 100) {
    parts.push(`saturate(${adjust.saturation}%)`)
  }
  if (adjust.hue !== 0) {
    parts.push(`hue-rotate(${adjust.hue}deg)`)
  }
  if (adjust.grayscale !== 0) {
    parts.push(`grayscale(${adjust.grayscale}%)`)
  }
  if (adjust.sepia !== 0) {
    parts.push(`sepia(${adjust.sepia}%)`)
  }
  if (adjust.blur > 0) {
    parts.push(`blur(${(adjust.blur * blurScale).toFixed(2)}px)`)
  }
  return parts.length > 0 ? parts.join(' ') : 'none'
}

export const isNeutralAdjust = (adjust: ImageAdjustments): boolean => buildFilter(adjust) === 'none'

export const isNeutralEdit = (state: ImageEditState): boolean =>
  state.rotation === 0 &&
  !state.flipH &&
  !state.flipV &&
  state.crop === null &&
  state.resizeWidth === null &&
  isNeutralAdjust(state.adjust)

/** Dimensions after rotation (flip does not change them). */
export const orientedSize = (
  width: number,
  height: number,
  rotation: RightAngle
): { width: number; height: number } =>
  rotation === 90 || rotation === 270 ? { height: width, width: height } : { height, width }

/** Final pixel size after crop and resize. */
export const outputSize = (
  sourceWidth: number,
  sourceHeight: number,
  state: ImageEditState
): { width: number; height: number } => {
  const oriented = orientedSize(sourceWidth, sourceHeight, state.rotation)
  const crop = state.crop ?? { height: 1, width: 1, x: 0, y: 0 }
  const cropWidth = Math.max(1, Math.round(oriented.width * crop.width))
  const cropHeight = Math.max(1, Math.round(oriented.height * crop.height))
  if (!state.resizeWidth || state.resizeWidth === cropWidth) {
    return { height: cropHeight, width: cropWidth }
  }
  const width = Math.max(1, Math.round(state.resizeWidth))
  return { height: Math.max(1, Math.round((cropHeight * width) / cropWidth)), width }
}

/**
 * Draw the source flipped and rotated into a canvas sized to the oriented frame.
 *
 * @param scale Downscale factor for previews (1 for export).
 */
export const drawOriented = (
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  state: Pick<ImageEditState, 'rotation' | 'flipH' | 'flipV'>,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  options: { scale?: number; filter?: string } = {}
): void => {
  const scale = options.scale ?? 1
  const drawWidth = Math.max(1, Math.round(sourceWidth * scale))
  const drawHeight = Math.max(1, Math.round(sourceHeight * scale))
  const oriented = orientedSize(drawWidth, drawHeight, state.rotation)
  canvas.width = oriented.width
  canvas.height = oriented.height
  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable')
  }
  ctx.save()
  ctx.filter = options.filter ?? 'none'
  ctx.imageSmoothingQuality = 'high'
  ctx.translate(oriented.width / 2, oriented.height / 2)
  ctx.rotate((state.rotation * Math.PI) / 180)
  ctx.scale(state.flipH ? -1 : 1, state.flipV ? -1 : 1)
  ctx.drawImage(source, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
  ctx.restore()
}

export type EncodedImageMime = 'image/png' | 'image/jpeg' | 'image/webp'

/**
 * Render an edit at full resolution and encode it.
 *
 * @param quality 0–1 for JPEG/WebP; ignored for PNG.
 */
export const renderEditedImage = async (
  source: HTMLImageElement,
  state: ImageEditState,
  mime: EncodedImageMime,
  quality = 0.92
): Promise<Blob> => {
  const sourceWidth = source.naturalWidth
  const sourceHeight = source.naturalHeight
  const oriented = document.createElement('canvas')
  drawOriented(source, sourceWidth, sourceHeight, state, oriented, {
    filter: buildFilter(state.adjust)
  })

  const crop = state.crop ?? { height: 1, width: 1, x: 0, y: 0 }
  const sx = Math.round(clamp(crop.x, 0, 1) * oriented.width)
  const sy = Math.round(clamp(crop.y, 0, 1) * oriented.height)
  const sw = Math.max(1, Math.min(oriented.width - sx, Math.round(crop.width * oriented.width)))
  const sh = Math.max(1, Math.min(oriented.height - sy, Math.round(crop.height * oriented.height)))
  const size = outputSize(sourceWidth, sourceHeight, state)

  const output = document.createElement('canvas')
  output.width = size.width
  output.height = size.height
  const ctx = output.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable')
  }
  ctx.imageSmoothingQuality = 'high'
  if (mime === 'image/jpeg') {
    // JPEG has no alpha; flatten transparent sources onto white instead of black.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size.width, size.height)
  }
  ctx.drawImage(oriented, sx, sy, sw, sh, 0, 0, size.width, size.height)
  oriented.width = 0
  oriented.height = 0

  const blob = await new Promise<Blob | null>((resolve) => {
    output.toBlob(resolve, mime, quality)
  })
  output.width = 0
  output.height = 0
  if (!blob) {
    throw new Error('Could not encode the edited image')
  }
  return blob
}

/**
 * Fit a crop of the given aspect ratio, centered, inside the oriented frame.
 *
 * @param ratio Desired output width / height in pixels.
 * @param frameAspect Oriented frame width / height in pixels.
 */
export const centeredCrop = (ratio: number, frameAspect: number): NormalizedRect => {
  // Normalized width/height relate by: (w * frameW) / (h * frameH) = ratio.
  let width = 1
  let height = frameAspect / ratio
  if (height > 1) {
    height = 1
    width = ratio / frameAspect
  }
  return { height, width, x: (1 - width) / 2, y: (1 - height) / 2 }
}

export type CropHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'move'

const MIN_CROP = 0.02

/**
 * Apply a pointer drag to a crop rectangle.
 *
 * @param dx Normalized horizontal delta.
 * @param dy Normalized vertical delta.
 * @param ratio Locked output aspect (px/px) or null for free-form.
 * @param frameAspect Oriented frame width / height, to convert the lock to normalized units.
 */
export const dragCrop = (
  start: NormalizedRect,
  handle: CropHandle,
  dx: number,
  dy: number,
  ratio: number | null,
  frameAspect: number
): NormalizedRect => {
  if (handle === 'move') {
    return {
      ...start,
      x: clamp(start.x + dx, 0, 1 - start.width),
      y: clamp(start.y + dy, 0, 1 - start.height)
    }
  }
  let left = start.x
  let top = start.y
  let right = start.x + start.width
  let bottom = start.y + start.height
  if (handle.includes('w')) {
    left = clamp(left + dx, 0, right - MIN_CROP)
  }
  if (handle.includes('e')) {
    right = clamp(right + dx, left + MIN_CROP, 1)
  }
  if (handle.includes('n')) {
    top = clamp(top + dy, 0, bottom - MIN_CROP)
  }
  if (handle.includes('s')) {
    bottom = clamp(bottom + dy, top + MIN_CROP, 1)
  }
  if (ratio === null) {
    return { height: bottom - top, width: right - left, x: left, y: top }
  }
  // Normalized height that keeps the pixel aspect locked.
  const normalizedRatio = ratio / frameAspect
  let width = right - left
  let height = width / normalizedRatio
  const vertical = handle === 'n' || handle === 's'
  if (vertical) {
    height = bottom - top
    width = height * normalizedRatio
  }
  const anchorX = handle.includes('w') ? right : left
  const anchorY = handle.includes('n') ? bottom : top
  const maxWidth = handle.includes('w') ? anchorX : 1 - anchorX
  const maxHeight = handle.includes('n') ? anchorY : 1 - anchorY
  if (vertical) {
    const centerX = start.x + start.width / 2
    const halfMax = Math.min(centerX, 1 - centerX)
    width = Math.min(width, halfMax * 2)
  } else {
    width = Math.min(width, maxWidth)
  }
  height = width / normalizedRatio
  if (height > maxHeight) {
    height = maxHeight
    width = height * normalizedRatio
  }
  width = Math.max(width, MIN_CROP)
  height = Math.max(height, MIN_CROP)
  const x = vertical
    ? start.x + start.width / 2 - width / 2
    : handle.includes('w')
      ? anchorX - width
      : anchorX
  const y = handle.includes('n') ? anchorY - height : anchorY
  return {
    height,
    width,
    x: clamp(x, 0, 1 - width),
    y: clamp(y, 0, 1 - height)
  }
}

/**
 * Rotate a crop rect along with the image so a 90° turn keeps the same region.
 */
export const rotateCrop = (
  crop: NormalizedRect | null,
  clockwise: boolean
): NormalizedRect | null => {
  if (!crop) {
    return null
  }
  return clockwise
    ? { height: crop.width, width: crop.height, x: 1 - crop.y - crop.height, y: crop.x }
    : { height: crop.width, width: crop.height, x: crop.y, y: 1 - crop.x - crop.width }
}

/** Mirror a crop rect when the image flips. */
export const flipCrop = (
  crop: NormalizedRect | null,
  axis: 'horizontal' | 'vertical'
): NormalizedRect | null => {
  if (!crop) {
    return null
  }
  return axis === 'horizontal'
    ? { ...crop, x: 1 - crop.x - crop.width }
    : { ...crop, y: 1 - crop.y - crop.height }
}

const MIME_BY_EXT: Record<string, EncodedImageMime> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
}

/** Default output format: keep the source format when the canvas can encode it. */
export const defaultOutputMime = (ext: string): EncodedImageMime =>
  MIME_BY_EXT[ext.toLowerCase()] ?? 'image/png'

export const mimeToFormat = (mime: EncodedImageMime): 'png' | 'jpeg' | 'webp' =>
  mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpeg' : 'webp'
