import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import { ExtensionRequestFailure } from "./Extension.errors.js";
import { isRecord } from "./Extension.model.js";
import { requestFailureMessage } from "./Extension.pure.js";
import { ExtensionBrowser } from "./ExtensionBrowser.service.js";
import { ExtensionHttp } from "./ExtensionHttp.service.js";

const result = (status: number, body: unknown) => {
  if (status >= 200 && status < 300) return Effect.succeed(body);
  return Effect.try({
    try: () => (isRecord(body) ? A.join(A.map(A.filter([body.error, body.details], Boolean), String), "\n\n") : ""),
    catch: (cause) =>
      ExtensionRequestFailure.make({ message: cause instanceof Error ? cause.message : "Failed to fetch video info." }),
  }).pipe(
    Effect.flatMap((combined) =>
      Effect.fail(ExtensionRequestFailure.make({ message: combined || `Request failed: ${status}`, status }))
    ),
    Effect.mapError((error) =>
      ExtensionRequestFailure.make({
        message: requestFailureMessage(error),
        ...(error.status === undefined ? {} : { status: error.status }),
      })
    )
  );
};
export const ExtensionHttpLive = Layer.effect(
  ExtensionHttp,
  Effect.gen(function* () {
    const browser = yield* ExtensionBrowser;
    const rawClient = yield* HttpClient.HttpClient;
    const client = HttpClient.withScope(rawClient);
    return ExtensionHttp.of({
      requestJson: Effect.fn("ExtensionHttp.requestJson")(function* (method, url, deadlineMs) {
        const origin = yield* browser.origin.pipe(
          Effect.mapError((error) => ExtensionRequestFailure.make({ message: error.message }))
        );
        const responseStatus = yield* Ref.make<number | undefined>(undefined);
        const request = HttpClientRequest.setHeader(
          method === "GET" ? HttpClientRequest.get(url) : HttpClientRequest.post(url),
          "X-VidBee-Extension",
          origin
        );
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const response = yield* client
              .execute(request)
              .pipe(
                Effect.mapError((error) =>
                  ExtensionRequestFailure.make({ message: requestFailureMessage(error.reason.cause) })
                )
              );
            yield* Ref.set(responseStatus, response.status);
            const body = yield* response.json.pipe(Effect.orElseSucceed(() => null));
            return yield* result(response.status, body);
          }).pipe(
            Effect.timeoutOrElse({
              duration: deadlineMs,
              orElse: () =>
                Ref.get(responseStatus).pipe(
                  Effect.flatMap((status) =>
                    status === undefined
                      ? Effect.fail(ExtensionRequestFailure.make({ message: "Failed to fetch video info." }))
                      : result(status, null)
                  )
                ),
            })
          )
        ).pipe(Effect.provideService(HttpClient.TracerPropagationEnabled, false));
      }),
    });
  })
);
