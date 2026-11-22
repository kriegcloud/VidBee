import * as NodeSdk from "@effect/opentelemetry/NodeSdk";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import * as Effect from "effect/Effect";
import { dual } from "effect/Function";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import type * as Resource from "@effect/opentelemetry/Resource";
import type { SpanExporter } from "@opentelemetry/sdk-trace-base";
import type { OtlpConfiguration } from "./Otlp.model.js";

/** Explicit opt-in tracing with no automatic instrumentation and a bounded scoped flush.
 * Disabled returns Layer.empty before constructing any exporter or processor.
 * **Example** (Enable a local collector)
 * ```ts
 * import { otlpLayer } from "./Otlp.layer.js"
 * import { OtlpConfiguration } from "./Otlp.model.js"
 * const Live = otlpLayer(OtlpConfiguration.make({ enabled: true, endpoint: "http://127.0.0.1:4318/v1/traces", version: "2.4.0" }))
 * void Live
 * ```
 * @category layers
 * @since 0.0.0
 */
export const otlpLayer = (configuration: OtlpConfiguration) =>
  otlpLayerWithExporter(
    configuration,
    () => new OTLPTraceExporter({ url: configuration.endpoint, timeoutMillis: 1000 })
  );

/** Supply an exporter without changing production resource or shutdown policy.
 * **Example** (Use an explicitly supplied exporter)
 * ```ts
 * import { otlpLayerWithExporter } from "./Otlp.layer.js"
 * import { OtlpConfiguration } from "./Otlp.model.js"
 * import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto"
 * const config = OtlpConfiguration.make({ enabled: true, endpoint: "http://127.0.0.1:4318/v1/traces", version: "test" })
 * const live = otlpLayerWithExporter(config, () => new OTLPTraceExporter({ url: config.endpoint }))
 * void live
 * ```
 * @category layers
 * @since 0.0.0
 */
export const otlpLayerWithExporter: {
  (configuration: OtlpConfiguration, exporter: () => SpanExporter): Layer.Layer<Resource.Resource, S.SchemaError>;
  (exporter: () => SpanExporter): (configuration: OtlpConfiguration) => Layer.Layer<Resource.Resource, S.SchemaError>;
} = dual(2, (configuration: OtlpConfiguration, exporter: () => SpanExporter) =>
  configuration.enabled
    ? NodeSdk.layer(
        Effect.map(
          S.decodeEffect(S.String.check(S.isPattern(/^https?:\/\/[^\s/]+(?:\/[^\s]*)?$/)))(configuration.endpoint),
          (): NodeSdk.Configuration => ({
            spanProcessor: new SimpleSpanProcessor(exporter()),
            resource: { serviceName: "vidbee-desktop", serviceVersion: configuration.version },
            shutdownTimeout: "2 seconds",
          })
        )
      )
    : Layer.empty
);
