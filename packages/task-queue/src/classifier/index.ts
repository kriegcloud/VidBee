import * as A from "effect/Array";
import * as DateTime from "effect/DateTime";
import { dual } from "effect/Function";
import * as Option from "effect/Option";
import * as Str from "effect/String";
import { ClassifierRuleMissing } from "../Classifier.model.js";
import type { ClassifyInput, ClassifierRule as Rule } from "../Classifier.model.js";
/**
 * ErrorClassifier — single normative table mapping yt-dlp/ffmpeg stderr to a
 * ClassifiedError. Every host adapter MUST use this; no host-local matching.
 *
 * Rules are evaluated **in order**; the first regex that matches wins. If
 * nothing matches, the result is `unknown` with conservative retryability.
 *
 * Reference: docs/vidbee-task-queue-state-machine-design.md §7.1.
 */
import type { ClassifiedError, ErrorCategory } from "../types.js";

export type { ClassifyInput } from "../Classifier.model.js";

/**
 * Order matters — DO NOT REORDER without updating the design doc.
 *
 * Rule 10 (`stalled`) and rule 11 (`cancelled-by-user`) are virtual: they have
 * no stderr regex and are produced by the Watchdog and the cancel path
 * respectively. They live here so callers can reach the same metadata
 * (maxAttempts, hints, message key) by category.
 */
export const CLASSIFIER_RULES: readonly Rule[] = [
  {
    category: "http-429",
    regex: /HTTP Error 429|Too Many Requests/i,
    exitCodeHint: null,
    defaultMaxAttempts: 3,
    defaultBackoffMs: 30_000,
    uiActionHints: ["retry-later"],
    uiMessageKey: "task.error.http429",
  },
  {
    category: "auth-required",
    regex:
      /Sign in to confirm|Login required|Private (?:video|profile)|members-only|cookies are no longer valid|redirect to (?:login|challenge) page|authentication required/i,
    exitCodeHint: null,
    defaultMaxAttempts: 0,
    defaultBackoffMs: null,
    uiActionHints: ["import-cookies"],
    uiMessageKey: "task.error.authRequired",
  },
  {
    category: "geo-blocked",
    regex: /not available in your country|geo-restricted|geo restricted|content isn't available in your country/i,
    exitCodeHint: null,
    defaultMaxAttempts: 0,
    defaultBackoffMs: null,
    uiActionHints: ["set-proxy"],
    uiMessageKey: "task.error.geoBlocked",
  },
  {
    category: "not-found",
    regex:
      /HTTP Error 404|Video unavailable|This video has been removed|Requested format is not available|NotFoundError|profile not found/i,
    exitCodeHint: null,
    defaultMaxAttempts: 0,
    defaultBackoffMs: null,
    uiActionHints: ["remove-task"],
    uiMessageKey: "task.error.notFound",
  },
  {
    category: "disk-full",
    regex: /ENOSPC|No space left on device/i,
    exitCodeHint: null,
    defaultMaxAttempts: 0,
    defaultBackoffMs: null,
    uiActionHints: ["open-folder", "free-disk"],
    uiMessageKey: "task.error.diskFull",
  },
  {
    category: "permission-denied",
    regex: /EACCES|EPERM|Permission denied/i,
    exitCodeHint: null,
    defaultMaxAttempts: 0,
    defaultBackoffMs: null,
    uiActionHints: ["choose-folder"],
    uiMessageKey: "task.error.permissionDenied",
  },
  {
    category: "binary-missing",
    regex: /yt-dlp.*not found|gallery-dl.*not found|ffmpeg.*not found|ffprobe.*not found/i,
    exitCodeHint: 127,
    defaultMaxAttempts: 0,
    defaultBackoffMs: null,
    uiActionHints: ["report-bug"],
    uiMessageKey: "task.error.binaryMissing",
  },
  {
    category: "ffmpeg",
    regex: /ffmpeg|Postprocessing|Conversion failed/i,
    exitCodeHint: null,
    defaultMaxAttempts: 1,
    defaultBackoffMs: 5000,
    uiActionHints: ["report-bug"],
    uiMessageKey: "task.error.ffmpeg",
  },
  {
    category: "network-transient",
    regex:
      /socket hang up|ECONNRESET|ECONNREFUSED|getaddrinfo ENOTFOUND|Connection timed out|HTTP Error 5\d\d|Read timed out/i,
    exitCodeHint: null,
    defaultMaxAttempts: 5,
    defaultBackoffMs: null,
    uiActionHints: ["retry"],
    uiMessageKey: "task.error.networkTransient",
  },
  // Virtual rules — produced by Watchdog/cancel; never matched against stderr.
  {
    category: "stalled",
    regex: null,
    exitCodeHint: null,
    defaultMaxAttempts: 3,
    defaultBackoffMs: 5000,
    uiActionHints: ["retry"],
    uiMessageKey: "task.error.stalled",
  },
  {
    category: "cancelled-by-user",
    regex: null,
    exitCodeHint: null,
    defaultMaxAttempts: 0,
    defaultBackoffMs: null,
    uiActionHints: [],
    uiMessageKey: "task.error.cancelledByUser",
  },
  {
    // Virtual: produced by `processing → completed` guard when the output
    // file is missing or zero-byte. Non-retryable by default.
    category: "output-missing",
    regex: null,
    exitCodeHint: null,
    defaultMaxAttempts: 0,
    defaultBackoffMs: null,
    uiActionHints: ["report-bug"],
    uiMessageKey: "task.error.outputMissing",
  },
  {
    category: "unknown",
    regex: null,
    exitCodeHint: null,
    defaultMaxAttempts: 1,
    defaultBackoffMs: null,
    uiActionHints: ["retry", "report-bug"],
    uiMessageKey: "task.error.unknown",
  },
];

