import { $StandardsId } from "@vidbee/identity/packages";
import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as A from "effect/Array";
import * as Context from "effect/Context";
import * as ContentDigest from "effect/crypto/Digest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { InfrastructureFailure, InvalidInput } from "./Standards.errors.js";
import { Digest, RelativeFile } from "./Standards.model.js";

const $I = $StandardsId.create("Policy.service");
const SourceEdition = S.Struct({
  source: RelativeFile,
  revision: S.NonEmptyString,
  sourceDigest: Digest,
  local: RelativeFile,
  localDigest: Digest,
  adaptations: S.Array(S.NonEmptyString),
}).pipe(
  $I.annoteSchema("SourceEdition", {
    description: "Source/local digest and adaptation provenance for one VidBee edition.",
  })
);
const Sources = S.Struct({
  version: S.Literal(1),
  referenceRevision: S.NonEmptyString,
  sources: S.Array(SourceEdition),
}).pipe(
  $I.annoteSchema("Sources", { description: "Edition provenance without a dependency on the reference checkout." })
);
const CompilerOptions = S.Record(S.String, S.Json).pipe(
  $I.annoteSchema("CompilerOptions", {
    description: "JSON compiler-option projection compared structurally to the executable authority.",
  })
);
const CompilerInput = S.Struct({ compilerOptions: CompilerOptions }).pipe(
  $I.annoteSchema("CompilerInput", { description: "Consumed compiler-options document." })
);
const Projection = S.Struct({ sourceDigest: Digest, compilerOptions: CompilerOptions }).pipe(
  $I.annoteSchema("Projection", {
    description: "Immutable root compiler source digest and normalized option projection.",
  })
);
const JsoncMode = LiteralKit(["text", "string", "line", "block"]).pipe(
  $I.annoteSchema("JsoncMode", { description: "Lexical states preserve strings while removing JSONC comments." })
);
type JsoncMode = typeof JsoncMode.Type;
const stripComments = (text: string): string => {
  const characters = Str.split(text, "");
  let mode: JsoncMode = "text";
  let escaped = false;
  let output: ReadonlyArray<string> = [];
  for (let index = 0; index < characters.length; index += 1) {
    const char = characters[index];
    const next = characters[index + 1];
    if (char === undefined) continue;
    if (mode === "string") {
      output = A.append(output, char);
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') mode = "text";
    } else if (mode === "line") {
      if (char === "\n" || char === "\r") {
        mode = "text";
        output = A.append(output, char);
      }
    } else if (mode === "block") {
      if (char === "*" && next === "/") {
        mode = "text";
        index += 1;
      }
    } else if (char === '"') {
      mode = "string";
      output = A.append(output, char);
    } else if (char === "/" && next === "/") {
      mode = "line";
      index += 1;
    } else if (char === "/" && next === "*") {
      mode = "block";
      index += 1;
    } else output = A.append(output, char);
  }
  if (mode === "block") throw InvalidInput.make({ message: "Unterminated JSONC policy comment." });
  return A.join(output, "");
};
const optionsEqual = S.toEquivalence(CompilerOptions);
/** Validate byte-bound edition provenance and compiler policy against local files.
 *
 * @category services
 * @since 0.0.0
 */
export class Policy extends Context.Service<
  Policy,
  { readonly validate: (root: string) => Effect.Effect<void, InvalidInput | InfrastructureFailure> }
>()($I`Policy`) {}
/** Local policy validation; trusted-base authority is supplied by the later protected workflow.
 *
 * @category layers
 * @since 0.0.0
 */
export const PolicyLive = Layer.effect(
  Policy,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const digest = yield* ContentDigest.Digest;
    const invalid = () => InvalidInput.make({ message: "Invalid edition provenance or compiler projection." });
    return {
      validate: Effect.fn("Policy.validate")(
        function* (root: string) {
          const sourceText = yield* fs.readFileString(path.join(root, "standards/sources.json"));
          const sources = yield* S.decodeEffect(S.fromJsonString(Sources), { onExcessProperty: "error" })(
            sourceText
          ).pipe(Effect.mapError(invalid));
          for (const entry of sources.sources) {
            const bytes = yield* fs.readFile(path.join(root, entry.local));
            const actual = yield* digest.digestHex(ContentDigest.sha256, bytes);
            if (actual !== entry.localDigest)
              return yield* InvalidInput.make({ message: `Edition digest mismatch: ${entry.local}` });
          }
          const projectionText = yield* fs.readFileString(path.join(root, "standards/tsgo-policy.json"));
          const projection = yield* S.decodeEffect(S.fromJsonString(Projection))(projectionText).pipe(
            Effect.mapError(invalid)
          );
          const rootBytes = yield* fs.readFile(path.join(root, "tsconfig.base.json"));
          const rootDigest = yield* digest.digestHex(ContentDigest.sha256, rootBytes);
          if (rootDigest !== projection.sourceDigest)
            return yield* InvalidInput.make({
              message: "Root compiler policy bytes drifted from the immutable projection.",
            });
          const rootText = yield* fs.readFileString(path.join(root, "tsconfig.base.json"));
          const stripped = yield* Effect.try({ try: () => stripComments(rootText), catch: invalid });
          const input = yield* S.decodeEffect(S.fromJsonString(CompilerInput))(stripped).pipe(Effect.mapError(invalid));
          if (!optionsEqual(input.compilerOptions, projection.compilerOptions))
            return yield* InvalidInput.make({
              message: "Normalized compiler policy projection differs from the executable authority.",
            });
        },
        Effect.mapError((error) =>
          error._tag === "InvalidInput"
            ? error
            : InfrastructureFailure.make({ message: "Policy validation could not complete.", cause: error })
        )
      ),
    };
  })
);
