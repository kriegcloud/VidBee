import * as ByteSize from "effect/ByteSize";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import { OutputProbe } from "./OutputProbe.service.js";

export const layer = Layer.effect(
  OutputProbe,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return OutputProbe.of({
      filePresent: Effect.fn("OutputProbe.filePresent")(
        function* (path) {
          if (!(yield* fs.exists(path))) return false;
          const info = yield* fs.stat(path);
          return ByteSize.toBigInt(info.size) > 0n;
        },
        Effect.orElseSucceed(() => false)
      ),
    });
  })
);
