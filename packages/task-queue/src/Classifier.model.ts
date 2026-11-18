import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";
import { ClassifiedError, ErrorCategory, TaskOutput } from "./Task.model.js";
export const TransitionTrigger = LiteralKit([
  "dispatch",
  "pause",
  "cancel",
  "progressing",
  "finalize-success",
  "finalize-error",
  "retry-tick",
  "resume",
  "fail",
  "retry-manual",
  "requeue",
  "crash-recovery",
]);
export type TransitionTrigger = typeof TransitionTrigger.Type;
export const ClassifierRule = S.Struct({
  category: S.mutableKey(ErrorCategory),
  regex: S.NullOr(S.RegExp).pipe(S.mutableKey),
  exitCodeHint: S.NullOr(S.Finite).pipe(S.mutableKey),
  defaultMaxAttempts: S.mutableKey(S.Finite),
  defaultBackoffMs: S.NullOr(S.Finite).pipe(S.mutableKey),
  uiActionHints: S.Array(S.String).pipe(S.mutableKey),
  uiMessageKey: S.mutableKey(S.String),
});
export type ClassifierRule = typeof ClassifierRule.Type;
export const ClassifyInput = S.Struct({
  stderr: S.mutableKey(S.String),
  exitCode: S.Finite.pipe(S.NullOr, S.UndefinedOr, S.optional, S.mutableKey),
  retryAfterHeader: S.String.pipe(S.NullOr, S.UndefinedOr, S.optional, S.mutableKey),
});
export type ClassifyInput = typeof ClassifyInput.Type;
export const TransitionContext = S.Struct({
  trigger: S.mutableKey(TransitionTrigger),
  reason: S.String.pipe(S.NullOr, S.UndefinedOr, S.optional, S.mutableKey),
  output: S.UndefinedOr(TaskOutput).pipe(S.optional, S.mutableKey),
  error: S.UndefinedOr(ClassifiedError).pipe(S.optional, S.mutableKey),
  nextRetryAt: S.UndefinedOr(S.Finite).pipe(S.optional, S.mutableKey),
  now: S.mutableKey(S.Finite),
});
export type TransitionContext = typeof TransitionContext.Type;
export class ClassifierRuleMissing extends S.TaggedError<ClassifierRuleMissing, { readonly brand: unique symbol }>()(
  "ClassifierRuleMissing",
  { category: S.String }
) {
  override get message(): string {
    return `no rule for category ${this.category}`;
  }
}
