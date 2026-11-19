import * as Predicate from "effect/Predicate";
import { CAPTURE_AUDIO_BITRATE_K, CAPTURE_FPS, CAPTURE_X264_CRF } from "./quality.js";
import type { RecorderInput } from "./Recorder.model.js";
/** Build ffmpeg argv that grabs an X11 screen and optional Pulse monitor. */
export const buildRecorderArgs = (input: RecorderInput): string[] => {
  const fps =
    input.fps !== undefined && Predicate.isTruthy(input.fps) && input.fps >= 24
      ? Math.min(60, Math.round(input.fps))
      : CAPTURE_FPS;
  const originX = input.originX ?? 0;
  const originY = input.originY ?? 0;
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-thread_queue_size",
    "4096",
    "-f",
    "x11grab",
    "-draw_mouse",
    "0",
    "-video_size",
    `${input.width}x${input.height}`,
    "-framerate",
    String(fps),
    "-i",
    `${input.display}.0+${originX},${originY}`,
  ];
  if (input.includeAudio && input.pulseSink !== undefined && Predicate.isTruthy(input.pulseSink)) {
    args.push("-thread_queue_size", "4096", "-f", "pulse", "-i", `${input.pulseSink}.monitor`);
  }
  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    String(CAPTURE_X264_CRF),
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "high",
    "-movflags",
    "+faststart"
  );
  if (input.includeAudio && input.pulseSink !== undefined && Predicate.isTruthy(input.pulseSink)) {
    args.push("-c:a", "aac", "-b:a", `${CAPTURE_AUDIO_BITRATE_K}k`, "-ar", "48000", "-ac", "2");
  } else {
    args.push("-an");
  }
  args.push(input.outputPath);
  return args;
};
