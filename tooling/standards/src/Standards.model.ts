import { $StandardsId } from "@vidbee/identity/packages";
import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";

const $I = $StandardsId.create("Standards.model");
/**
 * Nonnegative validates the nonnegative boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before nonnegative enters an owning operation.
 *
 * **Example** (Reject invalid Nonnegative input)
 *
 * ```ts
 * import { Nonnegative } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(Nonnegative)(-1), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Nonnegative = S.Int.check(S.isGreaterThanOrEqualTo(0)).pipe(
  $I.annoteSchema("Nonnegative", { description: "Nonnegative UTF-16 offset or count." })
);
/**
 * Schema-derived decoded Nonnegative value.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Nonnegative = typeof Nonnegative.Type;
/**
 * Positive validates the positive boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before positive enters an owning operation.
 *
 * **Example** (Reject invalid Positive input)
 *
 * ```ts
 * import { Positive } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(Positive)(0), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Positive = S.Int.check(S.isGreaterThanOrEqualTo(1)).pipe(
  $I.annoteSchema("Positive", { description: "One-based source coordinate." })
);
/**
 * Schema-derived decoded Positive value.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Positive = typeof Positive.Type;
/**
 * Digest validates the digest boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before digest enters an owning operation.
 *
 * **Example** (Reject invalid Digest input)
 *
 * ```ts
 * import { Digest } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(Digest)("invalid"), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Digest = S.String.check(S.isPattern(/^[a-f0-9]{64}$/)).pipe(
  S.brand("Digest"),
  $I.annoteSchema("Digest", { description: "SHA-256 content digest in lowercase hexadecimal." })
);
/**
 * Schema-derived decoded Digest value.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Digest = typeof Digest.Type;
/**
 * RelativeFile validates the relative file boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before relativeFile enters an owning operation.
 *
 * **Example** (Reject invalid RelativeFile input)
 *
 * ```ts
 * import { RelativeFile } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(RelativeFile)("../escape"), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const RelativeFile = S.NonEmptyString.check(
  S.isPattern(/^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))(?!.*\\)(?!.*\/\/).+$/)
).pipe(
  S.brand("RelativeFile"),
  $I.annoteSchema("RelativeFile", { description: "Exact canonical repository-relative file path." })
);
/**
 * Schema-derived decoded RelativeFile value.
 *
 * @category type-level
 * @since 0.0.0
 */
export type RelativeFile = typeof RelativeFile.Type;
/**
 * Classification validates the classification boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before classification enters an owning operation.
 *
 * **Example** (Reject invalid Classification input)
 *
 * ```ts
 * import { Classification } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(Classification)("unclassified"), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Classification = LiteralKit([
  "active",
  "compatibility-owner",
  "pending-port",
  "pending-deletion",
  "generated",
  "vendor",
  "data",
  "plan-exclusion",
]).pipe($I.annoteSchema("Classification", { description: "Explicit file ownership; no directory-name exemptions." }));
/**
 * Schema-derived decoded Classification value.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Classification = typeof Classification.Type;
/**
 * FindingKind validates the finding kind boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before findingKind enters an owning operation.
 *
 * **Example** (Reject invalid FindingKind input)
 *
 * ```ts
 * import { FindingKind } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(FindingKind)("unknown"), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const FindingKind = LiteralKit(["violation", "candidate"]).pipe(
  $I.annoteSchema("FindingKind", { description: "Mechanical certainty or counted uncertainty." })
);
/**
 * Schema-derived decoded FindingKind value.
 *
 * @category type-level
 * @since 0.0.0
 */
