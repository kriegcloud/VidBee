import { transformSync } from 'esbuild'

const bindings = [
  ['components/ui/title-bar.tsx', 'isMaximized', 'setIsMaximized', 'window.isMaximized'],
  ['components/feedback/FeedbackLinks.tsx', 'appInfo', 'setAppInfo', 'app.metadata'],
  ['components/transcript/TranscriptShareImageDialog.tsx', 'platform', 'setPlatform', 'share.platform']
]

// Bind identity to the named state destination, never the hook's ordinal or
// component. Parse TS/JSX first so comments and type arguments cannot be locators.
// A renamed, missing or ambiguous binding requires explicit adapter maintenance.
export function locateLifecycleState(source, file) {
  const binding = bindings.find(([suffix]) => file.endsWith(`/${suffix}`))
  if (!binding) return source
  const [, state, setter, identity] = binding
  const code = transformSync(source, {loader:'tsx',format:'esm',target:'node22',jsx:'automatic'}).code
  const declaration = new RegExp(`\\bconst\\s*\\[\\s*${state}\\s*,\\s*${setter}\\s*\\]\\s*=\\s*useState\\s*(?=\\()`, 'g')
  const matches = [...code.matchAll(declaration)]
  const imports = [...code.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']react["']/g)]
  if (matches.length !== 1 || imports.filter(match => match[1].split(',').some(name => name.trim() === 'useState')).length !== 1) {
    throw Error(`Lifecycle adapter needs updating: expected one React state binding ${state}/${setter} in ${file}, found ${matches.length}`)
  }
  return code.replace(declaration, prefix => prefix.replace(/useState\s*$/, `((...args) => useState(...args, ${JSON.stringify(identity)}))`))
}
