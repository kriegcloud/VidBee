import { type Task, type TaskCreationMetadata, type TaskPriority, type TaskQueueAPI } from '@vidbee/task-queue-legacy';
import { type TranscriptionProvider } from './cloud';
import type { MemoryTranscriptStore } from './memory-store';
import type { SpeakerCount } from './speaker-count';
import type { TranscriptStore } from './transcript-store';
import type { TranscriptionTrigger } from './types';
export interface EnqueueTranscriptionInput {
    provider?: TranscriptionProvider;
    cloudModelId?: string;
    queue: TaskQueueAPI;
    creation?: TaskCreationMetadata;
    store: TranscriptStore | MemoryTranscriptStore;
    downloadTaskId: string;
    sourceFilePath: string;
    title?: string;
    trigger: TranscriptionTrigger;
    priority?: TaskPriority;
    asrTier?: string;
    language?: string;
    speakerCount?: SpeakerCount;
    rediarize?: boolean;
}
export interface EnqueueTranscriptionResult {
    id: string;
    created: boolean;
    reused: boolean;
}
export declare function listTranscriptionChildren(queue: TaskQueueAPI, downloadTaskId: string): Task[];
export declare function findActiveTranscription(queue: TaskQueueAPI, downloadTaskId: string): Task | undefined;
/** Enqueue or reuse local transcription without rewriting existing creation provenance. */
export declare function enqueueTranscription(input: EnqueueTranscriptionInput): Promise<EnqueueTranscriptionResult>;
export declare const isTerminalTranscription: (task: Task) => boolean;
