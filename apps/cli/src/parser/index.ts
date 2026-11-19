import * as A from "effect/Array";
import * as O from "effect/Option";
import * as Str from "effect/String";

/**
 * The CLI's only argv splitter. Reference:
 *   docs/vidbee-desktop-first-cli-ytdlp-rss-design.md §4.1, §4.2, §4.5
 *
 * Rules:
 *   - Tokens matching a known `--vidbee-*` flag are consumed (along with
 *     their value when `kind === 'value'`).
 *   - Tokens that look like `--vidbee-*` / `--vidbee:*` but are NOT in the
 *     reserved table cause an error with exit code 2 — never silently
 *     passed through to yt-dlp.
 *   - The first positional token starting with `:` selects a VidBeep
 *     subcommand; subsequent positional tokens after a subcommand are the
 *     subcommand's own args (NOT yt-dlp args).
 *   - Everything else is order-preserved and handed to yt-dlp.
 *   - `--` is honored: every token after `--` is yt-dlp passthrough,
 *     including ones that would otherwise look like VidBeep flags.
 */

import * as S from "effect/Schema";
import { ParseError } from "../Cli.errors.js";
import { Priority, Target } from "../Parser.model.js";
import { findProbeFlag } from "./probe-flags.js";
import { findReservedFlag, isVidbeePrefixed } from "./reserved-flags.js";
import type { ParsedArgv, VidbeeFlags } from "../Parser.model.js";
import type { ReservedFlag } from "./reserved-flags.js";

export { ParseError } from "../Cli.errors.js";
export { ParsedArgv, VidbeeFlags } from "../Parser.model.js";

export function parseArgv(argv: readonly string[]): ParsedArgv {
  const flags = defaultFlags();
  const yt: string[] = [];
  let subcommand: string | null = null;
  let passthroughOnly = false;

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === undefined) continue;

    if (passthroughOnly) {
      yt.push(tok);
      continue;
    }

    if (tok === "--") {
      passthroughOnly = true;
      yt.push(tok);
      continue;
    }

    // Subcommand: a `:` positional collects all remaining argv as its args.
    // We do not try to mix subcommand args with yt-dlp args.
    if (subcommand === null && Str.startsWith(":")(tok) && tok.length > 1) {
      subcommand = Str.slice(1)(tok);
      const subArgs = A.filter(A.drop(argv, i + 1), (s): s is string => typeof s === "string");
      // We still need to honor --vidbee-* in the subcommand tail (e.g.
      // `vidbee --vidbee-pretty :download list`); those have already been
      // consumed by earlier iterations. Anything inside subArgs is owned by
      // the subcommand handler — no further parsing here.
      return { kind: "subcommand", flags, subcommand, subArgs };
    }

    // VidBee-prefixed flags: must match the reserved table or we fail loud.
    if (isVidbeePrefixed(tok)) {
      const eq = O.getOrElse(Str.indexOf("=")(tok), () => -1);
      const name = eq === -1 ? tok : Str.slice(0, eq)(tok);
      const inlineValue = eq === -1 ? null : Str.slice(eq + 1)(tok);
      const def = findReservedFlag(name);
      if (def === undefined) {
        throw ParseError.make({ code: "UNKNOWN_VIDBEE_FLAG", message: `unknown VidBeep flag: ${name}`, exitCode: 2 });
      }
      const consumed = consumeReserved(flags, def, argv, i, inlineValue);
      i += consumed;
      continue;
    }

    // Anything else is yt-dlp territory.
    yt.push(tok);
  }

  if (subcommand !== null) {
    return { kind: "subcommand", flags, subcommand, subArgs: [] };
  }

  // §4.5: -o - in non-probe modes is rejected up front. We don't pretend to
  // understand more of -o than that single edge case.
  const probeFlag = findProbeFlag(yt);
  const mode: "probe" | "download" = probeFlag === null ? "download" : "probe";
  if (mode === "download" && hasStdoutOutput(yt)) {
    throw ParseError.make({
      code: "STDOUT_OUTPUT_DISALLOWED",
      message: "-o - is only allowed in probe mode",
      exitCode: 2,
    });
  }

  return { kind: "ytdlp", flags, mode, ytArgs: yt, probeFlag };
}

function defaultFlags(): VidbeeFlags {
  return {
    local: false,
    json: true,
    pretty: false,
    wait: false,
    detach: false,
    noRetry: false,
    noAutostart: false,
  };
}

