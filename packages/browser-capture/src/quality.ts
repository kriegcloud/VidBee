import { dual } from "effect/Function";
import {
  pinHighestQualityInPage as pinHighestQualityInPageImpl,
  spoofLargePlayerBoxInPage as spoofLargePlayerBoxInPageImpl,
} from "./quality-page.js";

/** Virtual screen large enough that ABR will not cap below 4K in either orientation. */
export const VIRTUAL_DISPLAY_SIZE = { width: 3840, height: 3840 } as const;

/** x11grab rate: high enough for 60 fps sources; 30 fps content just repeats frames. */
export const CAPTURE_FPS = 60;

/** Realtime x264: low CRF without dropping frames on a live grab. */
export const CAPTURE_X264_CRF = 12;

/** AAC bitrate for the Pulse mix of decoded playback. */
export const CAPTURE_AUDIO_BITRATE_K = 320;

/** yuv420p needs even dimensions. */
const evenSizeDataFirst = (width: number, height: number): { width: number; height: number } => ({
  width: Math.max(2, width + (width % 2)),
  height: Math.max(2, height + (height % 2)),
});

export type { DecodedQuality } from "./Playback.model.js";
export const pinHighestQualityInPage = pinHighestQualityInPageImpl;
export const spoofLargePlayerBoxInPage = spoofLargePlayerBoxInPageImpl;

export const evenSize: {
  (height: number): (width: number) => { width: number; height: number };
  (width: number, height: number): { width: number; height: number };
} = dual(2, evenSizeDataFirst);