export function getRuleForCategory(c: ErrorCategory): Rule {
  // The category model and exhaustive normative table have the same members.
  const found = A.findFirst(CLASSIFIER_RULES, (rule) => rule.category === c);
  if (Option.isNone(found)) throw ClassifierRuleMissing.make({ category: c });
  return found.value;
}

const STDERR_TAIL_BYTES = 8 * 1024;
const SECRET_PATTERNS: readonly RegExp[] = [
  // Authorization / cookie / api key headers
  /(authorization|cookie|x-api-key|x-auth-token):\s*([^\r\n]+)/gi,
  // Inline cookies/tokens that yt-dlp may print as flags
  /(--cookies(?:-from-browser)?)\s+("[^"]*"|'[^']*'|\S+)/gi,
  /(token|secret|password)=([^\s&]+)/gi,
];

/**
 * Sanitize stderr/stdout tails before persisting. Header values, tokens, and
 * inline cookie params are redacted. The redaction is intentionally aggressive
 * because attempts.stderr_tail is read by support engineers.
 */
export function sanitizeOutput(s: string): string {
  let out = s;
  for (const re of SECRET_PATTERNS) {
    let redacted = "";
    let end = 0;
    re.lastIndex = 0;
    for (let match = re.exec(out); match !== null; match = re.exec(out)) {
      redacted +=
        Str.slice(end, match.index)(out) + (typeof match[1] === "string" ? `${match[1]}: <redacted>` : "<redacted>");
      end = match.index + match[0].length;
    }
    out = redacted + Str.slice(end)(out);
  }
  return out;
}

export const takeStderrTail: { (s: string, bytes?: number): string; (bytes?: number): (s: string) => string } = dual(
  (args) => typeof args[0] === "string",
  (s: string, bytes = STDERR_TAIL_BYTES): string => {
    if (new TextEncoder().encode(s).length <= bytes) {
      return s;
    }
    // We work in characters here; close enough for tail-of-log purposes and
    // never longer than `bytes` bytes after the slice.
    while (new TextEncoder().encode(s).length > bytes) {
      s = Str.slice(Math.floor(s.length * 0.1))(s);
    }
    return s;
  }
);

