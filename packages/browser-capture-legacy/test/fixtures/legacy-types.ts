// Pre-port public declarations kept for compile-time compatibility checks.
// Frozen before phase 6b; no production or test module imports this fixture yet.
// Frozen pre-port compiler-emitted declaration closure; kept for compile-time compatibility checks.
export { isBrowserCaptureAvailable, resolveBrowserExecutable, resolveXvfbPath } from './legacy-declarations/availability';
export { parseNetscapeCookieFile } from './legacy-declarations/cookies';
export { DrmFallbackExecutor } from './legacy-declarations/drm-fallback';
export { BrowserCaptureExecutor } from './legacy-declarations/executor';
export { capturePageUrl, DRM_FALLBACK_MESSAGE, isDrmProtectedMessage, playbackPageUrl } from './legacy-declarations/drm';
export { encodeSidecarEvent, parseSidecarEvent } from './legacy-declarations/protocol';
export { evenSize, VIRTUAL_DISPLAY_SIZE, CAPTURE_X264_CRF, CAPTURE_FPS } from './legacy-declarations/quality';

export * as OnlyFans from './legacy-declarations/onlyfans-profile'
export * as Fansly from './legacy-declarations/fansly-profile'
