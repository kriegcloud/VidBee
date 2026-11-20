import { DownloadFiles } from "@vidbee/downloader-core/DownloadFiles.service";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as HttpClientError from "effect/http/HttpClientError";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as P from "effect/Predicate";
import * as S from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";
import * as Str from "effect/String";
import { CliDescriptor } from "../CliDescriptor.service.js";
import { CliHost } from "../CliHost.service.js";
import { CliPidLiveness } from "../CliPidLiveness.service.js";
import { errorEnvelope } from "../envelope/index.js";
import type { DescriptorPayload, ReadDescriptorResult, ResolveDescriptorOptions } from "../Descriptor.model.js";

export * from "../Descriptor.model.js";

export const resolveDescriptorPath = Effect.fn("resolveDescriptorPath")(function* (
  options: ResolveDescriptorOptions = {}
) {
  if (P.isTruthy(options.pathOverride) && options.pathOverride !== undefined) return options.pathOverride;
  const host = yield* CliHost;
  const path = yield* Path.Path;
  const envOverride =
    options.envOverride !== undefined
      ? options.envOverride
      : Str.trim((yield* host.environment("VIDBEE_AUTOMATION_DESCRIPTOR")) ?? "");
  if (P.isTruthy(envOverride) && envOverride !== null && envOverride !== undefined) return envOverride;
  const platform = options.platform ?? host.platform;
  const home = options.homeDirectory ?? host.homeDirectory;
  if (platform === "darwin") return path.join(home, "Library", "Application Support", "VidBee", "automation.json");
  const variable = platform === "win32" ? "APPDATA" : "XDG_CONFIG_HOME";
  const configured = Str.trim((yield* host.environment(variable)) ?? "");
  const base =
    configured.length > 0
      ? configured
      : platform === "win32"
        ? path.join(home, "AppData", "Roaming")
        : path.join(home, ".config");
  return path.join(base, "VidBee", "automation.json");
});

const object = S.Record(S.String, S.Unknown);
const finite = S.is(S.Finite);
const syntax = S.decodeEffect(S.fromJsonString(S.Unknown));
const issue = SchemaIssue.makeFormatterDefault();
export const readDescriptor = Effect.fn("readDescriptor")(function* (options: ResolveDescriptorOptions = {}) {
  const path = yield* resolveDescriptorPath(options);
  const files = yield* DownloadFiles;
  const failure = (message: string): ReadDescriptorResult => ({
    ok: false,
    path,
    envelope: errorEnvelope("DESKTOP_NOT_READY", message, { path }),
  });
  if (!(yield* files.exists(path))) return failure(`automation descriptor not found at ${path}`);
  const read = yield* files.read(path).pipe(Effect.result);
  if (read._tag === "Failure") {
    const cause = read.failure.cause;
    // PlatformError retains the original Node exception under its reason.
    const message = originalMessage(cause);
    return failure(`automation descriptor is malformed: ${message}`);
  }
  const decoded = yield* syntax(read.success).pipe(Effect.result);
  if (decoded._tag === "Failure") return failure(`automation descriptor is malformed: ${issue(decoded.failure.issue)}`);
  const value = decoded.success;
  if (A.isArray(value)) return failure("unsupported descriptor version: undefined");
  if (!S.is(object)(value)) return failure("descriptor is not a JSON object");
  if (value.version !== 1) return failure(`unsupported descriptor version: ${String(value.version)}`);
  if (typeof value.host !== "string" || !finite(value.port)) return failure("descriptor missing host/port");
  if (!finite(value.pid) || !finite(value.pidStartedAt)) return failure("descriptor missing pid/pidStartedAt");
  const descriptor: DescriptorPayload = {
    version: 1,
    schemaVersion: typeof value.schemaVersion === "string" ? value.schemaVersion : "1.0.0",
    kind: "desktop",
    host: value.host,
    port: value.port,
    tokenHash: typeof value.tokenHash === "string" ? value.tokenHash : null,
    tokenIssuedAt: finite(value.tokenIssuedAt) ? value.tokenIssuedAt : null,
    tokenExpiresAt: finite(value.tokenExpiresAt) ? value.tokenExpiresAt : null,
    pid: value.pid,
    pidStartedAt: value.pidStartedAt,
    updatedAt: finite(value.updatedAt) ? value.updatedAt : 0,
    appVersion: typeof value.appVersion === "string" ? value.appVersion : "0.0.0",
  };
  return { ok: true, descriptor, path } satisfies ReadDescriptorResult;
});

export function originalMessage(cause: unknown): string {
  if (PlatformError.isPlatformError(cause) || HttpClientError.isHttpClientError(cause)) {
    const reason = cause.reason;
    if ("cause" in reason && reason.cause !== undefined) return originalMessage(reason.cause);
  }
  return cause instanceof Error ? cause.message : String(cause);
}
export const isPidAlive = Effect.fn("isPidAlive")(function* (pid: number) {
  return yield* (yield* CliPidLiveness).isAlive(pid);
});
export const descriptorPath = Effect.fn("descriptorPath")(function* (options?: ResolveDescriptorOptions) {
  return yield* (yield* CliDescriptor).path(options);
});
