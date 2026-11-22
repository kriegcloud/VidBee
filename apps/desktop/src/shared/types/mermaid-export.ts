import { $DesktopId } from "@vidbee/identity/packages";
import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";

const $I = $DesktopId.create("shared/types/mermaid-export");

/** Main → hidden share renderer: export one saved Mermaid diagram.
 *
 * **Example** (Access the MERMAID_EXPORT_CHANNEL contract)
 *
 * ```ts
 * import { MERMAID_EXPORT_CHANNEL } from './mermaid-export.js'
 * void MERMAID_EXPORT_CHANNEL
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const MERMAID_EXPORT_CHANNEL = "share-capture:mermaid";

/**
 * Runtime model for MermaidExportPayload shared values.
 *
 *
 * **Example** (Construct MermaidExportPayload)
 *
 * ```ts
 * import { MermaidExportPayload } from './mermaid-export.js'
 * const value = MermaidExportPayload.make({source: "graph TD; A-->B", format: "svg", theme: "dark"})
 * value.format // => "svg"
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const MermaidExportPayload = S.Struct({
  source: S.mutableKey(S.String),
  format: S.mutableKey(LiteralKit(["svg", "png", "jpg"])),
  theme: S.mutableKey(LiteralKit(["light", "dark"])),
}).pipe(
  $I.annoteSchema("MermaidExportPayload", {
    description: "MermaidExportPayload shared boundary data.",
  })
);
/** Decoded MermaidExportPayload data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the MermaidExportPayload contract)
 *
 * ```ts
 * import { MermaidExportPayload } from './mermaid-export.js'
 * void MermaidExportPayload
 * ```
 *
 */
export type MermaidExportPayload = typeof MermaidExportPayload.Type;

/**
 * Runtime model for MermaidExportImage shared values.
 *
 *
 * **Example** (Construct MermaidExportImage)
 *
 * ```ts
 * import { MermaidExportImage } from './mermaid-export.js'
 * const value = MermaidExportImage.make({data: new Uint8Array([1, 2]), width: 2, height: 1})
 * value.data.length // => 2
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const MermaidExportImage = S.Struct({
  data: S.mutableKey(S.Uint8Array),
  width: S.mutableKey(S.Finite),
  height: S.mutableKey(S.Finite),
}).pipe($I.annoteSchema("MermaidExportImage", { description: "MermaidExportImage shared boundary data." }));
/** Decoded MermaidExportImage data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the MermaidExportImage contract)
 *
 * ```ts
 * import { MermaidExportImage } from './mermaid-export.js'
 * void MermaidExportImage
 * ```
 *
 */
export type MermaidExportImage = typeof MermaidExportImage.Type;
