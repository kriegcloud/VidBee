import * as Core from '../../transcription/src/errors'
import { type ClassifiedError, type ErrorCategory } from '@vidbee/task-queue-legacy'

/** Thrown when the source media has no audio track to decode. */
export const NO_AUDIO_STREAM_ERROR = 'source has no audio stream'

/**
 * Build a classified transcription error from a category and message.
 *
 * @param category Task-queue error category.
 * @param message Raw worker or ffmpeg message.
 */
export function transcriptionError(category: ErrorCategory, message: string): ClassifiedError { return Core.transcriptionError(category, message) }

/**
 * True when ffmpeg/ffprobe failed because the media has no audio track.
 *
 * @param message Worker, ffmpeg, or ffprobe error text.
 */
export function isNoAudioStreamError(message: string): boolean { return Core.isNoAudioStreamError(message) }

/**
 * Map a transcription worker failure onto a classified task-queue error.
 *
 * @param err Thrown value from extract, pipeline, or worker protocol.
 */
export function classifyTranscriptionFailure(err: unknown): ClassifiedError { return Core.classifyTranscriptionFailure(err) }
