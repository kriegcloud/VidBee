import * as A from "effect/Array";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import { dual } from "effect/Function";
import * as O from "effect/Option";
import * as R from "effect/Record";
import type * as References from "effect/References";

/**
 * Preserve ordered arguments and append readable Cause text when present.
 * Complete flat reasons and untruncated annotations are exposed by causeReasons.
 *
 * **Example** (Keep object identity)
 * ```ts
 * import { logArguments } from "@vidbee/logger/arguments"
 * import * as Cause from "effect/Cause"
 * const details = { count: 2 }
 * console.assert(logArguments(["done", details], Cause.empty)[1] === details)
 * ```
 * @category formatting
 * @since 0.0.0
 */
export const logArguments: {
  (message: unknown, cause: Cause.Cause<unknown>): ReadonlyArray<unknown>;
  (cause: Cause.Cause<unknown>): (message: unknown) => ReadonlyArray<unknown>;
} = dual(2, (message: unknown, cause: Cause.Cause<unknown>): ReadonlyArray<unknown> => {
  const messages = A.isArray(message) ? message : [message];
  const rendered = Cause.pretty(cause);
  return rendered === "" ? messages : [...messages, { cause: rendered }];
});

const frames = (first: References.StackFrame | undefined) =>
  A.unfold(first, (frame) =>
    frame === undefined ? O.none() : O.some([{ name: frame.name, stack: frame.stack() }, frame.parent])
  );

/** Capture every flat Cause reason and its untruncated annotated stack chains.
 * No parallel/sequential topology is inferred from Effect 4's flat collection.
 * **Example** (Keep interruptions beside failures)
 * ```ts
 * import { causeReasons } from "@vidbee/logger/arguments"
 * import * as Cause from "effect/Cause"
 * const reasons = causeReasons(Cause.combine(Cause.fail("failed"), Cause.interrupt(42)))
 * console.assert(reasons.length === 2)
 * ```
 * @category formatting
 * @since 0.0.0
 */
export const causeReasons = (cause: Cause.Cause<unknown>): ReadonlyArray<unknown> =>
  A.map(cause.reasons, (reason) => {
    const context = Cause.reasonAnnotations(reason);
    return {
      kind: reason._tag,
      ...(Cause.isFailReason(reason)
        ? { error: reason.error }
        : Cause.isDieReason(reason)
          ? { defect: reason.defect }
          : { fiberId: reason.fiberId }),
      annotations: R.fromEntries(
        A.filter(
          [...reason.annotations],
          ([key]) => key !== Cause.StackTrace.key && key !== Cause.InterruptorStackTrace.key
        )
      ),
      stack: frames(Context.getOrUndefined(context, Cause.StackTrace)),
      interruptorStack: frames(Context.getOrUndefined(context, Cause.InterruptorStackTrace)),
    };
  });
