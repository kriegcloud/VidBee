import * as A from 'effect/Array'
import * as R from 'effect/Record'
import * as S from 'effect/Schema'

/** Reject unknown keys before decoding fields, retaining the public field model.
 *
 * **Example** (Access the strictObject contract)
 *
 * ```ts
 * import { strictObject } from './StrictObject.js'
 * void strictObject
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const strictObject = <Fields extends S.Struct.Fields>(schema: S.Struct<Fields>) =>
  S.Record(S.String, S.Unknown)
    .check(S.makeFilter((input) => A.every(R.keys(input), (key) => R.has(schema.fields, key))))
    .pipe(S.decodeTo(schema))
