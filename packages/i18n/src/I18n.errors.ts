import * as S from "effect/Schema";

export class I18nInitializationError extends S.TaggedError<
  I18nInitializationError,
  { readonly brand: unique symbol }
>()("I18nInitializationError", { cause: S.Unknown }) {}
