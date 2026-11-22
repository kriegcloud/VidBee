import * as A from 'effect/Array'
import * as R from 'effect/Record'
import * as S from 'effect/Schema'

/** Reject unknown keys before decoding fields, retaining the public field model.
 * @example strictObject(S.Struct({ id: S.String }))
 * @category schemas
 * @since 0.0.0
 */
export const strictObject = <Fields extends S.Struct.Fields>(schema: S.Struct<Fields>) =>
  S.Record(S.String, S.Unknown)
    .check(S.makeFilter((input) => A.every(R.keys(input), (key) => R.has(schema.fields, key))))
    .pipe(S.decodeTo(schema))