export type FindingKind = typeof FindingKind.Type;
/**
 * SourcePosition validates the source position boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before sourcePosition enters an owning operation.
 *
 * **Example** (Reject invalid SourcePosition input)
 *
 * ```ts
 * import { SourcePosition } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(SourcePosition)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class SourcePosition extends S.Opaque<SourcePosition, { readonly brand: unique symbol }>()(
  S.Struct({ line: Positive, column: Positive, offset: Nonnegative }).pipe(
    $I.annoteSchema("SourcePosition", { description: "SourcePosition data exchanged by the standards infrastructure." })
  )
) {}
/**
 * SourceRange validates the source range boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before sourceRange enters an owning operation.
 *
 * **Example** (Reject invalid SourceRange input)
 *
 * ```ts
 * import { SourceRange } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(SourceRange)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class SourceRange extends S.Opaque<SourceRange, { readonly brand: unique symbol }>()(
  S.Struct({ start: SourcePosition, end: SourcePosition })
    .check(
      S.makeFilter(
        (range) => range.start.offset <= range.end.offset,
        $I.annote("OrderedSourceRange", {
          description: "Source range is ordered.",
          message: "Range end must not precede its start.",
        })
      )
    )
    .pipe(
      $I.annoteSchema("SourceRange", { description: "SourceRange data exchanged by the standards infrastructure." })
    )
) {}
/**
 * Finding validates the finding boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before finding enters an owning operation.
 *
 * **Example** (Reject invalid Finding input)
 *
 * ```ts
 * import { Finding } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(Finding)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class Finding extends S.Opaque<Finding, { readonly brand: unique symbol }>()(
  S.Struct({
    package: S.NonEmptyString,
    file: RelativeFile,
    rule: S.NonEmptyString,
    code: S.NonEmptyString,
    kind: FindingKind,
    range: SourceRange,
    subject: S.NonEmptyString,
    evidence: S.Array(S.String),
    message: S.NonEmptyString,
    fingerprint: Digest,
  }).pipe($I.annoteSchema("Finding", { description: "Finding data exchanged by the standards infrastructure." }))
) {}
/**
 * RuleMetadata validates the rule metadata boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before ruleMetadata enters an owning operation.
 *
 * **Example** (Reject invalid RuleMetadata input)
 *
 * ```ts
 * import { RuleMetadata } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(RuleMetadata)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class RuleMetadata extends S.Opaque<RuleMetadata, { readonly brand: unique symbol }>()(
  S.Struct({
    id: S.NonEmptyString,
    codes: S.Array(S.NonEmptyString),
    laws: S.Array(S.NonEmptyString),
    predicateVersion: Positive,
    applicability: S.Array(Classification),
    fixtures: S.Array(RelativeFile),
    reviews: S.Array(S.NonEmptyString),
    zeroOnly: S.Boolean,
  }).pipe(
    $I.annoteSchema("RuleMetadata", { description: "RuleMetadata data exchanged by the standards infrastructure." })
  )
) {}
/**
 * WorkspaceManifest validates the workspace manifest boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before workspaceManifest enters an owning operation.
 *
 * **Example** (Reject invalid WorkspaceManifest input)
 *
 * ```ts
 * import { WorkspaceManifest } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(WorkspaceManifest)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class WorkspaceManifest extends S.Opaque<WorkspaceManifest, { readonly brand: unique symbol }>()(
  S.Struct({
    name: S.NonEmptyString,
    root: RelativeFile,
    projects: S.Array(RelativeFile),
    dependencies: S.Array(S.NonEmptyString),
  }).pipe(
    $I.annoteSchema("WorkspaceManifest", {
      description: "WorkspaceManifest data exchanged by the standards infrastructure.",
    })
  )
) {}
/**
 * InventoryFile validates the inventory file boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before inventoryFile enters an owning operation.
 *
 * **Example** (Reject invalid InventoryFile input)
 *
 * ```ts
 * import { InventoryFile } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(InventoryFile)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class InventoryFile extends S.Opaque<InventoryFile, { readonly brand: unique symbol }>()(
  S.Struct({
    file: RelativeFile,
    package: S.NonEmptyString,
    classification: Classification,
    reason: S.NonEmptyString,
    executable: S.Boolean,
  }).pipe(
    $I.annoteSchema("InventoryFile", { description: "InventoryFile data exchanged by the standards infrastructure." })
  )
) {}
/**
 * CompilerCoverage validates the compiler coverage boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before compilerCoverage enters an owning operation.
 *
 * **Example** (Reject invalid CompilerCoverage input)
 *
 * ```ts
 * import { CompilerCoverage } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(CompilerCoverage)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class CompilerCoverage extends S.Opaque<CompilerCoverage, { readonly brand: unique symbol }>()(
  S.Struct({ file: RelativeFile, projects: S.Array(RelativeFile), completedStages: S.Array(S.NonEmptyString) }).pipe(
    $I.annoteSchema("CompilerCoverage", {
      description: "CompilerCoverage data exchanged by the standards infrastructure.",
    })
  )
) {}
/**
 * CompilerDiagnostic validates the compiler diagnostic boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before compilerDiagnostic enters an owning operation.
 *
 * **Example** (Reject invalid CompilerDiagnostic input)
 *
 * ```ts
 * import { CompilerDiagnostic } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(CompilerDiagnostic)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class CompilerDiagnostic extends S.Opaque<CompilerDiagnostic, { readonly brand: unique symbol }>()(
  S.Struct({ file: S.String, start: Nonnegative, length: Nonnegative, code: Nonnegative, message: S.String }).pipe(
    $I.annoteSchema("CompilerDiagnostic", {
      description: "CompilerDiagnostic data exchanged by the standards infrastructure.",
    })
  )
) {}
/**
 * NodeView validates the node view boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before nodeView enters an owning operation.
 *
 * **Example** (Reject invalid NodeView input)
 *
 * ```ts
 * import { NodeView } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(NodeView)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class NodeView extends S.Opaque<NodeView, { readonly brand: unique symbol }>()(
  S.Struct({
    file: S.String,
    kind: S.NonEmptyString,
    start: Nonnegative,
    end: Nonnegative,
    text: S.String,
    type: S.String,
    properties: S.Array(S.String),
    symbol: S.OptionFromNullOr(S.String),
  }).pipe($I.annoteSchema("NodeView", { description: "NodeView data exchanged by the standards infrastructure." }))
) {}
/**
 * CheckScope validates the check scope boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before checkScope enters an owning operation.
 *
 * **Example** (Reject invalid CheckScope input)
 *
 * ```ts
 * import { CheckScope } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(CheckScope)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class CheckScope extends S.Opaque<CheckScope, { readonly brand: unique symbol }>()(
  S.Struct({ packages: S.Array(S.NonEmptyString), files: S.Array(RelativeFile), full: S.Boolean }).pipe(
    $I.annoteSchema("CheckScope", { description: "CheckScope data exchanged by the standards infrastructure." })
  )
) {}
/**
 * CheckReport validates the check report boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before checkReport enters an owning operation.
 *
 * **Example** (Reject invalid CheckReport input)
 *
 * ```ts
 * import { CheckReport } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(CheckReport)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class CheckReport extends S.Opaque<CheckReport, { readonly brand: unique symbol }>()(
  S.Struct({
    version: S.Literal(1),
    scope: CheckScope,
    coverage: S.Array(CompilerCoverage),
    findings: S.Array(Finding),
    stages: S.Array(S.NonEmptyString),
    incomplete: S.Array(S.NonEmptyString),
  }).pipe(
    $I.annoteSchema("CheckReport", { description: "CheckReport data exchanged by the standards infrastructure." })
  )
) {}

/**
 * PurityVerdict validates the purity verdict boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before purityVerdict enters an owning operation.
 *
 * **Example** (Reject invalid PurityVerdict input)
 *
 * ```ts
 * import { PurityVerdict } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(PurityVerdict)("unknown"), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const PurityVerdict = LiteralKit(["pure", "impure", "unknown"]).pipe(
  $I.annoteSchema("PurityVerdict", { description: "Closure analysis verdict; unknown never executes." })
);
/**
 * Schema-derived decoded PurityVerdict value.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PurityVerdict = typeof PurityVerdict.Type;
/**
 * RunOutcome validates the run outcome boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before runOutcome enters an owning operation.
 *
 * **Example** (Reject invalid RunOutcome input)
 *
 * ```ts
 * import { RunOutcome } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(RunOutcome)("unknown"), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const RunOutcome = LiteralKit(["passed", "failed", "incomplete", "interrupted"]).pipe(
  $I.annoteSchema("RunOutcome", { description: "Execution outcome; a receipt is never acceptance authority." })
);
/**
 * Schema-derived decoded RunOutcome value.
 *
 * @category type-level
 * @since 0.0.0
 */
