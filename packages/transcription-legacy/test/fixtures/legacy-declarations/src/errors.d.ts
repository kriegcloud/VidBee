// Pre-port compiler-emitted declaration closure; kept unchanged for compatibility checks.
import { type ClassifiedError, type ErrorCategory } from '@vidbee/task-queue-legacy';
/** Thrown when the source media has no audio track to decode. */
export declare const NO_AUDIO_STREAM_ERROR = "source has no audio stream";
/**
 * Build a classified transcription error from a category and message.
 *
 * @param category Task-queue error category.
 * @param message Raw worker or ffmpeg message.
 */
export declare function transcriptionError(category: ErrorCategory, message: string): ClassifiedError;
/**
 * True when ffmpeg/ffprobe failed because the media has no audio track.
 *
 * @param message Worker, ffmpeg, or ffprobe error text.
 */
export declare function isNoAudioStreamError(message: string): boolean;
/**
 * Map a transcription worker failure onto a classified task-queue error.
 *
 * @param err Thrown value from extract, pipeline, or worker protocol.
 */
export declare function classifyTranscriptionFailure(err: unknown): ClassifiedError;
