import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import type { HttpClient } from "effect/http/HttpClient";
export interface HttpState {
  body: string | undefined;
  bodyStarted: (() => void) | undefined;
  cancellations: number;
  mode: "ok" | "invalid-json" | "http-error" | "transport" | "acquire-block" | "body-block";
  readonly requests: Array<{ readonly url: string; readonly options: RequestInit }>;
  readonly signals: AbortSignal[];
  status: number;
}
export class HttpFixture extends Context.Service<HttpFixture, HttpState>()(
  "vidbee-extension/test/HttpFixture.driver/HttpFixture"
) {}
const fixture = Layer.sync(
  HttpFixture,
  (): HttpState => ({
    mode: "ok",
    status: 200,
    body: undefined,
    bodyStarted: undefined,
    requests: [],
    signals: [],
    cancellations: 0,
  })
);
const fetchLayer = Layer.effect(
  FetchHttpClient.Fetch,
  Effect.gen(function* () {
    const state = yield* HttpFixture;
    const fake: typeof globalThis.fetch = (input, options = {}) => {
      state.requests.push({ url: String(input), options });
      const signal = options.signal;
      if (signal !== null && signal !== undefined) {
        state.signals.push(signal);
        signal.addEventListener("abort", () => {
          state.cancellations += 1;
        });
      }
      if (state.mode === "transport") return Promise.reject(new TypeError("Failed to fetch"));
      if (state.mode === "acquire-block") {
        const pending = Promise.withResolvers<Response>();
        signal?.addEventListener("abort", () => pending.reject("timeout"));
        return pending.promise;
      }
      if (state.mode === "body-block") {
        const pending = Promise.withResolvers<ArrayBuffer>();
        signal?.addEventListener("abort", () => pending.reject("timeout"));
        class SuspendedResponse extends Response {
          override arrayBuffer() {
            state.bodyStarted?.();
            return pending.promise;
          }
        }
        return Promise.resolve(new SuspendedResponse(null, { status: state.status }));
      }
      return Promise.resolve(
        new Response(
          state.body ??
            (state.mode === "invalid-json"
              ? "bad JSON"
              : state.mode === "http-error"
                ? '{"error":"first","details":"second"}'
                : '{"token":"token"}'),
          { status: state.status }
        )
      );
    };
    return fake;
  })
).pipe(Layer.provideMerge(fixture));
export const httpFixtureTransport: Layer.Layer<HttpClient | HttpFixture> = FetchHttpClient.layer.pipe(
  Layer.provideMerge(fetchLayer)
);
