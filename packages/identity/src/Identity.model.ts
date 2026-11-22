import * as A from "effect/Array";
import * as S from "effect/Schema";
import { registeredPackageNames } from "./internal/roots.generated.js";
import { $IdentityId } from "./packages.js";

const $I = $IdentityId.create("Identity.model");
/**
 * PackageName validates the package name boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before packageName enters an owning operation.
 *
 * **Example** (Reject invalid PackageName input)
 *
 * ```ts
 * import { PackageName } from "@vidbee/identity"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(PackageName)(""), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const PackageName = S.NonEmptyString.check(
  S.makeFilter(
    (value) => A.contains(registeredPackageNames, value),
    $I.annote("RegisteredPackageName", {
      description: "Name is registered from an actual workspace manifest.",
      message: "Expected a registered workspace manifest name.",
    })
  )
).pipe(S.brand("PackageName"), $I.annoteSchema("PackageName", { description: "Exact workspace manifest name." }));
/**
 * Schema-derived decoded PackageName value.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PackageName = typeof PackageName.Type;
/**
 * FileChild validates the file child boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before fileChild enters an owning operation.
 *
 * **Example** (Reject invalid FileChild input)
 *
 * ```ts
 * import { FileChild } from "@vidbee/identity"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(FileChild)("../escape"), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const FileChild = S.String.check(S.isPattern(/^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[^\\]+$/)).pipe(
  $I.annoteSchema("FileChild", { description: "Canonical extensionless package-relative file." }),
  S.brand("FileChild")
);
/**
 * Schema-derived decoded FileChild value.
 *
 * @category type-level
 * @since 0.0.0
 */
export type FileChild = typeof FileChild.Type;
/**
 * IdentityName validates the identity name boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before identityName enters an owning operation.
 *
 * **Example** (Reject invalid IdentityName input)
 *
 * ```ts
 * import { IdentityName } from "@vidbee/identity"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(IdentityName)("a/b"), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const IdentityName = S.NonEmptyString.check(S.isPattern(/^[^/\\${}]+$/)).pipe(
  $I.annoteSchema("IdentityName", { description: "Static declaration or key name." }),
  S.brand("IdentityName")
);
/**
 * Schema-derived decoded IdentityName value.
 *
 * @category type-level
 * @since 0.0.0
 */
export type IdentityName = typeof IdentityName.Type;

/**
 * IdentityLocation validates the identity location boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before identityLocation enters an owning operation.
 *
 * **Example** (Reject invalid IdentityLocation input)
 *
 * ```ts
 * import { IdentityLocation } from "@vidbee/identity"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(IdentityLocation)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class IdentityLocation extends S.Opaque<IdentityLocation, { readonly brand: unique symbol }>()(
  S.Struct({
    package: PackageName,
    file: S.NonEmptyString,
    child: FileChild,
    declaration: IdentityName,
    kind: S.NonEmptyString,
  }).pipe($I.annoteSchema("IdentityLocation", { description: "Truthful source location of a stable identity." }))
) {}

/**
 * IdentityCompatibilityEntry validates the identity compatibility entry boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before identityCompatibilityEntry enters an owning operation.
 *
 * **Example** (Reject invalid IdentityCompatibilityEntry input)
 *
 * ```ts
 * import { IdentityCompatibilityEntry } from "@vidbee/identity"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(IdentityCompatibilityEntry)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class IdentityCompatibilityEntry extends S.Opaque<
  IdentityCompatibilityEntry,
  { readonly brand: unique symbol }
>()(
  S.Struct({
    stableId: S.NonEmptyString,
    package: PackageName,
    file: S.NonEmptyString,
    child: FileChild,
    declaration: IdentityName,
    kind: S.NonEmptyString,
    logical: S.NonEmptyString,
    value: S.NonEmptyString,
    identifierMode: S.NonEmptyString,
    identifier: S.OptionFromNullOr(S.String),
    sourceExpression: S.NonEmptyString,
    sourceDigest: S.String.check(S.isPattern(/^[a-f0-9]{64}$/)),
    proofs: S.Array(S.NonEmptyString),
    runtimeVerified: S.Boolean,
  }).pipe(
    $I.annoteSchema("IdentityCompatibilityEntry", {
      description: "Frozen runtime identity and effective annotation evidence for an exact subject.",
    })
  )
) {}
/**
 * IdentityMove validates the identity move boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before identityMove enters an owning operation.
 *
 * **Example** (Reject invalid IdentityMove input)
 *
 * ```ts
 * import { IdentityMove } from "@vidbee/identity"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(IdentityMove)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class IdentityMove extends S.Opaque<IdentityMove, { readonly brand: unique symbol }>()(
  S.Struct({
    stableId: S.NonEmptyString,
    oldLocation: IdentityLocation,
    newLocation: IdentityLocation,
    frozenValue: S.NonEmptyString,
    disappearanceProof: S.NonEmptyString,
    appearanceProof: S.NonEmptyString,
    approval: S.NonEmptyString,
  }).pipe(
    $I.annoteSchema("IdentityMove", { description: "Approved relocation preserving the historical runtime identity." })
  )
) {}
/**
 * IdentityCompatibilityManifest validates the identity compatibility manifest boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before identityCompatibilityManifest enters an owning operation.
 *
 * **Example** (Reject invalid IdentityCompatibilityManifest input)
 *
 * ```ts
 * import { IdentityCompatibilityManifest } from "@vidbee/identity"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(IdentityCompatibilityManifest)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class IdentityCompatibilityManifest extends S.Opaque<
  IdentityCompatibilityManifest,
  { readonly brand: unique symbol }
>()(
  S.Struct({
    version: S.Literal(1),
    frozenRevision: S.NonEmptyString,
    proofState: S.NonEmptyString,
    entries: S.Array(IdentityCompatibilityEntry),
    moves: S.Array(IdentityMove),
    digest: S.String.check(S.isPattern(/^[a-f0-9]{64}$/)),
  }).pipe(
    $I.annoteSchema("IdentityCompatibilityManifest", {
      description: "Protected identity freeze and append-only move lineage.",
    })
  )
) {}
