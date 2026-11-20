import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Random from "effect/Random";
import { SubscriptionEntropy } from "./SubscriptionEntropy.service.js";
export const layer = Layer.effect(
  SubscriptionEntropy,
  Effect.gen(function* () {
    const secure = yield* SecureRandom.SecureRandom;
    return SubscriptionEntropy.of({ subscriptionId: secure.uuidV4(), leaseId: secure.ulid, next: Random.next });
  })
).pipe(Layer.provide(SecureRandom.layerWebCrypto));
