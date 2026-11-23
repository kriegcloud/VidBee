let disposal: (() => Promise<void>) | undefined

/** Register optional telemetry with the existing quit-preparation owner.
 * **Example** (Register a no-op owner)
 * ```ts
 * import { registerTelemetryDisposal, takeTelemetryDisposal } from './telemetry-disposal.js'
 * let disposed = false
 * registerTelemetryDisposal(() => { disposed = true; return Promise.resolve() })
 * await takeTelemetryDisposal()?.()
 * console.assert(disposed)
 * ```
 * @category runtime
 * @since 0.0.0
 */
export function registerTelemetryDisposal(dispose: () => Promise<void>): void {
  disposal = dispose
}

/** Take ownership once; no telemetry work is invented when disabled.
 * **Example** (Take the optional callback)
 * ```ts
 * import { registerTelemetryDisposal, takeTelemetryDisposal } from './telemetry-disposal.js'
 * registerTelemetryDisposal(() => Promise.resolve())
 * console.assert(takeTelemetryDisposal() !== undefined)
 * console.assert(takeTelemetryDisposal() === undefined)
 * ```
 * @category runtime
 * @since 0.0.0
 */
export function takeTelemetryDisposal(): (() => Promise<void>) | undefined {
  const current = disposal
  disposal = undefined
  return current
}
