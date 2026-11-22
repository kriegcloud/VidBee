import { causeReasons, logArguments } from "@vidbee/logger/arguments";
import * as A from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as P from "effect/Predicate";
import * as R from "effect/Record";
import * as References from "effect/References";
import * as S from "effect/Schema";
import { DesktopLogContext, DesktopLogEntry, DesktopLogLevel } from "./DesktopLog.model.js";
import { DesktopLogSink } from "./DesktopLog.service.js";

/** Preserve transport thresholds as the only logging filter.
 * **Example** (Install on an executing runtime)
 * ```ts
 * import { DesktopMinimumLogLevelLive } from "./DesktopLogger.layer.js"
 * const minimum = DesktopMinimumLogLevelLive
 * void minimum
 * ```
 * @category layers
 * @since 0.0.0
 */
export const DesktopMinimumLogLevelLive = Layer.succeed(References.MinimumLogLevel, "All");

const logger = Effect.map(DesktopLogSink, (sink) =>
  Logger.make<unknown, void>((options) => {
    const annotations = Context.get(options.fiber.context, References.CurrentLogAnnotations);
    const spans = Context.get(options.fiber.context, References.CurrentLogSpans);
    const hasContext =
      options.cause.reasons.length > 0 ||
      spans.length > 0 ||
      R.size(R.remove(R.remove(annotations, "electron-log.level"), "electron-log.scope")) > 0;
    const context = hasContext
      ? DesktopLogContext.make({
          reasons: causeReasons(options.cause),
          annotations,
          spans: A.map(spans, ([label, time]) => [label, time]),
        })
      : undefined;
    const original = annotations["electron-log.level"];
    const level = S.is(DesktopLogLevel)(original)
      ? original
      : options.logLevel === "Fatal" || options.logLevel === "Error"
        ? "error"
        : options.logLevel === "Warn"
          ? "warn"
          : options.logLevel === "Debug"
            ? "debug"
            : options.logLevel === "Trace"
              ? "debug"
              : "info";
    const scope = annotations["electron-log.scope"];
    sink.emit(
      DesktopLogEntry.make({
        level,
        scope: P.isString(scope) ? scope : "",
        args: logArguments(options.message, options.cause),
        ...(context === undefined ? {} : { context }),
      })
    );
  })
);

/** One replacing Effect logger; never merge with default console output.
 * **Example** (Supply a process sink)
 * ```ts
 * import { DesktopLoggerLive } from "./DesktopLogger.layer.js"
 * import { DesktopLogSink } from "./DesktopLog.service.js"
 * import * as Layer from "effect/Layer"
 * const live = DesktopLoggerLive.pipe(Layer.provide(Layer.succeed(DesktopLogSink, { emit: () => {} })))
 * void live
 * ```
 * @category layers
 * @since 0.0.0
 */
export const DesktopLoggerLive = Layer.mergeAll(Logger.layer([logger]), DesktopMinimumLogLevelLive);

/** Keep electron-log's level and scope while entering Effect logging.
 * **Example** (Log a verbose argument vector)
 * ```ts
 * import { desktopLog } from "./DesktopLogger.layer.js"
 * import { DesktopLogEntry } from "./DesktopLog.model.js"
 * const log = desktopLog(DesktopLogEntry.make({ level: "verbose", scope: "engine", args: ["started", 2] }))
 * void log
 * ```
 * @category logging
 * @since 0.0.0
 */
export const desktopLog = Effect.fn("DesktopLogger.log")((entry: DesktopLogEntry) =>
  Effect.logWithLevel(
    entry.level === "error"
      ? "Error"
      : entry.level === "warn"
        ? "Warn"
        : entry.level === "info"
          ? "Info"
          : entry.level === "silly"
            ? "Trace"
            : "Debug"
  )(...entry.args).pipe(Effect.annotateLogs({ "electron-log.level": entry.level, "electron-log.scope": entry.scope }))
);
