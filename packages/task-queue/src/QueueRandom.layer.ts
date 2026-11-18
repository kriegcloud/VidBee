import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Random from "effect/Random";
import { QueueRandom } from "./QueueRandom.service.js";

export const layer = Layer.effect(
  QueueRandom,
  Effect.gen(function* () {
    const secure = yield* SecureRandom.SecureRandom;
    return QueueRandom.of({ next: Random.next, uuid: secure.uuidV4() });
  })
).pipe(Layer.provide(SecureRandom.layerWebCrypto));
