import { $DesktopId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";

const $TransportId = $DesktopId.create("main/lib/OriginalFailure.errors");

/**
 * Main-only carrier. Its identity is tested; arbitrary lookalike objects are never unwrapped.
 *
 * **Example** (Use OriginalFailure at its owning boundary)
 *
 * ```ts
 * import { OriginalFailure } from "./OriginalFailure.errors.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(OriginalFailure);
 * const validated = decode({});
 * void validated;
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
 * Constructs original Failure with explicit lifetime and failure ownership.
 *
 * **Example** (Use originalFailure at its owning boundary)
 *
 * ```ts
 * import { originalFailure } from "./OriginalFailure.errors.js"
 * const original = { nativeCode: "closed" };
 * const carried = originalFailure({ original, operation: "read", legacyMessage: "closed" });
 * void carried;
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
 * Constructs unwrap Original with explicit lifetime and failure ownership.
 *
 * **Example** (Use unwrapOriginal at its owning boundary)
 *
 * ```ts
 * import { unwrapOriginal } from "./OriginalFailure.errors.js"
 * import { originalFailure } from "./OriginalFailure.errors.js";
 * const original = { nativeCode: "closed" };
 * const restored = unwrapOriginal(originalFailure({ original, operation: "read", legacyMessage: "closed" }));
 * void restored;
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const unwrapOriginal = (value: unknown): unknown => (S.is(OriginalFailure)(value) ? value.original : value);
