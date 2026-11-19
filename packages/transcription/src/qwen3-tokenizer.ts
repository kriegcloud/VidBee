import * as Effect from "effect/Effect";
import * as Fn from "effect/Function";
import { ModelFiles } from "./ModelFiles.service.js";
import type { DirectoryAssessment, DirectoryMemberRequirement } from "./Model.model.js";
import type { HostFailure } from "./Transcription.errors.js";

export type { DirectoryAssessment } from "./Model.model.js";

/** Prefix for a model tree that must not be treated as installed. */
export const INCOMPLETE_MODEL_ERROR = "incomplete model";

/**
 * Action the reporter confirmed unblocks Qwen3-ASR when the on-disk tokenizer
 * cannot be repaired automatically.
 */
export const QWEN3_TOKENIZER_REPAIR_HINT =
  "Replace the Qwen3-ASR tokenizer from the official package, or switch to Whisper Tiny.";

/**
 * Tokenizer files shipped in sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25.
 * Sizes and digests are from that revision, not a later package.
 */
export const QWEN3_ASR_TOKENIZER_FILES: readonly DirectoryMemberRequirement[] = [
  {
    name: "vocab.json",
    minBytes: 2_776_833,
    sha256: "ca10d7e9fb3ed18575dd1e277a2579c16d108e32f27439684afa0e10b1440910",
    json: true,
  },
  {
    name: "merges.txt",
    minBytes: 1_671_853,
    sha256: "8831e4f1a044471340f7c0a83d7bd71306a5b867e95fd870f74d0c5308a904d5",
  },
  {
    name: "tokenizer_config.json",
    minBytes: 12_487,
    sha256: "4942d005604266809309cabc9f4e9cb89ce855d59b14681fdc0e1cc62ea26c4c",
    json: true,
  },
];

export const assessDirectoryMembers: {
  (
    dir: string,
    members: readonly DirectoryMemberRequirement[],
    withRepairHint: boolean
  ): Effect.Effect<DirectoryAssessment, HostFailure, ModelFiles>;
  (
    members: readonly DirectoryMemberRequirement[],
    withRepairHint: boolean
  ): (dir: string) => Effect.Effect<DirectoryAssessment, HostFailure, ModelFiles>;
} = Fn.dual(
  3,
  Effect.fn("assessDirectoryMembers")(
    (dir: string, members: readonly DirectoryMemberRequirement[], withRepairHint: boolean) =>
      ModelFiles.pipe(Effect.flatMap((files) => files.assessDirectory(dir, members, withRepairHint)))
  )
);
