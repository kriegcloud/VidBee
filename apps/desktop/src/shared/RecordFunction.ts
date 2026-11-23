/** Give a record-input pure function a zero-argument pipeable form.
 *
 * Effect's fixed-arity dual helper starts at arity two. The explicit overloads
 * here keep the record API unary and return the same body for pipe composition.
 *
 * **Example** (Pipe a record)
 *
 * ```ts
 * import { recordFunction } from './RecordFunction.js'
 * const size = recordFunction((input: {text: string}) => input.text.length)
 * size()({text: 'abc'}) // => 3
 * ```
 *
 * @category combinators
 * @since 0.0.0
 */
export const recordFunction = <A extends object, B>(
  body: (input: A) => B
): {
  (): (input: A) => B;
  (input: A): B;
} => {
  function apply(): (input: A) => B;
  function apply(input: A): B;
  function apply(input?: A): B | ((input: A) => B) {
    return input === undefined ? body : body(input);
  }
  return apply;
};
