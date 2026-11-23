import * as HashMap from 'effect/HashMap'
import * as O from 'effect/Option'
import type { WebContents } from 'electron'

let roles = HashMap.empty<number, { contents: WebContents; role: 'visible' | 'capture' }>()
export const registerFoundationWindow = (
  contents: WebContents,
  role: 'visible' | 'capture'
): void => {
  roles = HashMap.set(roles, contents.id, { contents, role })
  contents.once('destroyed', () => {
    const current = HashMap.get(roles, contents.id)
    if (O.isSome(current) && current.value.contents === contents) {
      roles = HashMap.remove(roles, contents.id)
    }
  })
}

export const foundationWindowRole = (contents: WebContents) => {
  const current = HashMap.get(roles, contents.id)
  return O.isSome(current) && current.value.contents === contents ? current.value.role : undefined
}
