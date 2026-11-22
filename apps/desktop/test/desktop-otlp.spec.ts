import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import { expect, it } from "@effect/vitest";
import * as Arbitrary from "effect/Arbitrary";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as HttpServer from "effect/http/HttpServer";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import { otlpLayer } from "../src/main/logging/Otlp.layer.js";
import { OtlpConfiguration, otlpEnabled } from "../src/main/logging/Otlp.model.js";

const requests: Array<{ url: string; body: Uint8Array }> = [];
const collect = Effect.fnUntraced(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const body = yield* request.arrayBuffer;
  requests.push({ url: request.url, body: new Uint8Array(body) });
  return HttpServerResponse.empty();
});
const collector = HttpServer.serve(collect());
const enabled = Layer.unwrap(
  Effect.map(HttpServer.HttpServer, (server) =>
    otlpLayer({
      enabled: true,
      endpoint: `${HttpServer.formatAddress(server.address)}/v1/traces`,
      version: "test-version",
    })
  )
);
const live = Layer.mergeAll(collector, enabled).pipe(Layer.provide(NodeHttpServer.layerTest));

it("enables only the exact environment switch", () => {
  expect(otlpEnabled("1")).toBe(true);
  A.forEach([undefined, "", "0", "true", "yes", " 1"], (value) => {
    expect(otlpEnabled(value)).toBe(false);
  });
});
it("returns the exact empty Layer when disabled without examining an endpoint", () => {
  expect(otlpLayer({ enabled: false, endpoint: "invalid://must-not-resolve", version: "test" })).toBe(Layer.empty);
});
it.layer(live, { excludeTestServices: true })((test) => {
  test.effect(
    "exports only to the in-process loopback collector when explicitly enabled",
    Effect.fnUntraced(function* () {
      yield* Effect.void.pipe(Effect.withSpan("desktop.driver.test"));
      yield* Effect.sleep("100 millis");
      expect(requests.length).toBeGreaterThan(0);
      expect(A.every(requests, (request) => request.url === "/v1/traces")).toBe(true);
      const payload = new TextDecoder().decode(requests[0]?.body);
      expect(payload).toContain("desktop.driver.test");
      expect(payload).toContain("vidbee-desktop");
      expect(payload).toContain("test-version");
    })
  );
});

it.prop(
  "the configuration schema generates valid captured settings",
  [Arbitrary.schema(OtlpConfiguration)],
  ([configuration]) => {
    expect(S.is(OtlpConfiguration)(configuration)).toBe(true);
  }
);
