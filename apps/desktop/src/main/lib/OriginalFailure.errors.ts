import { $DesktopId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";

const $TransportId = $DesktopId.create("main/lib/OriginalFailure.errors");

/**
 * Carries the original in-process thrown value together with its operation and legacy message; unwrap it only at the legacy boundary so rejection identity is preserved.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { OriginalFailure } from "./OriginalFailure.errors.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(OriginalFailure)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class OriginalFailure extends S.TaggedError<OriginalFailure, { readonly brand: unique symbol }>()(
  "OriginalFailure",
  {
    original: S.Unknown,
    operation: S.String,
    legacyMessage: S.String,
  },
  $TransportId.annoteError("OriginalFailure", {
    description: "Original Failure preserves the declared desktop failure fields.",
  })
) {}
/**
 * Captures a native thrown value without cloning or stringifying it, attaching operation and legacy-message metadata for strict Effect error handling.
 *
 * **Example** (Use originalFailure with its owner)
 *
 * ```ts
 * import { originalFailure } from "./OriginalFailure.errors.js"
 * export const original = { nativeCode: "closed" };
 * export const carried = originalFailure({ original, operation: "read", legacyMessage: "closed" });
 * carried.original === original // => true
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const originalFailure = ({
  original,
  operation,
  legacyMessage,
}: {
  readonly original: unknown;
  readonly operation: string;
  readonly legacyMessage: string;
}) => OriginalFailure.make({ original, operation, legacyMessage });
/**
 * Restores the original thrown value from an OriginalFailure carrier; unrelated values pass through unchanged, preserving legacy rejection identity.
 *
 * **Example** (Use unwrapOriginal with its owner)
 *
 * ```ts
 * import { unwrapOriginal } from "./OriginalFailure.errors.js"
 * import { originalFailure } from "./OriginalFailure.errors.js";
 * export const original = { nativeCode: "closed" };
 * export const restored = unwrapOriginal(originalFailure({ original, operation: "read", legacyMessage: "closed" }));
 * restored === original // => true
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const unwrapOriginal = (value: unknown): unknown => (S.is(OriginalFailure)(value) ? value.original : value);
