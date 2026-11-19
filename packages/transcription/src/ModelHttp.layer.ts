import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import * as Stream from "effect/Stream";
import { ModelHttp } from "./ModelHttp.service.js";
import { HostFailure } from "./Transcription.errors.js";

const failure = (operation: string) => (cause: unknown) =>
  HostFailure.make({ operation, cause, legacyMessage: cause instanceof Error ? cause.message : String(cause) });
export const ModelHttpLive = Layer.effect(
  ModelHttp,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    return ModelHttp.of({
      request: Effect.fn("ModelHttp.request")(function* (spec) {
        const request = HttpClientRequest.make(spec.method)(spec.url);
        const abort =
          spec.signal === undefined
            ? Effect.never
            : Effect.callback<never, HostFailure>((resume) => {
                const signal = spec.signal;
                if (signal === undefined) return;
                const stop = () => resume(Effect.fail(failure("request")(signal.reason)));
                if (signal.aborted) stop();
                else signal.addEventListener("abort", stop);
                return Effect.sync(() => signal.removeEventListener("abort", stop));
              });
        const response = yield* client.execute(request).pipe(
          Effect.provideService(HttpClient.TracerPropagationEnabled, false),
          Effect.mapError(failure("request")),
          Effect.raceFirst(abort),
          Effect.timeoutOrElse({
            duration: spec.timeoutMs ?? 15_000,
            orElse: () =>
              Effect.fail(
                failure("request")(
                  Object.assign(new Error(`download timed out: ${spec.url}`), { name: "TimeoutError" })
                )
              ),
          })
        );
        return {
          status: response.status,
          ok: response.status >= 200 && response.status < 300,
          contentLength: response.headers["content-length"] ?? null,
          hasBody: spec.method !== "HEAD" && response.status !== 204 && response.status !== 304,
          consume: Effect.fn("ModelHttp.consume")((sink) =>
            response.stream.pipe(
              Stream.runForEach(sink),
              Effect.mapError((error) => (S.is(HostFailure)(error) ? error : failure("body")(error)))
            )
          ),
        };
      }),
    });
  })
);
