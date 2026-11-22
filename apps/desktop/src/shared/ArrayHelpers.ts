/** Sparse-preserving map used where legacy arrays retain holes.
 * @category mapping
 * @since 0.0.0
 * @example map
 */
export const map = <A, B>(input: {
  items: readonly A[]
  map: (value: A, index: number) => B
}): B[] => {
  const result: B[] = []
  result.length = input.items.length
  for (const [index, value] of input.items.entries()) {
    if (index in input.items) {
      result[index] = input.map(value, index)
    }
  }
  return result
}
/** Stable filtering with the native sparse-array visitation contract.
 * @category filtering
 * @since 0.0.0
 * @example filter
 */
export const filter = <A>(input: {
  items: readonly A[]
  predicate: (value: A, index: number) => boolean
}): A[] => {
  const result: A[] = []
  for (const [index, value] of input.items.entries()) {
    if (index in input.items && input.predicate(value, index)) {
      result.push(value)
    }
  }
  return result
}
/** Flatten mapped rows without visiting holes at either level.
 * @category mapping
 * @since 0.0.0
 * @example flatMap
 */
export const flatMap = <A, B>(input: {
  items: readonly A[]
  map: (value: A, index: number) => readonly B[]
}): B[] => {
  const result: B[] = []
  for (const [index, value] of input.items.entries()) {
    if (index in input.items) {
      const rows = input.map(value, index)
      for (const [child, item] of rows.entries()) {
        if (child in rows) {
          result.push(item)
        }
      }
    }
  }
  return result
}
/** Native negative and fractional array indexing.
 * @category getters
 * @since 0.0.0
 * @example at
 */
export const at = <A>(input: { items: readonly A[]; index: number }): A | undefined => {
  const index = Math.trunc(input.index)
  return input.items[index < 0 ? input.items.length + index : index]
}

/** Test existing array entries in order, preserving the legacy sparse-array contract.
 * @example some({items:[1,2],predicate:value=>value===2})
 * @category filtering
 * @since 0.0.0
 */
export const some = <A>(input: {
  items: readonly A[]
  predicate: (value: A, index: number) => boolean
}): boolean => {
  for (const [index, value] of input.items.entries()) {
    if (index in input.items && input.predicate(value, index)) {
      return true
    }
  }
  return false
}
