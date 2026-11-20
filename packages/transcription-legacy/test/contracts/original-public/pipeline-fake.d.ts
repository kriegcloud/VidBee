import { type PipelineRunInput, type TranscriptionPipeline } from './pipeline';
import type { PipelineResult } from './types';
export interface FakePipelineOptions {
    result?: PipelineResult;
    speech?: boolean;
    delayMs?: number;
}
export declare class FakeTranscriptionPipeline implements TranscriptionPipeline {
    private readonly opts;
    constructor(opts?: FakePipelineOptions);
    run(input: PipelineRunInput): Promise<PipelineResult>;
}
