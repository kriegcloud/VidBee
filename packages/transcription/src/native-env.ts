import { dual } from "effect/Function";

const name = (platform: string, arch: string): string =>
  `sherpa-onnx-${platform === "win32" ? "win" : platform}-${arch}`;
export const sherpaNativePackageName: {
  (platform: string, arch: string): string;
  (arch: string): (platform: string) => string;
} = dual(2, name);
export { TranscriptionHost } from "./TranscriptionHost.service.js";
