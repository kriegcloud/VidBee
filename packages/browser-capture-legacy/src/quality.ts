import { evenSize as size } from '../../browser-capture/src/quality.js'
export { VIRTUAL_DISPLAY_SIZE, CAPTURE_FPS, CAPTURE_X264_CRF, CAPTURE_AUDIO_BITRATE_K, pinHighestQualityInPage, spoofLargePlayerBoxInPage } from '../../browser-capture/src/quality.js'
export type { DecodedQuality } from '../../browser-capture/src/Playback.model.js'
export const evenSize=(width:number,height:number):{width:number;height:number}=>size(width,height)
