import * as BunHttpServer from "@effect/platform-bun/BunHttpServer";
import { expect, it } from "@effect/vitest";
import { $DesktopId } from "@vidbee/identity/packages";
import * as Arbitrary from "effect/Arbitrary";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as HttpServer from "effect/http/HttpServer";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import * as Protobuf from "protobufjs";
import { vi } from "vitest";
import { createDesktopLoggingWith } from "../src/main/logging/DesktopLogging.entry.js";
import { otlpLayer, otlpLayerWithExporter } from "../src/main/logging/Otlp.layer.js";
import { OtlpConfiguration, otlpEnabled } from "../src/main/logging/Otlp.model.js";
import type { SpanExporter } from "@opentelemetry/sdk-trace-base";

vi.mock("electron-log/main", () => ({ default: { warn: vi.fn(), info: vi.fn() } }));
const $I = $DesktopId.create("test/desktop-otlp.spec");
class Capture extends S.Opaque<Capture, { readonly brand: unique symbol }>()(
  S.Struct({
    resourceSpans: S.Array(
      S.Struct({
        resource: S.Struct({
          attributes: S.Array(S.Struct({ key: S.String, value: S.Struct({ stringValue: S.optionalKey(S.String) }) })),
        }),
        scopeSpans: S.Array(
          S.Struct({
            spans: S.Array(
              S.Struct({
                traceId: S.String,
                spanId: S.String,
                name: S.String,
                startTimeUnixNano: S.String,
                endTimeUnixNano: S.String,
              })
            ),
          })
        ),
      })
    ),
  }).pipe(
    $I.annoteSchema("Capture", {
      description: "Decoded OTLP protobuf resource and span fields asserted by the collector.",
    })
  )
) {}
// Official OTLP field numbers; unconsumed protobuf fields are intentionally ignored.
const requestType = Protobuf.parse(`syntax = "proto3";
message Value { string stringValue = 1; }
message Attribute { string key = 1; Value value = 2; }
message Resource { repeated Attribute attributes = 1; }
message Span { bytes traceId = 1; bytes spanId = 2; string name = 5; fixed64 startTimeUnixNano = 7; fixed64 endTimeUnixNano = 8; }
message ScopeSpans { repeated Span spans = 2; }
message ResourceSpans { Resource resource = 1; repeated ScopeSpans scopeSpans = 2; }
message ExportTraceServiceRequest { repeated ResourceSpans resourceSpans = 1; }`).root.lookupType(
  "ExportTraceServiceRequest"
);
const requests: Array<{ url: string; body: Uint8Array; contentType: string | undefined }> = [];
const collect = Effect.fnUntraced(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const body = yield* request.arrayBuffer;
  requests.push({ url: request.url, body: new Uint8Array(body), contentType: request.headers["content-type"] });
  return HttpServerResponse.empty();
});
const collector = HttpServer.serve(collect());
const enabled = Layer.unwrap(
  Effect.map(HttpServer.HttpServer, (server) =>
    otlpLayer(
      OtlpConfiguration.make({
        enabled: true,
        endpoint: `${HttpServer.formatAddress(server.address)}/v1/traces`,
        version: "test-version",
      })
    )
  )
);
const live = Layer.mergeAll(collector, enabled).pipe(
  Layer.provide(BunHttpServer.layerServer({ hostname: "127.0.0.1", port: 0 }))
);
it("enables only the exact environment switch", () => {
  expect(otlpEnabled("1")).toBe(true);
  A.forEach([undefined, "", "0", "true", "yes", " 1"], (value) => {
    expect(otlpEnabled(value)).toBe(false);
  });
});
it("returns the exact empty Layer when disabled", () => {
  expect(
    otlpLayer(OtlpConfiguration.make({ enabled: false, endpoint: "invalid://must-not-resolve", version: "test" }))
  ).toBe(Layer.empty);
});
it.layer(live, { excludeTestServices: true })((test) => {
  test.effect(
    "decodes one real protobuf span from an explicitly IPv4-loopback collector",
    Effect.fnUntraced(function* () {
      yield* Effect.void.pipe(Effect.withSpan("desktop.driver.test"));
      yield* Effect.sleep("100 millis");
      expect(requests).toHaveLength(1);
      const request = requests[0];
      expect(request?.url).toBe("/v1/traces");
      expect(request?.contentType).toBe("application/x-protobuf");
      const decoded: unknown = requestType.toObject(requestType.decode(request?.body ?? new Uint8Array()), {
        longs: String,
        bytes: String,
        arrays: true,
        defaults: true,
      });
      const capture = yield* S.decodeUnknownEffect(Capture)(decoded);
      expect(capture.resourceSpans).toHaveLength(1);
      const resource = capture.resourceSpans[0];
      expect(resource?.resource.attributes).toEqual(
        expect.arrayContaining([
          { key: "service.name", value: { stringValue: "vidbee-desktop" } },
          { key: "service.version", value: { stringValue: "test-version" } },
        ])
      );
      const spans = A.flatMap(capture.resourceSpans, (r) => A.flatMap(r.scopeSpans, (scope) => scope.spans));
      expect(spans).toHaveLength(1);
      const span = spans[0];
      expect(span?.name).toBe("desktop.driver.test");
      expect(span?.traceId).toHaveLength(24);
      expect(span?.spanId).toHaveLength(12);
      expect(BigInt(span?.startTimeUnixNano ?? "0")).toBeGreaterThan(0n);
      expect(BigInt(span?.endTimeUnixNano ?? "0")).toBeGreaterThanOrEqual(BigInt(span?.startTimeUnixNano ?? "0"));
    })
  );
});
it("bounds a stalled exporter flush using the production SDK shutdown policy", (test) => {
  const completions: Array<() => void> = [];
  const complete = () => A.forEach(completions, (done) => done());
  let shutDown = false;
  const shutdownDone = Promise.withResolvers<void>();
  const exporter: SpanExporter = {
    export: (_spans, done) => {
      completions.push(() => done({ code: 0 }));
    },
    shutdown: () => {
      shutDown = true;
      shutdownDone.resolve();
      return Promise.resolve();
    },
  };
  const config = OtlpConfiguration.make({ enabled: true, endpoint: "http://127.0.0.1/unused", version: "flush-test" });
  const owner = createDesktopLoggingWith(
    config,
    otlpLayerWithExporter(config, () => exporter)
  );
  test.onTestFinished(() => {
    complete();
  });
  return owner.ready
    .then((ready) => {
      expect(ready).toBe(true);
      return owner.runPromise(Effect.void.pipe(Effect.withSpan("bounded.flush")));
    })
    .then(() => {
      const start = performance.now();
      return owner.dispose().then(() => {
        const elapsed = performance.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(1800);
        expect(elapsed).toBeLessThan(2800);
        expect(shutDown).toBe(false);
        complete();
        return shutdownDone.promise.then(() => {
          expect(shutDown).toBe(true);
        });
      });
    });
});
it.prop("the configuration schema generates valid settings", [Arbitrary.schema(OtlpConfiguration)], ([config]) => {
  expect(S.is(OtlpConfiguration)(config)).toBe(true);
});
