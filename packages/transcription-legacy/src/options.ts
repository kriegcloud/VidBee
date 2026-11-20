import * as Core from '@vidbee/transcription/options'
import type { TaskCreationMetadata, TaskInput } from '@vidbee/task-queue-legacy'
import type { TranscriptionTaskOptions, TranscriptionTrigger } from './types'

export const isTranscriptionTrigger = (value: unknown): value is TranscriptionTrigger =>
  Core.isTranscriptionTrigger(value)

export function readTranscriptionOptions(input: TaskInput): TranscriptionTaskOptions | null { return Core.readTranscriptionOptions(input); }

/** Build executor options and preserve the trusted caller's task provenance. */
export function buildTranscriptionInput(
  opts: TranscriptionTaskOptions & { title?: string; creation?: TaskCreationMetadata }
): TaskInput { return Core.buildTranscriptionInput(opts); }
