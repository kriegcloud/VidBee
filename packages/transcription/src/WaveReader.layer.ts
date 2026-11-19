import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import { TARGET_SAMPLE_RATE } from "./audio.js";
import { AudioFailure, HostFailure } from "./Transcription.errors.js";
import { TranscriptionFiles } from "./TranscriptionFiles.service.js";
import { BinaryWaveReader, WaveReader } from "./WaveReader.service.js";
import type { PcmWave } from "./Pipeline.model.js";
import type { BinaryWaveView } from "./WaveReader.service.js";

const nativeView = (bytes: Uint8Array): BinaryWaveView => {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    length: bytes.length,
    ascii: (start, end) => {
      let text = "";
      for (const byte of bytes.subarray(start, end)) text += String.fromCharCode(byte & 0x7f);
      return text;
    },
    uint16: (offset) => data.getUint16(offset, true),
    uint32: (offset) => data.getUint32(offset, true),
    int16: (offset) => data.getInt16(offset, true),
    float32: (offset) => data.getFloat32(offset, true),
    byte: (offset) => bytes[offset],
    subarray: (start, end) => nativeView(bytes.subarray(start, end)),
  };
};
export const binaryLayer = Layer.succeed(BinaryWaveReader, { view: nativeView });
const parse = (path: string, buf: BinaryWaveView): Result.Result<PcmWave, AudioFailure> => {
  const fail = (message: string) => Result.fail(AudioFailure.make({ operation: "readPcm", legacyMessage: message }));
  if (buf.length < 44 || buf.ascii(0, 4) !== "RIFF" || buf.ascii(8, 12) !== "WAVE")
    return fail(`not a wav file: ${path}`);
  let offset = 12;
  let sampleRate = TARGET_SAMPLE_RATE;
  let bitsPerSample = 16;
  let channels = 1;
  let data: BinaryWaveView | null = null;
  while (offset + 8 <= buf.length) {
    const id = buf.ascii(offset, offset + 4);
    const size = buf.uint32(offset + 4);
    const start = offset + 8;
    if (id === "fmt ") {
      channels = buf.uint16(start + 2);
      sampleRate = buf.uint32(start + 4);
      bitsPerSample = buf.uint16(start + 14);
    } else if (id === "data") {
      data = buf.subarray(start, start + size);
      break;
    }
    offset = start + size + (size % 2);
  }
  if (data === null) return fail(`wav has no data chunk: ${path}`);
  const frameSize = Math.max(1, channels) * Math.max(1, bitsPerSample / 8);
  const frames = Math.floor(data.length / frameSize);
  const samples = new Float32Array(frames);
  if (bitsPerSample === 16) {
    for (let i = 0; i < frames; i++) {
      let sum = 0;
      for (let channel = 0; channel < channels; channel++) sum += data.int16((i * channels + channel) * 2) / 32768;
      samples[i] = sum / channels;
    }
  } else if (bitsPerSample === 32) {
    for (let i = 0; i < frames; i++) {
      let sum = 0;
      for (let channel = 0; channel < channels; channel++) sum += data.float32((i * channels + channel) * 4);
      samples[i] = sum / channels;
    }
  } else if (bitsPerSample === 8) {
    for (let i = 0; i < frames; i++) {
      let sum = 0;
      for (let channel = 0; channel < channels; channel++)
        sum += ((data.byte(i * channels + channel) ?? 128) - 128) / 128;
      samples[i] = sum / channels;
    }
  } else return fail(`unsupported wav bit depth: ${bitsPerSample}`);
  return Result.succeed({ sampleRate, samples });
};
export const make = Effect.fnUntraced(function* () {
  const files = yield* TranscriptionFiles;
  const reader = yield* BinaryWaveReader;
  return WaveReader.of({
    read: Effect.fn("WaveReader.read")(function* (path) {
      const bytes = yield* files.readBytes(path);
      return yield* Effect.try({
        try: () => parse(path, reader.view(bytes)),
        catch: (cause) =>
          HostFailure.make({
            operation: "readPcm",
            legacyMessage: cause instanceof Error ? cause.message : String(cause),
            cause,
          }),
      }).pipe(Effect.flatMap(Effect.fromResult));
    }),
  });
});
export const layer = Layer.effect(WaveReader, make());
