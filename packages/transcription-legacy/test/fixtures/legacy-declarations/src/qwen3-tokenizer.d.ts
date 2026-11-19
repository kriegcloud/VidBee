// Pre-port compiler-emitted declaration closure; kept unchanged for compatibility checks.
import type { DirectoryMemberRequirement } from './types';
/** Prefix for a model tree that must not be treated as installed. */
export declare const INCOMPLETE_MODEL_ERROR = "incomplete model";
/**
 * Action the reporter confirmed unblocks Qwen3-ASR when the on-disk tokenizer
 * cannot be repaired automatically.
 */
export declare const QWEN3_TOKENIZER_REPAIR_HINT = "Replace the Qwen3-ASR tokenizer from the official package, or switch to Whisper Tiny.";
/**
 * Tokenizer files shipped in sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25.
 * Sizes and digests are from that revision, not a later package.
 */
export declare const QWEN3_ASR_TOKENIZER_FILES: readonly DirectoryMemberRequirement[];
export interface DirectoryAssessment {
    present: boolean;
    bytes: number;
    /** Set when the directory exists but does not match the pinned members. */
    issue: string | null;
}
/**
 * Decide whether a directory matches pinned member files.
 * A missing directory is not installed. A directory that exists with truncated
 * JSON, short files, or a bad checksum is an incomplete model.
 *
 * @param dir Absolute directory path.
 * @param members Version-pinned files that must all pass.
 * @param withRepairHint Append the Qwen3 tokenizer workaround to the error.
 */
export declare const assessDirectoryMembers: (dir: string, members: readonly DirectoryMemberRequirement[], withRepairHint?: boolean) => DirectoryAssessment;
