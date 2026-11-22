import * as A from "effect/Array";
import { dual } from "effect/Function";
import * as P from "effect/Predicate";
import * as R from "effect/Record";
import * as S from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";
import * as Str from "effect/String";
import { compatibility } from "./compat.generated.js";
import { registeredPackageNames } from "./roots.generated.js";
import type { Annotation, Composer, Metadata, PackageIdentity, Preserved } from "../Identity.js";

const validChild = (value: string): boolean =>
  P.isString(value) &&
  value.length > 0 &&
  !Str.includes("\\")(value) &&
  A.every(
    Str.split(value, "/"),
    (part) => part.length > 0 && part !== "." && part !== ".." && !Str.includes("${")(part) && !/[\r\n\0]/.test(part)
  );
const requireChild = (value: string): string => {
  if (!validChild(value)) throw IdentityInvariantError.make({ message: "Invalid identity segment." });
  return value;
};

/** Compute the pinned default key, including index and basename collapse.
 * @category utilities
 * @since 0.0.0
 */
export const locationKey: {
  (packageName: string, file: string, name: string): string;
  (file: string, name: string): (packageName: string) => string;
} = dual(3, (packageName: string, file: string, name: string): string => {
  const parts = Str.split(requireChild(file), "/");
  const basename = A.last(parts);
  const last = basename._tag === "Some" ? basename.value : "";
  const dirs = A.dropRight(parts, 1);
  const stem = Str.toLowerCase(last) === "index" ? "" : last;
  return A.join(
    A.filter(
      [packageName, ...dirs, stem, Str.toLowerCase(stem) === Str.toLowerCase(name) ? "" : requireChild(name)],
      (part) => part !== ""
    ),
    "/"
  );
});

/** Apply the pinned key builder to a real package-relative source filename.
 * @category utilities
 * @since 0.0.0
 */
