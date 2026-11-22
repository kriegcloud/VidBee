import * as O from "effect/Option";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { ListParseError } from "../Cli.errors.js";
import { ListStatus } from "../Parser.model.js";
import type { ListInput } from "../Parser.model.js";

export { ListInput } from "../Parser.model.js";
export function parseListArgs(args: readonly string[]): ListInput {
  const input: ListInput = {};
  for (let i = 0; i < args.length; i++) {
    const tok = args[i];
    if (tok === undefined) continue;
    const eq = O.getOrElse(Str.indexOf("=")(tok), () => -1);
    const name = eq === -1 ? tok : Str.slice(0, eq)(tok);
    const inline = eq === -1 ? null : Str.slice(eq + 1)(tok);
    const consume = (): string => {
      if (inline !== null) return inline;
      const next = args[i + 1];
      if (next === undefined) {
        throw ListParseError.make({ message: `${name} requires a value`, code: "MISSING_VALUE" });
      }
      i += 1;
      return next;
    };
    switch (name) {
      case "--status": {
        const v = consume();
        if (!S.is(ListStatus)(v)) {
          throw ListParseError.make({ message: `unknown status: ${v}`, code: "INVALID_STATUS" });
        }
        input.status = v;
        break;
      }
      case "--group":
      case "--group-key":
        input.groupKey = consume();
        break;
      case "--parent":
        input.parentId = consume();
        break;
      case "--limit": {
        const v = consume();
        const n = Number.parseInt(v, 10);
        if (!Number.isFinite(n) || n <= 0) {
          throw ListParseError.make({ message: `invalid limit: ${v}`, code: "INVALID_LIMIT" });
        }
        input.limit = n;
        break;
      }
      case "--cursor":
        input.cursor = consume();
        break;
      default:
        throw ListParseError.make({ message: `unknown flag: ${name}`, code: "UNKNOWN_FLAG" });
    }
  }
  return input;
}