export type RunOutcome = typeof RunOutcome.Type;
/**
 * ObservableKind validates the observable kind boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before observableKind enters an owning operation.
 *
 * **Example** (Reject invalid ObservableKind input)
 *
 * ```ts
 * import { ObservableKind } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(ObservableKind)("unknown"), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ObservableKind = LiteralKit([
  "stored-bytes",
  "wire-bytes",
  "stdout",
  "stderr",
  "exit",
  "log",
  "rendered-value",
  "consumed-public-api",
]).pipe($I.annoteSchema("ObservableKind", { description: "Exact kind of an observable A1/A2 boundary." }));
/**
 * Schema-derived decoded ObservableKind value.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ObservableKind = typeof ObservableKind.Type;
/**
 * FileDebt validates the file debt boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before fileDebt enters an owning operation.
 *
 * **Example** (Reject invalid FileDebt input)
 *
 * ```ts
 * import { FileDebt } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(FileDebt)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class FileDebt extends S.Opaque<FileDebt, { readonly brand: unique symbol }>()(
  S.Struct({
    file: RelativeFile,
    counts: S.Record(S.NonEmptyString, Nonnegative),
    subjects: S.Array(S.NonEmptyString),
  }).pipe(
    $I.annoteSchema("FileDebt", {
      description:
        "FileDebt persisted infrastructure record; consumers validate references and attestations independently.",
    })
  )
) {}
/**
 * BaselinePackage validates the baseline package boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before baselinePackage enters an owning operation.
 *
 * **Example** (Reject invalid BaselinePackage input)
 *
 * ```ts
 * import { BaselinePackage } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(BaselinePackage)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class BaselinePackage extends S.Opaque<BaselinePackage, { readonly brand: unique symbol }>()(
  S.Struct({
    package: S.NonEmptyString,
    clean: S.Boolean,
    classification: Classification,
    files: S.Array(FileDebt),
    ruleTotals: S.Record(S.NonEmptyString, Nonnegative),
  }).pipe(
    $I.annoteSchema("BaselinePackage", {
      description:
        "BaselinePackage persisted infrastructure record; consumers validate references and attestations independently.",
    })
  )
) {}
/**
 * Baseline validates the baseline boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before baseline enters an owning operation.
 *
 * **Example** (Reject invalid Baseline input)
 *
 * ```ts
 * import { Baseline } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(Baseline)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class Baseline extends S.Opaque<Baseline, { readonly brand: unique symbol }>()(
  S.Struct({
    version: S.Literal(4),
    policyDigest: Digest,
    scopeDigest: Digest,
    classificationDigest: Digest,
    sourceRevision: S.NonEmptyString,
    packages: S.Array(BaselinePackage),
    migrationIds: S.Array(S.NonEmptyString),
  }).pipe(
    $I.annoteSchema("Baseline", {
      description:
        "Baseline persisted infrastructure record; consumers validate references and attestations independently.",
    })
  )
) {}
/**
 * ReviewObligation validates the review obligation boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before reviewObligation enters an owning operation.
 *
 * **Example** (Reject invalid ReviewObligation input)
 *
 * ```ts
 * import { ReviewObligation } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(ReviewObligation)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class ReviewObligation extends S.Opaque<ReviewObligation, { readonly brand: unique symbol }>()(
  S.Struct({
    subjectId: S.NonEmptyString,
    fingerprint: Digest,
    sourceDigest: Digest,
    dependencyDigest: Digest,
    evidenceRequirements: S.Array(S.NonEmptyString),
  }).pipe(
    $I.annoteSchema("ReviewObligation", {
      description:
        "ReviewObligation persisted infrastructure record; consumers validate references and attestations independently.",
    })
  )
) {}
/**
 * Attestation validates the attestation boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before attestation enters an owning operation.
 *
 * **Example** (Reject invalid Attestation input)
 *
 * ```ts
 * import { Attestation } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(Attestation)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class Attestation extends S.Opaque<Attestation, { readonly brand: unique symbol }>()(
  S.Struct({
    reviewer: S.NonEmptyString,
    author: S.NonEmptyString,
    reviewedDigest: Digest,
    evidence: S.Array(RelativeFile),
    approvalSource: S.NonEmptyString,
  }).pipe(
    $I.annoteSchema("Attestation", {
      description:
        "Attestation persisted infrastructure record; consumers validate references and attestations independently.",
    })
  )
) {}
/**
 * ReviewRecord validates the review record boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before reviewRecord enters an owning operation.
 *
 * **Example** (Reject invalid ReviewRecord input)
 *
 * ```ts
 * import { ReviewRecord } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(ReviewRecord)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class ReviewRecord extends S.Opaque<ReviewRecord, { readonly brand: unique symbol }>()(
  S.Struct({
    obligation: ReviewObligation,
    decision: S.NonEmptyString,
    rationale: S.NonEmptyString,
    proofs: S.Array(RelativeFile),
    attestation: Attestation,
  }).pipe(
    $I.annoteSchema("ReviewRecord", {
      description:
        "ReviewRecord persisted infrastructure record; consumers validate references and attestations independently.",
    })
  )
) {}
/**
 * CompatibilityClassification validates the compatibility classification boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before compatibilityClassification enters an owning operation.
 *
 * **Example** (Reject invalid CompatibilityClassification input)
 *
 * ```ts
 * import { CompatibilityClassification } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(CompatibilityClassification)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class CompatibilityClassification extends S.Opaque<
  CompatibilityClassification,
  { readonly brand: unique symbol }
>()(
  S.Struct({
    subjectId: S.NonEmptyString,
    frozenContract: S.NonEmptyString,
    intrinsicDistinction: S.NonEmptyString,
    proofs: S.Array(RelativeFile),
    approval: Attestation,
  }).pipe(
    $I.annoteSchema("CompatibilityClassification", {
      description:
        "CompatibilityClassification persisted infrastructure record; consumers validate references and attestations independently.",
    })
  )
) {}
/**
 * PendingDeletion validates the pending deletion boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before pendingDeletion enters an owning operation.
 *
 * **Example** (Reject invalid PendingDeletion input)
 *
 * ```ts
 * import { PendingDeletion } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(PendingDeletion)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class PendingDeletion extends S.Opaque<PendingDeletion, { readonly brand: unique symbol }>()(
  S.Struct({
    ...S.TaggedStruct("pending-deletion", {}).fields,
    package: S.NonEmptyString,
    subjectId: S.NonEmptyString,
    files: S.Array(RelativeFile),
    subjects: S.Array(S.NonEmptyString),
    incomingEdges: S.Array(S.NonEmptyString),
    counts: S.Record(S.NonEmptyString, Nonnegative),
    originRevision: S.NonEmptyString,
    decision: S.Literal("D1"),
    deletionPhase: S.Literal(10),
    ownerReview: S.NonEmptyString,
    attestation: Attestation,
  }).pipe(
    $I.annoteSchema("PendingDeletion", {
      description:
        "PendingDeletion persisted infrastructure record; consumers validate references and attestations independently.",
    })
  )
) {}
/**
 * ParityFrozen validates the parity frozen boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before parityFrozen enters an owning operation.
 *
 * **Example** (Reject invalid ParityFrozen input)
 *
 * ```ts
 * import { ParityFrozen } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(ParityFrozen)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class ParityFrozen extends S.Opaque<ParityFrozen, { readonly brand: unique symbol }>()(
  S.Struct({
    ...S.TaggedStruct("parity-frozen", {}).fields,
    subjectId: S.NonEmptyString,
    package: S.NonEmptyString,
    file: RelativeFile,
    declaration: S.NonEmptyString,
    member: S.NonEmptyString,
    rule: S.NonEmptyString,
    code: S.NonEmptyString,
    observable: ObservableKind,
    boundary: S.NonEmptyString,
    oldEvidence: S.NonEmptyString,
    oracle: S.NonEmptyString,
    conflictProof: S.NonEmptyString,
    gateProof: S.Array(RelativeFile),
    ownerReview: S.NonEmptyString,
    attestation: Attestation,
    maxCount: S.Literal(1),
  }).pipe(
    $I.annoteSchema("ParityFrozen", {
      description:
        "ParityFrozen persisted infrastructure record; consumers validate references and attestations independently.",
    })
  )
) {}
/**
 * ParityContractManifest validates the parity contract manifest boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before parityContractManifest enters an owning operation.
 *
 * **Example** (Reject invalid ParityContractManifest input)
 *
 * ```ts
 * import { ParityContractManifest } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(ParityContractManifest)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class ParityContractManifest extends S.Opaque<ParityContractManifest, { readonly brand: unique symbol }>()(
  S.Struct({
    version: S.Literal(1),
    sourceRevision: S.NonEmptyString,
    pendingDeletion: S.Array(PendingDeletion),
    parityFrozen: S.Array(ParityFrozen),
    ruleTotals: S.Record(S.NonEmptyString, Nonnegative),
    lineage: S.Array(S.NonEmptyString),
    digest: Digest,
  }).pipe(
    $I.annoteSchema("ParityContractManifest", {
      description:
        "ParityContractManifest persisted infrastructure record; consumers validate references and attestations independently.",
    })
  )
) {}
/**
 * DeletionProof validates the deletion proof boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before deletionProof enters an owning operation.
 *
 * **Example** (Reject invalid DeletionProof input)
 *
 * ```ts
 * import { DeletionProof } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(DeletionProof)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class DeletionProof extends S.Opaque<DeletionProof, { readonly brand: unique symbol }>()(
  S.Struct({
    subjectId: S.NonEmptyString,
    candidateTreeDigest: Digest,
    absentFiles: S.Array(RelativeFile),
    absentWorkspaces: S.Array(S.NonEmptyString),
    absentExports: S.Array(S.NonEmptyString),
    incomingModuleReferences: S.Literal(0),
    dependencyEdges: S.Literal(0),
    receipts: S.Array(RelativeFile),
    attestation: Attestation,
  }).pipe(
    $I.annoteSchema("DeletionProof", {
      description:
        "DeletionProof persisted infrastructure record; consumers validate references and attestations independently.",
    })
  )
) {}
/**
 * DocumentationObligation validates the documentation obligation boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before documentationObligation enters an owning operation.
 *
 * **Example** (Reject invalid DocumentationObligation input)
 *
 * ```ts
 * import { DocumentationObligation } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(DocumentationObligation)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class DocumentationObligation extends S.Opaque<DocumentationObligation, { readonly brand: unique symbol }>()(
  S.Struct({
    ownerId: S.NonEmptyString,
    fenceId: S.NonEmptyString,
    originKind: S.NonEmptyString,
    minimumExamples: Nonnegative,
    minimumRunnable: Nonnegative,
    minimumAssertions: Nonnegative,
    language: S.NonEmptyString,
    moduleKind: S.NonEmptyString,
    observationDigest: Digest,
    lineage: S.Array(S.NonEmptyString),
    approvals: S.Array(Attestation),
  }).pipe(
    $I.annoteSchema("DocumentationObligation", {
      description:
        "DocumentationObligation persisted infrastructure record; consumers validate references and attestations independently.",
    })
  )
) {}
/**
 * PurityRecord validates the purity record boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before purityRecord enters an owning operation.
 *
 * **Example** (Reject invalid PurityRecord input)
 *
 * ```ts
 * import { PurityRecord } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(PurityRecord)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class PurityRecord extends S.Opaque<PurityRecord, { readonly brand: unique symbol }>()(
  S.Struct({
    subjectId: S.NonEmptyString,
    closure: S.Array(RelativeFile),
    digest: Digest,
    verdict: PurityVerdict,
    evidence: S.Array(RelativeFile),
    approval: Attestation,
  }).pipe(
    $I.annoteSchema("PurityRecord", {
      description:
        "PurityRecord persisted infrastructure record; consumers validate references and attestations independently.",
    })
  )
) {}
/**
 * ExampleOrigin validates the example origin boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before exampleOrigin enters an owning operation.
 *
 * **Example** (Reject invalid ExampleOrigin input)
 *
 * ```ts
 * import { ExampleOrigin } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(ExampleOrigin)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class ExampleOrigin extends S.Opaque<ExampleOrigin, { readonly brand: unique symbol }>()(
  S.Struct({
    ownerId: S.NonEmptyString,
    title: S.NonEmptyString,
    fenceId: S.NonEmptyString,
    file: RelativeFile,
    originalRange: SourceRange,
    generatedRange: SourceRange,
    utf16Map: S.Array(Nonnegative),
    language: S.NonEmptyString,
    moduleKind: S.NonEmptyString,
  }).pipe(
    $I.annoteSchema("ExampleOrigin", {
      description:
        "ExampleOrigin persisted infrastructure record; consumers validate references and attestations independently.",
    })
  )
) {}
/**
 * PolicyMigration validates the policy migration boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before policyMigration enters an owning operation.
 *
 * **Example** (Reject invalid PolicyMigration input)
 *
 * ```ts
 * import { PolicyMigration } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(PolicyMigration)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class PolicyMigration extends S.Opaque<PolicyMigration, { readonly brand: unique symbol }>()(
  S.Struct({
    trustedBase: S.NonEmptyString,
    proposal: RelativeFile,
    reason: S.NonEmptyString,
    unchangedSourceDelta: S.Array(Finding),
    approvals: S.Array(Attestation),
    canonicalDigest: Digest,
  }).pipe(
    $I.annoteSchema("PolicyMigration", {
      description:
        "PolicyMigration persisted infrastructure record; consumers validate references and attestations independently.",
    })
  )
) {}
/**
 * RunReceipt validates the run receipt boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before runReceipt enters an owning operation.
 *
 * **Example** (Reject invalid RunReceipt input)
 *
 * ```ts
 * import { RunReceipt } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(RunReceipt)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class RunReceipt extends S.Opaque<RunReceipt, { readonly brand: unique symbol }>()(
  S.Struct({
    toolDigest: Digest,
    policyDigest: Digest,
    baseDigest: Digest,
    sourceDigest: Digest,
    scope: CheckScope,
    stages: S.Array(S.NonEmptyString),
    diagnostics: S.Array(CompilerDiagnostic),
    counts: S.Record(S.NonEmptyString, Nonnegative),
    timings: S.Record(S.NonEmptyString, S.Finite),
    outcome: RunOutcome,
    runId: S.NonEmptyString,
  }).pipe(
    $I.annoteSchema("RunReceipt", {
      description:
        "RunReceipt persisted infrastructure record; consumers validate references and attestations independently.",
    })
  )
) {}

/**
 * CompilerRun validates the compiler run boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before compilerRun enters an owning operation.
 *
 * **Example** (Reject invalid CompilerRun input)
 *
 * ```ts
 * import { CompilerRun } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(CompilerRun)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class CompilerRun extends S.Opaque<CompilerRun, { readonly brand: unique symbol }>()(
  S.Struct({
    project: S.NonEmptyString,
    exitCode: Nonnegative,
    stdout: S.String,
    stderr: S.String,
    files: S.Array(S.NonEmptyString),
  }).pipe(
    $I.annoteSchema("CompilerRun", {
      description: "Fresh installed tsrs execution and independently observed project file membership.",
    })
  )
) {}

/**
 * DeclarationView validates the declaration view boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before declarationView enters an owning operation.
 *
 * **Example** (Reject invalid DeclarationView input)
 *
 * ```ts
 * import { DeclarationView } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(DeclarationView)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class DeclarationView extends S.Opaque<DeclarationView, { readonly brand: unique symbol }>()(
  S.Struct({ file: S.NonEmptyString, start: Nonnegative, end: Nonnegative, text: S.String }).pipe(
    $I.annoteSchema("DeclarationView", {
      description: "Resolved declaration provenance detached from the compiler snapshot.",
    })
  )
) {}
/**
 * SemanticQuery validates the semantic query boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before semanticQuery enters an owning operation.
 *
 * **Example** (Reject invalid SemanticQuery input)
 *
 * ```ts
 * import { SemanticQuery } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(SemanticQuery)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class SemanticQuery extends S.Opaque<SemanticQuery, { readonly brand: unique symbol }>()(
  S.Struct({ file: S.NonEmptyString, offset: Nonnegative }).pipe(
    $I.annoteSchema("SemanticQuery", { description: "Exact UTF-16 node lookup within an owned compiler project." })
  )
) {}
/**
 * SemanticView validates the semantic view boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before semanticView enters an owning operation.
 *
 * **Example** (Reject invalid SemanticView input)
 *
 * ```ts
 * import { SemanticView } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(SemanticView)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class SemanticView extends S.Opaque<SemanticView, { readonly brand: unique symbol }>()(
  S.Struct({
    name: S.String,
    resolvedName: S.OptionFromNullOr(S.String),
    type: S.OptionFromNullOr(S.String),
    properties: S.Array(S.String),
    declarations: S.Array(DeclarationView),
    callDeclaration: S.OptionFromNullOr(DeclarationView),
    parameters: S.Array(S.String),
  }).pipe(
    $I.annoteSchema("SemanticView", {
      description: "Alias resolution, type classification and resolved-call provenance.",
    })
  )
) {}

/** Fresh compiler runs with exact file-to-project coverage.
 * @category schemas
 * @since 0.0.0
 */
export class CoverageRun extends S.Opaque<CoverageRun, { readonly brand: unique symbol }>()(
  S.Struct({ runs: S.Array(CompilerRun), coverage: S.Array(CompilerCoverage) }).pipe(
    $I.annoteSchema("CoverageRun", {
      description: "Completed compiler executions and exact active executable membership.",
    })
  )
) {}
