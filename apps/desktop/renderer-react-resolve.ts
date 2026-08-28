import { resolve } from 'node:path'

/**
 * Pin the renderer to the desktop React copy so workspace UI / Radix share one dispatcher.
 */
export const createRendererResolve = (
  desktopRoot: string
): {
  alias: Record<string, string>
  dedupe: string[]
} => {
  const react = resolve(desktopRoot, 'node_modules/react')
  const reactDom = resolve(desktopRoot, 'node_modules/react-dom')

  return {
    alias: {
      '@main': resolve(desktopRoot, 'src/main'),
      '@renderer': resolve(desktopRoot, 'src/renderer/src'),
      '@shared': resolve(desktopRoot, 'src/shared'),
      react,
      'react-dom': reactDom,
      'react/jsx-runtime': resolve(desktopRoot, 'node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime': resolve(desktopRoot, 'node_modules/react/jsx-dev-runtime.js')
    },
    dedupe: ['react', 'react-dom']
  }
}
