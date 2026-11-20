const SAMPLE_RATE = 16_000;
export function cloudClipWav(pcm: Uint8Array): Uint8Array<ArrayBuffer> {
  const wav = new Uint8Array(44 + pcm.byteLength);
  const view = new DataView(wav.buffer);
  wav.set(new TextEncoder().encode("RIFF"), 0);
  view.setUint32(4, wav.byteLength - 8, true);
  wav.set(new TextEncoder().encode("WAVEfmt "), 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  wav.set(new TextEncoder().encode("data"), 36);
  view.setUint32(40, pcm.byteLength, true);
  wav.set(pcm, 44);
  return wav;
}

export { layer } from "./CloudTranscription.layer.js";
export { CloudFileIO, CloudTranscription } from "./CloudTranscription.service.js";
export type { CloudRunInput } from "./CloudRun.model.js";
