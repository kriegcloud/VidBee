// Pre-port compiler-emitted declaration closure; kept unchanged for compatibility checks.
import type { TaskCreationMetadata, TaskInput } from '@vidbee/task-queue-legacy';
import type { TranscriptionTaskOptions, TranscriptionTrigger } from './types';
export declare const isTranscriptionTrigger: (value: unknown) => value is TranscriptionTrigger;
export declare function readTranscriptionOptions(input: TaskInput): TranscriptionTaskOptions | null;
/** Build executor options and preserve the trusted caller's task provenance. */
export declare function buildTranscriptionInput(opts: TranscriptionTaskOptions & {
    title?: string;
    creation?: TaskCreationMetadata;
}): TaskInput;
