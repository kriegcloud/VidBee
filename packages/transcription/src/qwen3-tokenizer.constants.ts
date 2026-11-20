import type { DirectoryMemberRequirement } from "./Model.model.js";
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
