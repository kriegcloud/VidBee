import type * as Atom from 'effect/reactivity/Atom'
import { atom } from 'jotai'
import { getDesktopDocument } from '../legacy/document'

/** Project the strict registry through Jotai's subscription seam; no independent preference or kernel value is stored here. */
export const projectFoundationAtom = <A>(source: Atom.Writable<A, A>) => {
  const document = getDesktopDocument()
  const revision = atom(false)
  revision.onMount = (set) =>
    document.registry.subscribe(source, () => set((value) => !value), { immediate: true })
  return atom(
    (get) => {
      get(revision)
      return document.registry.get(source)
    },
    (get, set, value: A) => {
      document.storage.write(source, value)
      set(revision, !get(revision))
    }
  )
}
