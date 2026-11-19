import * as A from "effect/Array";
import * as Option from "effect/Option";
import * as Str from "effect/String";
import type { ProcessEvent } from "./Process.model.js";
import type { WrapperObservation, WrapperState } from "./YtDlpWrapper.model.js";

const progressRegex = /\[download\][ ]+ *(.*)[ ]+of[~ ]+([^ ]*)(:? *at *([^ ]*))?(:? *ETA *([^ ]*))?/;
export const initialWrapperState = (): WrapperState => ({ stderr: "", processError: undefined });

/** Match the installed wrapper's formatting, retaining the supplied failure until this point. */
export const wrapperError = ({
  code,
  processError,
  stderr,
}: {
  readonly code: number | null;
  readonly processError: unknown;
  readonly stderr: string;
}): Error => {
  let message = `\nError code: ${code}`;
  const hasProcessError: boolean = Boolean(processError);
  if (hasProcessError) message += `\n\nProcess error:\n${processError}`;
  if (stderr !== "") message += `\n\nStderr:\n${stderr}`;
  return new Error(message);
};

const stdoutObservations = (chunk: Uint8Array): ReadonlyArray<WrapperObservation> => {
  const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(chunk);
  return [
    ...A.flatMap(
      A.filter(Str.split(/\r|\n/g)(text), (line: string) => line !== ""),
      (line: string) => {
        if (!Str.startsWith("[")(line)) return [];
        const match = progressRegex.exec(line);
        const event: WrapperObservation = {
          _tag: "ytDlpEvent",
          eventType: Str.replace("]", "")(Str.replace("[", "")(Str.split(" ")(line)[0] ?? "")),
          eventData: Str.substring(
            Option.getOrElse(Str.indexOf(" ")(line), () => -1),
            line.length
          )(line),
        };
        if (match === null) return [event];
        const progress: WrapperObservation = {
          _tag: "progress",
          payload: {
            percent: Number.parseFloat(Str.replace("%", "")(match[1] ?? "")),
            totalSize: Str.replace("~", "")(match[2] ?? ""),
            currentSpeed: match[4],
            eta: match[6],
          },
        };
        return [progress, event];
      }
    ),
    { _tag: "stdout", chunk },
  ];
};

/** One raw event produces ordered observations; callers emit lazily and stop on callback failure. */
export const advanceWrapper = ({
  state,
  event,
}: {
  readonly state: WrapperState;
  readonly event: ProcessEvent;
}): { readonly state: WrapperState; readonly observations: ReadonlyArray<WrapperObservation> } => {
  switch (event._tag) {
    case "stdout":
      return { state, observations: stdoutObservations(event.chunk) };
    case "stderr":
      return {
        state: { ...state, stderr: state.stderr + new TextDecoder("utf-8", { ignoreBOM: true }).decode(event.chunk) },
        observations: [{ _tag: "stderr", chunk: event.chunk }],
      };
    case "rawError":
      return { state: { ...state, processError: event.error }, observations: [] };
    case "complete": {
      const outcome = event.outcome;
      if (outcome._tag === "Raw")
        return {
          state,
          observations:
            outcome.code === 0 || outcome.killed
              ? [{ _tag: "close", code: outcome.code }]
              : [
                  {
                    _tag: "error",
                    error: wrapperError({ code: outcome.code, processError: state.processError, stderr: state.stderr }),
                  },
                ],
        };
      const result = outcome.result;
      return {
        state,
        observations:
          result._tag === "Failure"
            ? [{ _tag: "error", error: result.error }]
            : result.code === 0
              ? [{ _tag: "close", code: 0 }]
              : [
                  {
                    _tag: "error",
                    error: wrapperError({ code: result.code, processError: undefined, stderr: state.stderr }),
                  },
                ],
      };
    }
    default:
      return { state, observations: [] };
  }
};
