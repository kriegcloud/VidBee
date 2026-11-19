import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import { ModelHttpLive } from "../../src/ModelHttp.layer.js";
import { ModelHttp } from "../../src/ModelHttp.service.js";

const requests: Array<{ method: string; url: string; headers: Readonly<Record<string, string>> }> = [];
const transport = HttpClient.make((request, url) =>
  Effect.sync(() => {
    requests.push({ method: request.method, url: url.toString(), headers: request.headers });
    return HttpClientResponse.fromWeb(
      request,
      new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: { "Content-Length": "3" } })
    );
  })
);
layer(ModelHttpLive.pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, transport))))((it) => {
  it.effect(
    "returns status without automatic retry/filtering and consumes bytes separately",
    () =>
      Effect.gen(function* () {
        const http = yield* ModelHttp;
        const response = yield* http.request({ url: "https://fixture.invalid/model", method: "GET" });
        expect([response.status, response.ok, response.contentLength, response.hasBody]).toEqual([
          206,
          true,
          "3",
          true,
        ]);
        const chunks: number[] = [];
        yield* response.consume((chunk) => Effect.sync(() => chunks.push(...chunk)).pipe(Effect.asVoid));
        expect(chunks).toEqual([1, 2, 3]);
        expect(requests).toEqual([{ method: "GET", url: "https://fixture.invalid/model", headers: {} }]);
      }),
    120000
  );
});
