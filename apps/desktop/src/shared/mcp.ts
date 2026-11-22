import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'
import * as S from 'effect/Schema'

const $I = $DesktopId.create('shared/mcp')

/** Connection details displayed only inside Desktop and stored in a private local file. */
/**
 * Runtime model for DesktopMcpStatus shared values.
 *
 *
 * **Example** (Construct DesktopMcpStatus)
 *
 * ```ts
 * import { DesktopMcpStatus } from './mcp.js'
 * const value = DesktopMcpStatus.make({enabled: true, running: false, url: null, configPath: "/fixture/mcp.json", toolCount: 0, httpConfig: "{}"})
 * value.running // => false
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const DesktopMcpStatus = S.Struct({
  enabled: S.mutableKey(S.Boolean),
  running: S.mutableKey(S.Boolean),
  url: S.String.pipe(S.NullOr, S.mutableKey),
  configPath: S.mutableKey(S.String),
  toolCount: S.mutableKey(S.Finite),
  httpConfig: S.mutableKey(S.String)
}).pipe(
  $I.annoteSchema('DesktopMcpStatus', { description: 'DesktopMcpStatus shared boundary data.' })
)
/** Decoded DesktopMcpStatus data.
 * @category type-level
 * @since 0.0.0
 * @example DesktopMcpStatus
 */
export type DesktopMcpStatus = typeof DesktopMcpStatus.Type

/** A registered capability and its human-readable label for the Settings inventory. */
/**
 * Runtime model for DesktopMcpCapability shared values.
 *
 *
 * **Example** (Construct DesktopMcpCapability)
 *
 * ```ts
 * import { DesktopMcpCapability } from './mcp.js'
 * const value = DesktopMcpCapability.make({name: "test", labelKey: "test.label", description: "Test tool"})
 * value.name // => "test"
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const DesktopMcpCapability = S.Struct({
  name: S.mutableKey(S.String),
  labelKey: S.mutableKey(S.String),
  description: S.mutableKey(S.String)
}).pipe(
  $I.annoteSchema('DesktopMcpCapability', {
    description: 'DesktopMcpCapability shared boundary data.'
  })
)
/** Decoded DesktopMcpCapability data.
 * @category type-level
 * @since 0.0.0
 * @example DesktopMcpCapability
 */
export type DesktopMcpCapability = typeof DesktopMcpCapability.Type

/** Group real registered tools, resources and workflows without maintaining a second tool list. */
/**
 * Runtime model for DesktopMcpCapabilityGroup shared values.
 *
 *
 * **Example** (Construct DesktopMcpCapabilityGroup)
 *
 * ```ts
 * import { DesktopMcpCapabilityGroup } from './mcp.js'
 * const value = DesktopMcpCapabilityGroup.make({id: "tools", kind: "tools", items: []})
 * value.items.length // => 0
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const DesktopMcpCapabilityGroup = S.Struct({
  id: S.mutableKey(S.String),
  kind: S.mutableKey(LiteralKit(['tools', 'resources', 'prompts'])),
  items: S.Array(DesktopMcpCapability).pipe(S.mutable, S.mutableKey)
}).pipe(
  $I.annoteSchema('DesktopMcpCapabilityGroup', {
    description: 'DesktopMcpCapabilityGroup shared boundary data.'
  })
)
/** Decoded DesktopMcpCapabilityGroup data.
 * @category type-level
 * @since 0.0.0
 * @example DesktopMcpCapabilityGroup
 */
export type DesktopMcpCapabilityGroup = typeof DesktopMcpCapabilityGroup.Type
