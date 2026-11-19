import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import { SherpaLive } from "../../src/Sherpa.driver.js";
import { Sherpa, SherpaLoader } from "../../src/Sherpa.service.js";
import { TranscriptionTime } from "../../src/TranscriptionTime.service.js";
import type { HostFailure } from "../../src/Transcription.errors.js";

const trace: string[] = [];
let elapsed = 0;
let result: unknown = { text: "fixture", tokens: ["fixture"], timestamps: [0], extra: true };
let thrown: Error | undefined;
class FakeRecognizer {
  createStream() {
    trace.push("createStream");
    elapsed += 10;
    return {
      acceptWaveform: () => {
        trace.push("acceptWaveform");
        elapsed += 20;
      },
      inputFinished: () => {
        trace.push("inputFinished");
        elapsed += 5;
      },
    };
  }
  decode() {
    trace.push("decode");
    elapsed += 94;
    if (thrown !== undefined) throw thrown;
  }
  getResult() {
    trace.push("getResult");
    elapsed += 40;
    return result;
  }
}
class FakeVad {
  acceptWaveform() {}
  isEmpty() {
    return true;
  }
  front() {
    return {};
  }
  pop() {}
  flush() {}
}
class FakeDiarizer {
  process() {
    return [];
  }
}
const loader = Layer.succeed(SherpaLoader, {
  load: Effect.succeed({ OfflineRecognizer: FakeRecognizer, Vad: FakeVad, OfflineSpeakerDiarization: FakeDiarizer }),
  readResult: (recognizer, stream) => recognizer.getResult(stream),
});
const time = Layer.succeed(TranscriptionTime, {
  now: Effect.succeed(0),
  monotonicMillis: Effect.sync(() => elapsed),
  readMonotonicMillis: () => {
    trace.push("clock");
    return elapsed;
  },
  sleep: Effect.fn("test.sleep")(() => Effect.void),
  after: Effect.fn("test.after")(() => Effect.succeed(Effect.void)),
  every: Effect.fn("test.every")(() => Effect.succeed(Effect.void)),
  microtask: Effect.fn("test.microtask")((action: Effect.Effect<void, HostFailure>) => action),
});
layer(SherpaLive.pipe(Layer.provide(Layer.mergeAll(loader, time))))((it) => {
  it.effect("measures synchronous decode only and preserves ordinary/probe call distinction", () =>
    Effect.gen(function* () {
      const sherpa = yield* Sherpa;
      const session = yield* sherpa.recognizer({});
      trace.length = 0;
      elapsed = 0;
      const duration = yield* session.probe(new Float32Array(4800));
      expect(duration).toBe(94);
      expect(trace).toEqual([
        "createStream",
        "acceptWaveform",
        "inputFinished",
        "clock",
        "decode",
        "clock",
        "getResult",
      ]);
      trace.length = 0;
      const decoded = yield* session.decode({ sampleRate: 16000, samples: new Float32Array(1) });
      expect(decoded.text).toBe("fixture");
      expect(trace).toEqual(["createStream", "acceptWaveform", "decode", "getResult"]);
    })
  );
  it.effect("rejects malformed native observations and preserves thrown addon identity", () =>
    Effect.gen(function* () {
      const sherpa = yield* Sherpa;
      const session = yield* sherpa.recognizer({});
      result = { text: 7 };
      const malformed = yield* session.decode({ sampleRate: 16000, samples: new Float32Array(1) }).pipe(Effect.result);
      expect(Result.isFailure(malformed)).toBe(true);
      if (Result.isFailure(malformed)) expect(malformed.failure._tag).toBe("BoundaryDecodeError");
      result = {};
      const issue = new Error("native decode fixture");
      thrown = issue;
      const failed = yield* session.decode({ sampleRate: 16000, samples: new Float32Array(1) }).pipe(Effect.result);
      thrown = undefined;
      expect(Result.isFailure(failed)).toBe(true);
      if (Result.isFailure(failed)) expect(failed.failure.cause).toBe(issue);
    })
  );
});
