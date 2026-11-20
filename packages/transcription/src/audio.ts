import { dual } from "effect/Function";

export type { ExtractedAudio, PcmWave } from "./Pipeline.model.js";
export const TARGET_SAMPLE_RATE = 16_000;

const isReusableExtractedWavDataFirst = (wavMs: number, sourceMs: number): boolean => {
  if (wavMs <= 0) {
    return false;
  }
  if (sourceMs <= 0) {
    return true;
  }
  return wavMs + 1500 >= sourceMs * 0.9;
};
export const isReusableExtractedWav: {
  (wavMs: number, sourceMs: number): boolean;
  (sourceMs: number): (wavMs: number) => boolean;
} = dual(2, isReusableExtractedWavDataFirst);

export { abortLayer as audioAbortLayer, layer as audioLayer } from "./Audio.layer.js";
export { Audio, AudioAbort } from "./Audio.service.js";
export { binaryLayer as binaryWaveReaderLayer, layer as waveReaderLayer } from "./WaveReader.layer.js";
export { BinaryWaveReader, WaveReader } from "./WaveReader.service.js";
