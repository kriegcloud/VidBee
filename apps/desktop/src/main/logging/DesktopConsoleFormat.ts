import * as A from "effect/Array";
import * as P from "effect/Predicate";
import * as Str from "effect/String";

/** Native console formatting with the already captured local date supplied by its host.
 * Preserves argument identity, first-string joining, scope trim/padding and empty output.
 * **Example** (Render a prefix)
 * ```ts
 * import { desktopConsoleFormat } from "./DesktopConsoleFormat.js"
 * const format = (date: Date) => desktopConsoleFormat({ data: ["ready"], date, scope: "main" })
 * void format
 * ```
 * @category formatting
 * @since 0.0.0
 */
export const desktopConsoleFormat = (input: {
  readonly data: ReadonlyArray<unknown>;
  readonly date: Date;
  readonly scope: string;
}): Array<unknown> => {
  const pad = (value: number) => Str.padStart(2, "0")(value.toString(10));
  const date = input.date;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  const scope = Str.padEnd(10)(Str.trim(input.scope));
  const prefix = `${time} ${scope}`;
  return A.match(input.data, {
    onEmpty: () => [Str.trimEnd(prefix)],
    onNonEmpty: ([first, ...rest]) => (P.isString(first) ? [`${prefix} ${first}`, ...rest] : [prefix, ...input.data]),
  });
};
