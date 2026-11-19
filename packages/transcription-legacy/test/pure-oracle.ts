// This harness deliberately runs in pinned Node, outside the strict package.
// Fixtures encode undefined, non-finite values, typed arrays, insertion order,
// mutation and reference identity without relying on machine-specific paths.
import assert from 'node:assert/strict'

export const atoms: unknown[] = [undefined, null, false, true, 0, 7, NaN, '', 'fixture']
export function pack(value: unknown, seen = new Map<object, number>()): unknown {
  if (value === undefined) return { $atom: 'undefined' }
  if (typeof value === 'number' && !Number.isFinite(value)) return { $atom: String(value) }
  if (Object.is(value, -0)) return { $atom: '-0' }
  if (typeof value === 'function') { const source = Function.prototype.toString.call(value); return { $fn: source.includes('punctuation fixture') ? 'throw' : source.includes('changed') ? 'rewrite' : source.includes('。') ? 'append-period' : 'fixture' } }
  if (value === null || typeof value !== 'object') return value
  const previous = seen.get(value)
  if (previous !== undefined) return { $ref: previous }
  const id = seen.size
  seen.set(value, id)
  if (value instanceof Error) return { $id: id, $error: { kind: value.constructor.name, message: value.message, fields: Object.fromEntries(Object.entries(value).map(([key,item]) => [key,pack(item,seen)])) } }
  if (value instanceof Uint8Array) return { $id: id, $uint8: Array.from(value) }
  if (value instanceof Float32Array) return { $id: id, $float32: Array.from(value, item => pack(item, seen)) }
  if (value instanceof Map) return { $id: id, $map: Array.from(value, ([key, item]) => [pack(key, seen), pack(item, seen)]) }
  if (value instanceof Set) return { $id: id, $set: Array.from(value, item => pack(item, seen)) }
  if (Array.isArray(value)) return { $id: id, $array: value.map(item => pack(item, seen)) }
  return { $id: id, $object: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, pack(item, seen)])) }
}
export function unpack(value: any, seen = new Map<number, any>()): any {
  if (value === null || typeof value !== 'object') return value
  if ('$atom' in value) return value.$atom === 'undefined' ? undefined : Number(value.$atom)
  if ('$ref' in value) return seen.get(value.$ref)
  if ('$fn' in value) return value.$fn === 'throw' ? () => { throw new Error('punctuation fixture') } : value.$fn === 'rewrite' ? () => 'changed' : value.$fn === 'append-period' ? (text: string) => text+'。' : () => 'fixture-id'
  const result = '$error' in value ? value.$error.kind === 'TypeError' ? new TypeError(value.$error.message) : value.$error.kind === 'RangeError' ? new RangeError(value.$error.message) : value.$error.kind === 'SyntaxError' ? new SyntaxError(value.$error.message) : new Error(value.$error.message) : '$uint8' in value ? Uint8Array.from(value.$uint8) : '$float32' in value ? Float32Array.from(value.$float32.map((item: unknown) => unpack(item, seen))) : '$map' in value ? new Map() : '$set' in value ? new Set() : '$array' in value ? [] : {}
  seen.set(value.$id, result)
  if ('$error' in value) for (const [key,item] of Object.entries(value.$error.fields)) result[key]=unpack(item,seen)
  else if ('$map' in value) for (const [key, item] of value.$map) result.set(unpack(key, seen), unpack(item, seen))
  else if ('$set' in value) for (const item of value.$set) result.add(unpack(item, seen))
  else if ('$array' in value) for (const item of value.$array) result.push(unpack(item, seen))
  else if ('$object' in value) for (const [key, item] of Object.entries(value.$object)) result[key] = unpack(item, seen)
  return result
}
export function observe(fn: Function, args: unknown[]) {
  try { return { returned: pack({ value: Reflect.apply(fn, undefined, args), postArgs: args }) } }
  catch (error) {
    // Engine/Node failures outside declared types require failure, not imitation.
    const engine = error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError
    return { failed: true, engine, name: error instanceof Error ? error.constructor.name : typeof error, message: error instanceof Error ? error.message : String(error) }
  }
}
export function assertObservation(actual: ReturnType<typeof observe>, expected: ReturnType<typeof observe>, label: string) {
  if ('failed' in expected && expected.engine) assert.ok('failed' in actual, label)
  else assert.deepEqual(actual, expected, label)
}
export function substitutions(args: unknown[][]): unknown[][] {
  const result: unknown[][] = []
  for (const seed of args) {
    result.push(unpack(pack(seed)))
    const visit = (value: unknown, path: Array<string | number>) => {
      for (const atom of atoms) {
        const next = unpack(pack(seed))
        let owner: any = next
        for (const key of path.slice(0, -1)) owner = owner[key]
        owner[path.at(-1)!] = atom
        result.push(next)
      }
      if (Array.isArray(value)) value.forEach((item, index) => visit(item, [...path, index]))
      else if (value !== null && typeof value === 'object' && !(value instanceof Float32Array) && !(value instanceof Map)) {
        for (const [key, item] of Object.entries(value)) visit(item, [...path, key])
      }
    }
    seed.forEach((value, index) => visit(value, [index]))
  }
  return result
}
