import { z } from "zod";

export const DownloadTypeSchema = z.enum(['video', 'audio'])

export const OneClickQualityPresetSchema = z.enum(['best', 'good', 'normal', 'bad', 'worst'])

export const OneClickContainerOptionSchema = z.enum(['auto', 'mp4', 'mkv', 'webm', 'original'])
