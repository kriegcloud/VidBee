import type { TFunction } from 'i18next'

/** Translate signature the renderer's label helpers accept. */
export type PlainTranslate = (key: string, options?: Record<string, unknown>) => string

const cache = new WeakMap<TFunction, PlainTranslate>()

/**
 * Adapt i18next's `t` to the plain `(key, options?)` shape. i18next 27 types `t` as a
 * union of argument tuples that no longer accepts an explicitly optional second
 * argument. The adapter is cached per `t`, so its identity is as stable as `t` itself
 * and hook dependency arrays behave as before.
 */
export const plainTranslate = (t: TFunction): PlainTranslate => {
  const cached = cache.get(t)
  if (cached) {
    return cached
  }
  const translate: PlainTranslate = (key, options) =>
    options === undefined ? t(key) : t(key, options)
  cache.set(t, translate)
  return translate
}
