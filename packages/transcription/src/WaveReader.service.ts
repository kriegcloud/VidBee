import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { PcmWave } from "./Pipeline.model.js";
import type { AudioFailure, HostFailure } from "./Transcription.errors.js";
/** Byte operations retain each host's own bounds-error boundary. */
export interface BinaryWaveView {
  readonly ascii: (start: number, end: number) => string;
  readonly byte: (offset: number) => number | undefined;
  readonly float32: (offset: number) => number;
  readonly int16: (offset: number) => number;
  readonly length: number;
  readonly subarray: (start: number, end: number) => BinaryWaveView;
  readonly uint16: (offset: number) => number;
  readonly uint32: (offset: number) => number;
}
export class BinaryWaveReader extends Context.Service<
  BinaryWaveReader,
  {
    readonly view: (bytes: Uint8Array) => BinaryWaveView;
  }
>()("@vidbee/transcription/WaveReader.service/BinaryWaveReader") {}
export class WaveReader extends Context.Service<
  WaveReader,
  {
    readonly read: (path: string) => Effect.Effect<PcmWave, AudioFailure | HostFailure>;
  }
>()("@vidbee/transcription/WaveReader.service/WaveReader") {}
