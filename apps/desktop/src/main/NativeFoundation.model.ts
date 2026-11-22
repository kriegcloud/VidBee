import { $DesktopId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";

const $I = $DesktopId.create("main/NativeFoundation.model");
/** In-process Electron dialog options retain native images, signals and original object identity. This opaque value has no wire codec and introduces no semantic decoder into compatibility calls.
 * **Example** (Preserve a native options reference)
 * ```ts
 * import { NativeMessageBoxOptions } from './NativeFoundation.model.js'
 * const original={message:'Continue?'}
 * Object.is(NativeMessageBoxOptions.make(original),original) // => true
 * ```
 * @category models
 * @since 0.0.0
 */
export class NativeMessageBoxOptions extends S.Opaque<NativeMessageBoxOptions, { readonly brand: unique symbol }>()(
  S.Unknown.pipe($I.annoteSchema("NativeMessageBoxOptions", { description: "Opaque main-only Electron dialog input." }))
) {}
/** In-process PNG input retains the original ArrayBuffer identity, including the native failure policy for wrong-shaped legacy values. Only Uint8Array enters the new RPC wire.
 * **Example** (Keep the compatibility clipboard reference)
 * ```ts
 * import { NativePngInput } from './NativeFoundation.model.js'
 * const original=new ArrayBuffer(4)
 * Object.is(NativePngInput.make(original),original) // => true
 * ```
 * @category models
 * @since 0.0.0
 */
export class NativePngInput extends S.Opaque<NativePngInput, { readonly brand: unique symbol }>()(
  S.Unknown.pipe($I.annoteSchema("NativePngInput", { description: "Opaque main-only clipboard input." }))
) {}

/** Optional native buffer accounting, supplied only by the new RPC operation owner. The host reserves before allocating retained storage; the operation releases after actual completion.
 * @category type-level
 * @since 0.0.0
 */
export interface NativeRetention {
  readonly reserve: (bytes: number) => boolean;
}
