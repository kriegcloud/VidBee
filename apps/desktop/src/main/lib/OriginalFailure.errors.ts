import * as S from "effect/Schema";

/** Main-only carrier. Its identity is tested; arbitrary lookalike objects are never unwrapped. */
export class OriginalFailure extends S.TaggedError<OriginalFailure, { readonly brand: unique symbol }>()(
  "OriginalFailure",
  {
    original: S.Unknown,
    operation: S.String,
    legacyMessage: S.String,
  }
) {}
export const originalFailure = ({
  original,
  operation,
  legacyMessage,
}: {
  readonly original: unknown;
  readonly operation: string;
  readonly legacyMessage: string;
}) => OriginalFailure.make({ original, operation, legacyMessage });
export const unwrapOriginal = (value: unknown): unknown => (S.is(OriginalFailure)(value) ? value.original : value);
