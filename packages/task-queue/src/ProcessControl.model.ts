import * as S from "effect/Schema";

/** Raw text returned by a file/process driver, decoded before interpreting it. */
export const ProcessOutputText = S.String;
/** Parsed getconf CLK_TCK value; malformed or non-finite output uses the old fallback. */
export const ClockTickRate = S.Finite;
/** Linux identity values extracted from /proc/PID/stat and /proc/stat. */
export const LinuxProcessIdentity = S.Struct({
  bootTimeSeconds: S.Finite,
  starttimeTicks: S.Finite,
});
/** Parsed ps PID output and epoch timestamps must be representable finite numbers. */
export const ProcessProbeNumber = S.Finite;
