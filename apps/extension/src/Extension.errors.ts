import * as S from "effect/Schema";
export class ExtensionHostFailure extends S.TaggedError<ExtensionHostFailure, { readonly brand: unique symbol }>()(
  "ExtensionHostFailure",
  {
    operation: S.String,
    cause: S.Defect(),
    message: S.String,
  }
) {}
export class ExtensionRequestFailure extends S.TaggedError<
  ExtensionRequestFailure,
  { readonly brand: unique symbol }
>()("ExtensionRequestFailure", {
  message: S.String,
  status: S.optional(S.Finite),
}) {}
export class ExtensionBoundaryFailure extends S.TaggedError<
  ExtensionBoundaryFailure,
  { readonly brand: unique symbol }
>()("ExtensionBoundaryFailure", {
  boundary: S.String,
  issue: S.String,
}) {}
export type ExtensionError = ExtensionHostFailure | ExtensionRequestFailure | ExtensionBoundaryFailure;
