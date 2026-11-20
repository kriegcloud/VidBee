import * as HashSet from "effect/HashSet";
import * as O from "effect/Option";
import * as Str from "effect/String";

/**
 * Authoritative yt-dlp probe-flag set. Reference:
 *   docs/vidbee-desktop-first-cli-ytdlp-rss-design.md §4.3
 *
 * If argv contains ANY of these (with no positional dependence), the CLI
 * routes the run through ProcessRegistry as a probe — no task is enqueued
 * and no history row is written. This is the ONLY place where the CLI
 * inspects yt-dlp argv semantically; every other arg is order-preserved
 * passthrough.
 */

const EXACT_FLAGS = HashSet.make(
  "-j",
  "--dump-json",
  "-J",
  "--dump-single-json",
  "-F",
  "--list-formats",
  "--list-formats-as-table",
  "--list-formats-old",
  "-s",
  "--simulate",
  "--skip-download",
  "--list-subs",
  "--list-extractors",
  "--list-extractor-descriptions"
);

const EXACT_GETTERS = HashSet.make(
  "--get-id",
  "--get-title",
  "--get-thumbnail",
  "--get-description",
  "--get-duration",
  "--get-filename",
  "--get-format",
  "--get-url"
);

/**
 * yt-dlp meta commands that have no URL but should still go through the
 * managed-forward path as probe — wrapped with envelope, exit code from
 * yt-dlp.
 */
const META_FLAGS = HashSet.make("--update", "--version");

/**
 * Returns true if the given argv contains a probe-class flag, including:
 *   - all exact aliases listed in §4.3
 *   - any --print (regardless of where / how many times)
 *   - any --get-* getter
 *   - meta commands (--update, --version)
 *
 * Both `--flag value` and `--flag=value` shapes are covered: the leading
 * token (the part up to and including `=` or end-of-token) is what gets
 * matched.
 */
export function isProbeArgv(argv: readonly string[]): boolean {
  return findProbeFlag(argv) !== null;
}

/**
 * Returns the first probe-class flag found in argv, or null if none. Used
 * by tests and diagnostics; the runtime only needs the boolean form.
 */
export function findProbeFlag(argv: readonly string[]): string | null {
  for (const tok of argv) {
    const head = headOf(tok);
    if (HashSet.has(EXACT_FLAGS, head)) return head;
    if (HashSet.has(EXACT_GETTERS, head)) return head;
    if (HashSet.has(META_FLAGS, head)) return head;
    if (head === "--print") return head;
  }
  return null;
}

function headOf(tok: string): string {
  const eq = O.getOrElse(Str.indexOf("=")(tok), () => -1);
  return eq === -1 ? tok : Str.slice(0, eq)(tok);
}

export const PROBE_FLAG_REGISTRY = {
  exact: EXACT_FLAGS,
  getters: EXACT_GETTERS,
  meta: META_FLAGS,
  prefixed: ["--print"] as const,
};
