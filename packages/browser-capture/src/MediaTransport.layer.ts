import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as S from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import { HostFailure } from "./Capture.errors.js";
import { MediaTransport } from "./MediaTransport.service.js";
import type { TransferSink } from "./BrowserProfiles.service.js";

const LIMIT_MS = 30 * 60 * 1000;
const failure = (operation: string) => (cause: unknown) =>
  HostFailure.make({ operation, cause, legacyMessage: cause instanceof Error ? cause.message : String(cause) });
const aborted = (signal: AbortSignal) =>
  Effect.callback<never, HostFailure>((resume) => {
    const stop = () => resume(Effect.fail(failure("media abort")(signal.reason)));
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) stop();
    return Effect.sync(() => signal.removeEventListener("abort", stop));
  });
const interruptible = <A, E, R>(effect: Effect.Effect<A, E, R>, signal: AbortSignal) =>
  signal.aborted ? Effect.fail(failure("media abort")(signal.reason)) : effect.pipe(Effect.raceFirst(aborted(signal)));
export const MediaTransportLayer = Layer.effect(
  MediaTransport,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const fs = yield* FileSystem.FileSystem;
    const ownerScope = yield* Effect.scope;
    return MediaTransport.of({
      open: Effect.fn("MediaTransport.open")((url, referer, signal) =>
        Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const scope = yield* Scope.fork(ownerScope);
            const acquire = Effect.fn("MediaTransport.acquire")(function* () {
              const started = yield* Clock.currentTimeMillis;
              const request = HttpClientRequest.get(url).pipe(HttpClientRequest.setHeader("Referer", referer));
              const acquired = yield* Effect.result(
                interruptible(
                  HttpClient.withScope(client)
                    .execute(request)
                    .pipe(Effect.provideService(Scope.Scope, scope), Effect.timeout(LIMIT_MS)),
                  signal
                )
              );
              if (acquired._tag === "Failure") {
                yield* Scope.close(scope, Exit.void);
                return yield* failure("media request")(acquired.failure);
              }
              const response = acquired.success;
              const web = HttpClientResponse.toWeb(response);
              const contentType = yield* S.decodeEffect(S.UndefinedOr(S.String))(response.headers["content-type"]).pipe(
                Effect.mapError(failure("content type"))
              );
              const contentLength = yield* S.decodeEffect(S.UndefinedOr(S.String))(
                response.headers["content-length"]
              ).pipe(Effect.mapError(failure("content length")));
              return {
                release: Scope.close(scope, Exit.void),
                ok: response.status >= 200 && response.status < 300,
                status: response.status,
                hasBody: Option.isNone(web) || web.value.body !== null,
                contentType: contentType ?? null,
                contentLength: contentLength ?? null,
                copy: Effect.fn("MediaTransport.copy")(function* (
                  path: string,
                  copySignal: AbortSignal,
                  sink: TransferSink
                ) {
                  let bytes = 0;
                  const total = Number(contentLength ?? null) || 0;
                  const body = Option.isSome(web) ? web.value.body : null;
                  const raw: Stream.Stream<Uint8Array, HostFailure> = Option.isSome(web)
                    ? body === null
                      ? Stream.empty
                      : Stream.fromReadableStream<Uint8Array, HostFailure>({
                          evaluate: () => body,
                          onError: failure("media body"),
                        })
                    : response.stream.pipe(Stream.mapError(failure("media body")));
                  const stream = raw.pipe(
                    Stream.mapEffect((chunk) => S.decodeEffect(S.Uint8Array)(chunk)),
                    Stream.tap((chunk) => {
                      bytes += chunk.length;
                      return sink.emit(bytes, total);
                    })
                  );
                  const elapsed = (yield* Clock.currentTimeMillis) - started;
                  const copying = Stream.run(stream, fs.sink(path, { flag: "w" })).pipe(
                    Effect.mapError(failure("media copy")),
                    Effect.timeout(Math.max(0, LIMIT_MS - elapsed)),
                    Effect.mapError(failure("media deadline"))
                  );
                  yield* interruptible(copying, copySignal).pipe(Effect.ensuring(Scope.close(scope, Exit.void)));
                  return { bytes, total };
                }),
              };
            });
            return yield* restore(acquire()).pipe(Effect.onError(() => Scope.close(scope, Exit.void)));
          })
        )
      ),
    });
  })
);
export const MediaTransportLive = MediaTransportLayer.pipe(
  Layer.provide(
    Layer.mergeAll(
      FetchHttpClient.layer.pipe(Layer.provide(Layer.succeed(FetchHttpClient.RequestInit, { redirect: "error" }))),
      Layer.succeed(HttpClient.TracerPropagationEnabled, false)
    )
  )
);
