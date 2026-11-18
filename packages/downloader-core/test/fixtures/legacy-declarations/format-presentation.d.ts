import type { VideoFormat } from './types';
type FormatType = 'video' | 'audio';
export declare const filterFormatsByType: <T extends VideoFormat>(formats: readonly T[], type: FormatType) => T[];
/** Keep the desktop and web format pickers consistent. */
export declare const getDisplayFormats: <T extends VideoFormat>({ formats, type, codec }: {
    formats: readonly T[];
    type: FormatType;
    codec?: string;
}) => {
    videoFormats: T[];
    audioFormats: T[];
};
export {};
