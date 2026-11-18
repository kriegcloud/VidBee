import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

/**
 * Pin the renderer to the desktop React copy so workspace UI / Radix share one dispatcher.
 * React is located with Node resolution from the desktop package, so the alias works with
 * both hoisted (root node_modules) and per-package node_modules layouts.
 */
export const createRendererResolve = (
  desktopRoot: string
): {
  alias: Record<string, string>
  dedupe: string[]
} => {
  const requireFromDesktop = createRequire(join(desktopRoot, 'package.json'))
  const react = dirname(requireFromDesktop.resolve('react/package.json'))
  const reactDom = dirname(requireFromDesktop.resolve('react-dom/package.json'))

  return {
    alias: {
      '@main': resolve(desktopRoot, 'src/main'),
      '@renderer': resolve(desktopRoot, 'src/renderer/src'),
      '@shared': resolve(desktopRoot, 'src/shared'),
      react,
      'react-dom': reactDom,
      'react/jsx-runtime': join(react, 'jsx-runtime.js'),
      'react/jsx-dev-runtime': join(react, 'jsx-dev-runtime.js')
    },
    dedupe: ['react', 'react-dom']
  }
}
