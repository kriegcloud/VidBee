import { capturePageUrl as capture } from '../../browser-capture/src/drm.js'
export { playbackPageUrl, DRM_FALLBACK_MESSAGE, isDrmProtectedMessage } from '../../browser-capture/src/drm.js'
export const capturePageUrl=(value:string,videoOrdinal?:number):string=>capture(value,videoOrdinal)
