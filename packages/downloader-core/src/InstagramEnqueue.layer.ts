import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { InstagramInspectionLookup } from "./InstagramEnqueue.service.js";
import { InstagramProfiles } from "./instagram-profile.js";

/** Connect native enqueueing to the same inspector owner and cache. */
export const InstagramInspectionLookupLive = Layer.effect(
  InstagramInspectionLookup,
  Effect.gen(function* () {
    const profiles = yield* InstagramProfiles;
    return InstagramInspectionLookup.of({ get: profiles.get });
  })
);
