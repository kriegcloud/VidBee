// Frozen pre-port compiler-emitted declaration closure; kept for compile-time compatibility checks.
/** Virtual screen large enough that ABR will not cap below 4K in either orientation. */
export declare const VIRTUAL_DISPLAY_SIZE: {
    readonly width: 3840;
    readonly height: 3840;
};
/** x11grab rate: high enough for 60 fps sources; 30 fps content just repeats frames. */
export declare const CAPTURE_FPS = 60;
/** Realtime x264: low CRF without dropping frames on a live grab. */
export declare const CAPTURE_X264_CRF = 12;
/** AAC bitrate for the Pulse mix of decoded playback. */
export declare const CAPTURE_AUDIO_BITRATE_K = 320;
/** yuv420p needs even dimensions. */
export declare const evenSize: (width: number, height: number) => {
    width: number;
    height: number;
};
export interface DecodedQuality {
    fps: number;
    height: number;
    method: string;
    width: number;
}
export declare const pinHighestQualityInPage: () => DecodedQuality;
export declare const spoofLargePlayerBoxInPage: () => void;