function consumeReserved(
  flags: VidbeeFlags,
  def: ReservedFlag,
  argv: readonly string[],
  i: number,
  inlineValue: string | null
): number {
  if (def.kind === "switch") {
    if (inlineValue !== null) {
      throw ParseError.make({ code: "UNEXPECTED_VALUE", message: `${def.name} does not take a value`, exitCode: 2 });
    }
    applySwitch(flags, def.name);
    return 0;
  }
  // value flag
  let value: string;
  let consumed = 0;
  if (inlineValue !== null) {
    value = inlineValue;
  } else {
    const next = argv[i + 1];
    if (next === undefined) {
      throw ParseError.make({ code: "MISSING_VALUE", message: `${def.name} requires a value`, exitCode: 2 });
    }
    value = next;
    consumed = 1;
  }
  applyValue(flags, def.name, value);
  return consumed;
}

function applySwitch(flags: VidbeeFlags, name: string): void {
  switch (name) {
    case "--vidbee-local":
      flags.local = true;
      break;
    case "--vidbee-json":
      flags.json = true;
      break;
    case "--vidbee-pretty":
      flags.pretty = true;
      break;
    case "--vidbee-wait":
      flags.wait = true;
      break;
    case "--vidbee-detach":
      flags.detach = true;
      break;
    case "--vidbee-no-retry":
      flags.noRetry = true;
      flags.maxAttempts = 0;
      break;
    case "--vidbee-no-autostart":
      flags.noAutostart = true;
      break;
    default:
      throw ParseError.make({ code: "UNKNOWN_VIDBEE_FLAG", message: `unknown VidBeep switch: ${name}`, exitCode: 2 });
  }
}

function applyValue(flags: VidbeeFlags, name: string, value: string): void {
  switch (name) {
    case "--vidbee-api":
      flags.api = value;
      break;
    case "--vidbee-target":
      if (!S.is(Target)(value)) {
        throw ParseError.make({
          code: "INVALID_TARGET",
          message: `--vidbee-target must be one of desktop|api|local; got ${value}`,
          exitCode: 2,
        });
      }
      flags.target = value;
      break;
    case "--vidbee-priority":
      if (!S.is(Priority)(value)) {
        throw ParseError.make({
          code: "INVALID_PRIORITY",
          message: `--vidbee-priority must be user|subscription|background; got ${value}`,
          exitCode: 2,
        });
      }
      flags.priority = value;
      break;
    case "--vidbee-max-attempts": {
      const n = Number.parseInt(value, 10);
      if (!Number.isFinite(n) || n < 0 || `${n}` !== value) {
        throw ParseError.make({
          code: "INVALID_MAX_ATTEMPTS",
          message: `--vidbee-max-attempts must be a non-negative integer; got ${value}`,
          exitCode: 2,
        });
      }
      flags.maxAttempts = n;
      if (n === 0) flags.noRetry = true;
      break;
    }
    case "--vidbee-group-key":
      flags.groupKey = value;
      break;
    case "--vidbee-timeout": {
      const n = Number.parseInt(value, 10);
      if (!Number.isFinite(n) || n <= 0) {
        throw ParseError.make({
          code: "INVALID_TIMEOUT",
          message: `--vidbee-timeout must be a positive integer (ms); got ${value}`,
          exitCode: 2,
        });
      }
      flags.timeoutMs = n;
      break;
    }
    case "--vidbee-token":
      flags.token = value;
      break;
    default:
      throw ParseError.make({
        code: "UNKNOWN_VIDBEE_FLAG",
        message: `unknown VidBeep value flag: ${name}`,
        exitCode: 2,
      });
  }
}

/**
 * §4.5: writing yt-dlp output to stdout (`-o -`) is only legal in probe
 * mode. We detect it by `-o`-followed-by-`-` or `-o-`/`--output -`.
 */
function hasStdoutOutput(argv: readonly string[]): boolean {
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === "-o" || tok === "--output") {
      if (argv[i + 1] === "-") return true;
    } else if (tok === "-o-" || tok === "--output=-" || tok === "-o=-") {
      return true;
    }
  }
  return false;
}

export { ListInput, ListStatus, Priority, Target } from "../Parser.model.js";
export { parseListArgs } from "./list.js";
export type { VidbeeFlags as Flags };
