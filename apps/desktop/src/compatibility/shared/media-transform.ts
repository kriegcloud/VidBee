import '@vidbee/task-queue-legacy/process'
import { z } from 'zod'
import * as Native from '../../shared/media-transform'

/** Structured media operations never accept arbitrary process flags or output paths. */
export const mediaTransformSchema = z
  .object({
    parentId: z.string().min(1).max(200),
    format: z.enum(['mp4', 'mkv', 'webm', 'mp3', 'm4a', 'wav', 'flac']),
    startSeconds: z.number().min(0).max(864_000).optional(),
    durationSeconds: z.number().positive().max(864_000).optional(),
    height: z.number().int().min(144).max(4320).multipleOf(2).optional(),
    title: z.string().min(1).max(200).optional()
  })
  .strict()
export type MediaTransformInput = z.infer<typeof mediaTransformSchema>

/** Produce deterministic output codecs and optional trim/scale arguments. */
export function buildMediaTransformArgs(
  input: MediaTransformInput,
  source: string,
  output: string
): string[] {
  return Native.buildMediaTransformArgs({
    input,
    source,
    output
  })
}
