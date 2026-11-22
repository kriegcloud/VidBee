import * as NodeSdk from "@effect/opentelemetry/NodeSdk";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import * as Layer from "effect/Layer";
import type { OtlpConfiguration } from "./Otlp.model.js";

/** Explicit opt-in tracing with no automatic instrumentation and a bounded scoped flush.
 * Disabled returns Layer.empty before constructing any exporter or processor.
 * **Example** (Enable a local collector)
 * ```ts
 * const Live = otlpLayer({ enabled: true, endpoint: "http://127.0.0.1:4318/v1/traces", version: "2.4.0" })
 * ```
 * @category layers
 * @since 0.0.0
 */
export const otlpLayer = (configuration: OtlpConfiguration) =>
  configuration.enabled
    ? NodeSdk.layer(() => ({
        spanProcessor: new SimpleSpanProcessor(
          new OTLPTraceExporter({ url: configuration.endpoint, timeoutMillis: 1000 })
        ),
        resource: { serviceName: "vidbee-desktop", serviceVersion: configuration.version },
        shutdownTimeout: "2 seconds",
      }))
    : Layer.empty;