/**
 * Parse the value of an HTTP `Retry-After` header, in milliseconds.
 * Accepts both delta-seconds and HTTP-date forms. Returns null on parse
 * failure or if the header is absent.
 */
export const parseRetryAfter: {
  (header: string | null | undefined, now: number): number | null;
  (now: number): (header: string | null | undefined) => number | null;
} = dual(2, (header: string | null | undefined, now: number): number | null => {
  if (header == null || header === "") {
    return null;
  }
  const trimmed = Str.trim(header);
  if (trimmed === "") {
    return null;
  }
  if (/^\d+$/.test(trimmed)) {
    const secs = Number.parseInt(trimmed, 10);
    if (Number.isFinite(secs) && secs >= 0) {
      return secs * 1000;
    }
    return null;
  }
  const parsed = DateTime.make(trimmed);
  if (Option.isNone(parsed)) {
    return null;
  }
  const delta = DateTime.toEpochMillis(parsed.value) - now;
  return delta > 0 ? delta : 0;
});

const RETRY_AFTER_REGEX = /Retry-After:\s*([^\r\n]+)/i;

export const classify: {
  (input: ClassifyInput, now: number): ClassifiedError;
  (now: number): (input: ClassifyInput) => ClassifiedError;
} = dual(2, (input: ClassifyInput, now: number): ClassifiedError => {
  const tail = takeStderrTail(input.stderr ?? "");
  const sanitizedTail = sanitizeOutput(tail);

  for (const rule of CLASSIFIER_RULES) {
    if (rule.regex === null) {
      continue;
    }
    if (rule.regex.test(tail) || (rule.exitCodeHint != null && input.exitCode === rule.exitCodeHint)) {
      return buildError(rule, sanitizedTail, input, now);
    }
  }
  // Fallback: unknown.
  const unknown = getRuleForCategory("unknown");
  return buildError(unknown, sanitizedTail, input, now);
});

/**
 * Construct a virtual ClassifiedError (used by Watchdog `stalled` and cancel
 * `cancelled-by-user`). No stderr regex is consulted; the rule's defaults are
 * used directly.
 */
export const virtualError: {
  (category: ErrorCategory, rawMessage: string): ClassifiedError;
  (rawMessage: string): (category: ErrorCategory) => ClassifiedError;
} = dual(2, (category: ErrorCategory, rawMessage: string): ClassifiedError => {
  const rule = getRuleForCategory(category);
  return {
    category,
    exitCode: null,
    rawMessage,
    uiMessageKey: rule.uiMessageKey,
    uiActionHints: rule.uiActionHints,
    retryable: rule.defaultMaxAttempts > 0,
    suggestedRetryAfterMs: rule.defaultBackoffMs,
  };
});

function buildError(rule: Rule, sanitizedTail: string, input: ClassifyInput, now: number): ClassifiedError {
  let suggestedRetryAfterMs = rule.defaultBackoffMs;
  if (rule.category === "http-429") {
    const fromInput = parseRetryAfter(input.retryAfterHeader ?? null, now);
    if (fromInput == null) {
      const m = RETRY_AFTER_REGEX.exec(sanitizedTail);
      if (m !== null && m[1] !== undefined && m[1] !== "") {
        const fromTail = parseRetryAfter(m[1], now);
        if (fromTail != null) {
          suggestedRetryAfterMs = fromTail;
        }
      }
    } else {
      suggestedRetryAfterMs = fromInput;
    }
  }
  return {
    category: rule.category,
    exitCode: input.exitCode ?? null,
    rawMessage: sanitizedTail,
    uiMessageKey: rule.uiMessageKey,
    uiActionHints: rule.uiActionHints,
    retryable: rule.defaultMaxAttempts > 0,
    suggestedRetryAfterMs,
  };
}

/**
 * Resolve the maxAttempts to use for a category. Adapters can override per
 * task by supplying an explicit value; otherwise the table default is used.
 */
export function defaultMaxAttempts(c: ErrorCategory): number {
  return getRuleForCategory(c).defaultMaxAttempts;
}
