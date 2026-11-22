import * as S from "effect/Schema";
import { Approval, ErrorCode, RunStatus, Thinking, ToolStatus, UiResponse, UiSpec } from "./Ai.rpc.js";

const optional = <F extends S.Constraint>(field: F) => S.optionalKey(S.UndefinedOr(field));
const array = <F extends S.Constraint>(field: F) => S.mutable(S.Array(field));
const internal = <F extends S.Struct.Fields>(fields: F) =>
  S.StructWithRest(S.Struct(fields), [S.Record(S.String, S.mutableKey(S.Unknown))]);
export const StoredMessage = internal({
  id: S.mutableKey(S.String),
  parentId: S.String.pipe(S.NullOr, S.mutableKey),
  runId: S.String.pipe(S.NullOr, S.mutableKey),
  role: S.mutableKey(S.Literals(["user", "assistant"])),
  text: S.mutableKey(S.String),
  thinking: S.mutableKey(S.String),
  createdAt: S.mutableKey(S.Finite),
  uiResponse: UiResponse.pipe(optional, S.mutableKey),
  imageIds: S.mutableKey(S.String.pipe(array, optional)),
  thinkingMs: S.Finite.pipe(optional, S.mutableKey),
  legacy: S.Boolean.pipe(optional, S.mutableKey),
});
export const StoredArtifact = internal({
  id: S.mutableKey(S.String),
  threadId: S.mutableKey(S.String),
  runId: S.mutableKey(S.String),
  sourceDownloadId: S.String.pipe(optional, S.mutableKey),
  kind: S.mutableKey(S.Literals(["image", "video"])),
  name: S.mutableKey(S.String),
  path: S.mutableKey(S.String),
  posterPath: S.String.pipe(optional, S.mutableKey),
  start: S.mutableKey(S.Finite),
  end: S.Finite.pipe(optional, S.mutableKey),
  width: S.Finite.pipe(optional, S.mutableKey),
  height: S.Finite.pipe(optional, S.mutableKey),
});
export const StoredImage = internal({
  id: S.mutableKey(S.String),
  threadId: S.mutableKey(S.String),
  name: S.mutableKey(S.String),
  path: S.mutableKey(S.String),
  mimeType: S.mutableKey(S.Literals(["image/png", "image/jpeg"])),
  createdAt: S.mutableKey(S.Finite),
  width: S.mutableKey(S.Finite),
  height: S.mutableKey(S.Finite),
});
export const StoredTool = internal({
  id: S.mutableKey(S.String),
  name: S.mutableKey(S.String),
  status: S.mutableKey(ToolStatus),
  detail: S.String.pipe(optional, S.mutableKey),
  taskId: S.String.pipe(optional, S.mutableKey),
  approval: Approval.pipe(optional, S.mutableKey),
  ui: UiSpec.pipe(optional, S.mutableKey),
  skills: S.mutableKey(
    internal({
      name: S.mutableKey(S.String),
      description: S.mutableKey(S.String),
      resource: S.mutableKey(S.String),
    }).pipe(array, optional)
  ),
});
export const StoredActivity = S.Union([
  internal({
    id: S.mutableKey(S.String),
    kind: S.mutableKey(S.Literals(["thinking", "commentary"])),
    text: S.mutableKey(S.String),
  }),
  internal({
    id: S.mutableKey(S.String),
    kind: S.mutableKey(S.Literal("status")),
    status: S.mutableKey(S.Literals(["retrying", "compacting", "recovering"])),
  }),
  internal({
    id: S.mutableKey(S.String),
    kind: S.mutableKey(S.Literal("tool")),
    toolId: S.mutableKey(S.String),
    name: S.mutableKey(S.String),
    count: S.Finite.pipe(optional, S.mutableKey),
    artifactIds: S.String.pipe(array, S.mutableKey),
  }),
]);
export const StoredRun = internal({
  id: S.mutableKey(S.String),
  messageId: S.mutableKey(S.String),
  status: S.mutableKey(RunStatus),
  error: S.String.pipe(S.NullOr, S.mutableKey),
  errorCode: ErrorCode.pipe(optional, S.mutableKey),
  model: S.mutableKey(S.String),
  instruction: S.mutableKey(S.String),
  createdAt: S.mutableKey(S.Finite),
  updatedAt: S.mutableKey(S.Finite),
  rawMessages: S.Unknown.pipe(array, S.mutableKey),
  sessionEntries: S.mutableKey(S.Unknown.pipe(array, optional)),
  evidenceCoverage: S.mutableKey(
    S.Record(S.String, S.Tuple([S.Finite, S.Finite]).pipe(S.mutable, array, S.mutableKey)).pipe(optional)
  ),
  evidenceSource: S.String.pipe(optional, S.mutableKey),
  sourceDownloadId: S.String.pipe(optional, S.mutableKey),
  taskIds: S.mutableKey(S.String.pipe(array, optional)),
  fullSourceReview: S.Boolean.pipe(optional, S.mutableKey),
  preloadedSourceLines: S.Finite.pipe(optional, S.mutableKey),
  articleSections: S.mutableKey(S.Unknown.pipe(array, optional)),
  articleReview: internal({
    status: S.Literals(["passed", "issues", "unavailable"]).pipe(optional, S.mutableKey),
    checkedSections: S.mutableKey(S.Finite),
    issues: S.mutableKey(S.Finite),
    passed: S.mutableKey(S.Boolean),
  }).pipe(optional, S.mutableKey),
  activity: S.mutableKey(StoredActivity.pipe(array, optional)),
  lifecycle: S.mutableKey(
    internal({
      id: S.mutableKey(S.String),
      messageCount: S.mutableKey(S.Finite),
      status: S.mutableKey(S.Literals(["retrying", "compacting", "recovering"])),
    }).pipe(array, optional)
  ),
  tools: StoredTool.pipe(array, S.mutableKey),
  usage: internal({
    input: S.mutableKey(S.Finite),
    output: S.mutableKey(S.Finite),
    totalTokens: S.mutableKey(S.Finite),
    cacheRead: S.Finite.pipe(optional, S.mutableKey),
    cacheWrite: S.Finite.pipe(optional, S.mutableKey),
    reasoning: S.Finite.pipe(optional, S.mutableKey),
  }).pipe(optional, S.mutableKey),
  sourceOffset: S.Finite.pipe(optional, S.mutableKey),
  contextSummary: internal({ digest: S.mutableKey(S.String), text: S.mutableKey(S.String) }).pipe(
    optional,
    S.mutableKey
  ),
  contextCheckpoint: internal({
    coveredCount: S.mutableKey(S.Finite),
    digest: S.mutableKey(S.String),
    text: S.mutableKey(S.String),
  }).pipe(optional, S.mutableKey),
  workingNotes: S.String.pipe(optional, S.mutableKey),
  contextStatus: S.Literals(["compacting", "recovering", "reviewing", "writing"]).pipe(optional, S.mutableKey),
  cloudResultId: S.String.pipe(optional, S.mutableKey),
});
export const StoredThread = internal({
  id: S.mutableKey(S.String),
  downloadId: S.mutableKey(S.String),
  promptId: S.mutableKey(S.String),
  leafId: S.String.pipe(S.NullOr, S.mutableKey),
  seq: S.mutableKey(S.Finite),
  title: S.String.pipe(optional, S.mutableKey),
  thinkingLevel: Thinking.pipe(optional, S.mutableKey),
  messages: StoredMessage.pipe(array, S.mutableKey),
  runs: StoredRun.pipe(array, S.mutableKey),
  artifacts: StoredArtifact.pipe(array, S.mutableKey),
  images: S.mutableKey(StoredImage.pipe(array, optional)),
  toolGrants: S.mutableKey(S.String.pipe(array, optional)),
});
export type StoredThread = typeof StoredThread.Type;
