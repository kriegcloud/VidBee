import { renderMermaidSVG } from 'beautiful-mermaid'
import type { DiagramPlugin } from 'streamdown'

type MermaidRenderer = ReturnType<DiagramPlugin['getMermaid']>

let mermaidJsPluginPromise: Promise<DiagramPlugin> | null = null

const loadMermaidJsPlugin = (): Promise<DiagramPlugin> => {
  mermaidJsPluginPromise ??= import('@streamdown/mermaid').then((mod) => mod.mermaid)
  return mermaidJsPluginPromise
}

const BEAUTIFUL_MERMAID_THEME = {
  bg: 'var(--background)',
  fg: 'var(--foreground)',
  accent: 'var(--primary)',
  muted: 'var(--muted-foreground)',
  border: 'var(--border)',
  surface: 'var(--card)',
  transparent: true
} as const

const GOOGLE_FONT_IMPORT = /@import url\('https:\/\/fonts\.googleapis\.com[^']+'\);\s*/g

const BEAUTIFUL_MERMAID_TYPE =
  /^(flowchart|graph|sequenceDiagram|stateDiagram(?:-v2)?|classDiagram|erDiagram|xychart-beta)\b/

/**
 * Drop YAML frontmatter and mermaid init directives so the first keyword is visible.
 *
 * @param source Raw mermaid fence body.
 */
export const mermaidSourceStart = (source: string): string =>
  source
    .replace(/^---\r?\n[\s\S]*?\r?\n---\s*/, '')
    .replace(/^%%\{[\s\S]*?\}%%\s*/, '')
    .trim()

/**
 * True when beautiful-mermaid can paint this source without mermaid.js.
 *
 * @param source Raw mermaid fence body.
 */
export const canRenderBeautifulMermaid = (source: string): boolean =>
  BEAUTIFUL_MERMAID_TYPE.test(mermaidSourceStart(source))

/**
 * Drop Google Fonts @import so Electron CSP does not block the diagram style.
 *
 * @param svg SVG from beautiful-mermaid.
 */
const stripGoogleFontImports = (svg: string): string => svg.replace(GOOGLE_FONT_IMPORT, '')

/**
 * Paint with beautiful-mermaid, or mermaid.js for mindmaps and other types.
 *
 * @param id Streamdown render id.
 * @param source Raw mermaid fence body.
 * @param fallback mermaid.js instance from @streamdown/mermaid.
 */
const renderDiagramSvg = async (
  id: string,
  source: string,
  fallback: MermaidRenderer
): Promise<{ svg: string }> => {
  if (canRenderBeautifulMermaid(source)) {
    return { svg: stripGoogleFontImports(renderMermaidSVG(source, BEAUTIFUL_MERMAID_THEME)) }
  }
  return fallback.render(id, source)
}

/** Streamdown diagram plugin that prefers beautiful-mermaid. */
export const mermaid: DiagramPlugin = {
  name: 'mermaid',
  type: 'diagram',
  language: 'mermaid',
  getMermaid: (config) => {
    let initConfig = config
    let fallbackPromise: Promise<MermaidRenderer> | null = null
    const ensureFallback = (): Promise<MermaidRenderer> => {
      fallbackPromise ??= loadMermaidJsPlugin().then((plugin) => plugin.getMermaid(initConfig))
      return fallbackPromise
    }
    return {
      initialize: (next) => {
        initConfig = next
        void fallbackPromise?.then((fallback) => fallback.initialize(next))
      },
      render: async (id, source) => {
        if (canRenderBeautifulMermaid(source)) {
          return {
            svg: stripGoogleFontImports(renderMermaidSVG(source, BEAUTIFUL_MERMAID_THEME))
          }
        }
        return renderDiagramSvg(id, source, await ensureFallback())
      }
    }
  }
}
