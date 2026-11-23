import type * as S from "effect/Schema";
/**
 * Rebuilt schema protocol intersected with retained caller-owned statics.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Preserved<T extends S.Top> = T["Rebuild"] & Omit<T, keyof T["Rebuild"] | keyof S.Top>;
/**
 * Documentation extras with required description and reserved identity fields removed.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Metadata<T> = Omit<S.Annotations.Documentation<T>, "identifier" | "schemaId" | "title" | "description"> & {
  readonly title?: string;
  readonly description: string;
};
/**
 * Resolved documentation record whose identifier presence follows the frozen contract.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Annotation<T> = S.Annotations.Documentation<T> & {
  readonly schemaId: symbol;
  readonly title: string;
  readonly description: string;
};
/**
 * Static template identity and annotation protocol bound to a truthful source child.
 *
 * @category protocols
 * @since 0.0.0
 */
export interface Composer {
  annote<T = unknown>(name: string, metadata: Metadata<T>): Annotation<T>;
  annoteClass<T>(name: string, metadata: Metadata<T>): Annotation<T>;
  annoteError<T>(name: string, metadata: Metadata<T>): Annotation<T>;
  annoteKey(
    name: string,
    metadata: S.Annotations.Key<unknown> & { readonly description: string }
  ): <T extends S.Top>(self: T) => T["Rebuild"];
  annoteSchema(name: string, metadata: Metadata<unknown>): <T extends S.Top>(self: T) => Preserved<T>;
  create(file: string): Composer;
  (parts: TemplateStringsArray, ...values: ReadonlyArray<never>): string;
}
/**
 * Registered workspace identity root that creates file-bound composers.
 *
 * @category protocols
 * @since 0.0.0
 */
export interface PackageIdentity {
  create(file: string): Composer;
  readonly name: string;
}
