import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliAutomation } from "./CliAutomation.service.js";
import { makeAutomationSession } from "./transport/automation-client.js";
import type * as HttpClient from "effect/http/HttpClient";
export const CliAutomationLive = Layer.effect(
  CliAutomation,
  Effect.gen(function* () {
    const dependencies = yield* Effect.context<HttpClient.HttpClient>();
    return CliAutomation.of({
      make: Effect.fn("CliAutomation.make")((options) =>
        makeAutomationSession(options).pipe(Effect.provide(dependencies))
      ),
    });
  })
);
