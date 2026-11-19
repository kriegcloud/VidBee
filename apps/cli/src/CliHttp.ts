import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as HttpClient from "effect/http/HttpClient";
import * as Request from "effect/http/HttpClientRequest";
import * as Response from "effect/http/HttpClientResponse";
import * as O from "effect/Option";
import * as S from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";
import * as Scope from "effect/Scope";
import { CliFailure } from "./Cli.errors.js";
import { originalMessage } from "./transport/descriptor.js";

const encode = S.encodeEffect(S.fromJsonString(S.Unknown));
const decodeJson = S.decodeEffect(S.fromJsonString(S.Unknown));
export const parseJson = (input: string) => decodeJson(input);
export const jsonIssue = SchemaIssue.makeFormatterDefault();
export const requestText = Effect.fn("requestText")(function* (
  client: HttpClient.HttpClient,
  method: "GET" | "POST",
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number
) {
  let request = method === "POST" ? Request.post(url, { headers }) : Request.get(url, { headers });
  if (method === "POST") {
    const text = yield* encode(body ?? {}).pipe(Effect.orDie);
    request = Request.bodyText(request, text, "application/json");
  }
  const consume = Effect.fn("requestText.consume")(function* () {
    const response = yield* HttpClient.withScope(client).execute(request);
    const bodyText = yield* response.text;
    const web = Response.toWeb(response);
    return { status: response.status, statusText: O.isSome(web) ? web.value.statusText : "", bodyText };
  });
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const requestScope = yield* Effect.acquireRelease(Scope.make(), (scope) => Scope.close(scope, Exit.void));
      const deadline = yield* Effect.sleep(timeoutMs).pipe(
        Effect.andThen(Scope.close(requestScope, Exit.void)),
        Effect.forkScoped({ startImmediately: true })
      );
      return yield* consume().pipe(
        Effect.provideService(Scope.Scope, requestScope),
        Effect.ensuring(Fiber.interrupt(deadline))
      );
    })
  ).pipe(
    Effect.provideService(HttpClient.TracerPropagationEnabled, false),
    Effect.mapError((cause) => CliFailure.make({ message: originalMessage(cause), cause }))
  );
});
