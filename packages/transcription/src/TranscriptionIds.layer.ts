import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Str from "effect/String";
import { TranscriptionIds } from "./TranscriptionIds.service.js";
export const TranscriptionIdsLive = Layer.effect(
  TranscriptionIds,
  Effect.gen(function* () {
    const random = yield* SecureRandom.SecureRandom;
    return TranscriptionIds.of({
      uuid: random.uuidV4(),
      hex: Effect.fn("TranscriptionIds.hex")(function* (bytes) {
        const value = yield* random.randomBytes(bytes);
        let output = "";
        for (const byte of value) output += Str.padStart(2, "0")(byte.toString(16));
        return output;
      }),
    });
  })
);
