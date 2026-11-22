import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as HashSet from "effect/HashSet";
import * as O from "effect/Option";
import * as Str from "effect/String";
import { CliOptions, Command } from "./Cli.model.js";
import { InvalidInput } from "./Standards.errors.js";
/** Decode supported arguments. Paths never confer policy authority.
 * @category utilities
 * @since 0.0.0
 */
export const parseArguments = Effect.fn("Cli.parseArguments")(function* (args: ReadonlyArray<string>) {
  const command = args[0];
  if (!Command.is.check(command) && !Command.is.docs(command) && !Command.is.baseline(command))
    return yield* InvalidInput.make({ message: "Expected check, docs, or baseline command." });
  let packages: ReadonlyArray<string> = [];
  let filesFrom: O.Option<string> = O.none();
  let sourceRoot: O.Option<string> = O.none();
  let trustedRoot: O.Option<string> = O.none();
  let verifyFrom: O.Option<string> = O.none();
  let phase: O.Option<10> = O.none();
  let requireClean = false;
  let json = false;
  let seen = HashSet.empty<string>();
  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === undefined) return yield* InvalidInput.make({ message: "Missing argument." });
    if (flag !== "--package" && HashSet.has(seen, flag))
      return yield* InvalidInput.make({ message: `Repeated argument: ${flag}` });
    seen = HashSet.add(seen, flag);
    if (flag === "--json") {
      json = true;
      continue;
    }
    if (flag === "--require-clean") {
      requireClean = true;
      continue;
    }
    if (!A.contains(["--package", "--files-from", "--source-root", "--trusted-root", "--verify-from", "--phase"], flag))
      return yield* InvalidInput.make({ message: `Unknown argument: ${flag}` });
    index += 1;
    const value = args[index];
    if (value === undefined || value === "" || Str.startsWith("--")(value))
      return yield* InvalidInput.make({ message: `Missing value: ${flag}` });
    if (flag === "--package") packages = A.append(packages, value);
    if (flag === "--files-from") filesFrom = O.some(value);
    if (flag === "--source-root") sourceRoot = O.some(value);
    if (flag === "--trusted-root") trustedRoot = O.some(value);
    if (flag === "--verify-from") verifyFrom = O.some(value);
    if (flag === "--phase") {
      if (value !== "10") return yield* InvalidInput.make({ message: "Only phase 10 is defined." });
      phase = O.some(10);
    }
  }
  if (O.isSome(phase) && (packages.length > 0 || O.isSome(filesFrom) || command !== "check"))
    return yield* InvalidInput.make({ message: "Phase 10 requires full check scope." });
  if (O.isSome(verifyFrom) && command !== "baseline")
    return yield* InvalidInput.make({ message: "verify-from belongs to baseline." });
  return CliOptions.make({
    command,
    packages,
    filesFrom,
    sourceRoot,
    trustedRoot,
    verifyFrom,
    phase,
    requireClean,
    json,
  });
});