export const defaultKey: {
  (packageName: string, source: string, declaration: string): string;
  (source: string, declaration: string): (packageName: string) => string;
} = dual(3, (packageName: string, source: string, declaration: string): string =>
  locationKey(packageName, Str.replace(/\.[^./]+$/, "")(Str.replace(/^src\//, "")(source)), declaration)
);

const protocol: ReadonlyArray<PropertyKey> = [
  ...Reflect.ownKeys(S.String),
  "~effect/Schema/Schema",
  "length",
  "name",
  "prototype",
  "ast",
  "annotate",
  "annotateKey",
  "check",
  "make",
  "makeEffect",
  "makeOption",
  "pipe",
  "rebuild",
];

/** Preserve additional own descriptors without reading accessors. */
function preserveImpl<T extends S.Top>(source: T, rebuilt: T["Rebuild"]): Preserved<T>;
function preserveImpl(source: S.Top, rebuilt: S.Top): S.Top {
  for (const key of Reflect.ownKeys(source)) {
    if (A.contains(protocol, key)) continue;
    const descriptor = Reflect.getOwnPropertyDescriptor(source, key);
    const existing = Reflect.getOwnPropertyDescriptor(rebuilt, key);
    if (descriptor !== undefined && existing === undefined && !Reflect.defineProperty(rebuilt, key, descriptor)) {
      throw IdentityInvariantError.make({ message: "Cannot preserve schema static descriptor." });
    }
    if (
      descriptor !== undefined &&
      existing !== undefined &&
      (descriptor.value !== existing.value ||
        descriptor.get !== existing.get ||
        descriptor.set !== existing.set ||
        descriptor.enumerable !== existing.enumerable ||
        descriptor.configurable !== existing.configurable ||
        descriptor.writable !== existing.writable)
    ) {
      throw IdentityInvariantError.make({ message: "Custom schema static conflicts with rebuilt member." });
    }
  }
  return rebuilt;
}

/** Preserve custom statics with equivalent data-first and data-last forms.
 * @category utilities
 * @since 0.0.0
 */
export const preserve: {
  <T extends S.Top>(source: T, rebuilt: T["Rebuild"]): Preserved<T>;
  <T extends S.Top>(rebuilt: T["Rebuild"]): (source: T) => Preserved<T>;
  <B extends S.Top>(
    rebuilt: B
  ): <T extends S.Top>(source: T & (B extends T["Rebuild"] ? unknown : never)) => Preserved<T>;
} = dual(2, preserveImpl);

/** Create a composer bound to an actual package-relative file child.
 * @category utilities
 * @since 0.0.0
 */
export const composer: {
  (packageName: string, file: string): Composer;
  (file: string): (packageName: string) => Composer;
} = dual(2, (packageName: string, file: string): Composer => {
  requireChild(file);
  const frozen = (name: string) =>
    A.findFirst(compatibility, (entry) => entry.logical === locationKey(packageName, file, name));
  const key = (name: string) => {
    const entry = frozen(name);
    return entry._tag === "Some" ? entry.value.value : locationKey(packageName, file, name);
  };
  const annote = <T>(name: string, metadata: Metadata<T>): Annotation<T> => {
    if (!P.isObject(metadata)) throw IdentityInvariantError.make({ message: "Malformed identity metadata." });
    for (const reserved of ["identifier", "schemaId"]) {
      if (R.has(metadata, reserved)) throw IdentityInvariantError.make({ message: "Reserved identity metadata." });
    }
    if (!P.isString(metadata.description) || metadata.description.length === 0)
      throw IdentityInvariantError.make({ message: "Identity descriptions must be nonempty." });
    const identity = key(name);
    const previous = frozen(name);
    const identifier =
      previous._tag === "Some" && previous.value.identifierMode === "preserve-effective"
        ? {}
        : { identifier: identity };
    return {
      ...metadata,
      ...identifier,
      schemaId: Symbol.for(identity),
      title: metadata.title ?? name,
      description: metadata.description,
    };
  };
  function tag(parts: TemplateStringsArray, ...values: ReadonlyArray<never>): string {
    if (!A.isArray(parts) || !A.isArray(parts.raw))
      throw IdentityInvariantError.make({ message: "Malformed identity template array." });
    const value = parts[0];
    if (
      values.length !== 0 ||
      parts.length !== 1 ||
      parts.raw.length !== 1 ||
      value === undefined ||
      parts.raw[0] !== value
    ) {
      throw IdentityInvariantError.make({ message: "Identity tags require one uninterpolated segment." });
    }
    if (!P.isString(value) || Str.includes("/")(value))
      throw IdentityInvariantError.make({ message: "Identity templates accept one static name." });
    return key(requireChild(value));
  }
  tag.create = (child: string) => composer(packageName, `${file}/${requireChild(child)}`);
  tag.annote = annote;
  tag.annoteClass = annote;
  tag.annoteError = annote;
  tag.annoteSchema =
    (name: string, metadata: Metadata<unknown>) =>
    <T extends S.Top>(self: T): Preserved<T> => {
      const annotations = annote(name, metadata);
      const identifier = SchemaAST.resolveIdentifier(self.ast);
      const retained = identifier === undefined ? annotations : { ...annotations, identifier };
      return preserve(self, self.annotate(retained));
    };
  tag.annoteKey =
    (name: string, metadata: S.Annotations.Key<unknown> & { readonly description: string }) =>
    <T extends S.Top>(self: T): T["Rebuild"] =>
      self.annotateKey(annote(name, { ...metadata, title: metadata.title ?? name }));
  return tag;
});

/** Refuse malformed identity inputs and descriptor conflicts synchronously.
 *
 * **Example** (Retain a deliberate message)
 *
 * ```ts
 * import { IdentityInvariantError } from "@vidbee/identity"
 * import { strictEqual } from "node:assert"
 * const failure = IdentityInvariantError.make({message: "Malformed input."})
 * strictEqual(failure.message, "Malformed input.")
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export class IdentityInvariantError extends S.TaggedError<IdentityInvariantError, { readonly brand: unique symbol }>()(
  "IdentityInvariantError",
  { message: S.String },
  composer("@vidbee/identity", "internal/composer").annoteError("IdentityInvariantError", {
    description: "Identity input or static descriptor invariant failed.",
  })
) {}

/** Construct a root from a registered workspace name.
 * @category utilities
 * @since 0.0.0
 */
export function packageRoot(name: string): PackageIdentity {
  if (!A.contains(registeredPackageNames, name))
    throw IdentityInvariantError.make({ message: "Unknown workspace identity root." });
  return { name, create: (file) => composer(name, file) };
}
