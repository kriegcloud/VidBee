import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";
export class ParseError extends S.TaggedError<ParseError, { readonly brand: unique symbol }>(
  "@vidbee/cli/Cli.errors/ParseError"
)("ParseError", {
  code: S.String,
  message: S.String,
  exitCode: S.Literal(2),
}) {
  override readonly name = "Error";
}
export class ListParseError extends S.TaggedError<ListParseError, { readonly brand: unique symbol }>(
  "@vidbee/cli/Cli.errors/ListParseError"
)("ListParseError", {
  code: S.String,
  message: S.String,
}) {
  override readonly name = "Error";
}

export class CliFailure extends S.TaggedError<CliFailure, { readonly brand: unique symbol }>(
  "@vidbee/cli/Cli.errors/CliFailure"
)("CliFailure", {
  message: S.String,
  category: S.optional(LiteralKit(["type", "range", "ordinary"])),
  cause: S.optional(S.Defect()),
}) {}
export class AutomationHttpError extends S.TaggedError<AutomationHttpError, { readonly brand: unique symbol }>(
  "@vidbee/cli/Cli.errors/AutomationHttpError"
)("AutomationHttpError", {
  code: S.String,
  status: S.Finite,
  message: S.String,
  body: S.String,
}) {
  override readonly name = "Error";
}
