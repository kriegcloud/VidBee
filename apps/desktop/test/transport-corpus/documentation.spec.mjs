import { readFileSync } from 'node:fs'
import { parse } from '@babel/parser'
import { describe, expect, it } from '@effect/vitest'

const strict = JSON.parse(readFileSync('apps/desktop/port-units.json', 'utf8')).files.filter(
  (unit) => unit.partition === 'strict'
)

describe('fix4 R7: public documentation teaches the owning contract', () => {
  it('covers every strict public export and rejects the former signature echoes and discarded validation examples', () => {
    let exports = 0
    for (const { file } of strict) {
      const text = readFileSync(file, 'utf8')
      const ast = parse(text, { sourceType: 'module', plugins: ['typescript'] })
      for (const node of ast.program.body) {
        if (node.type !== 'ExportNamedDeclaration' || !node.declaration) {
          continue
        }
        exports++
        const start = text.lastIndexOf('/**', node.start)
        const doc = text.slice(start, node.start)
        expect(start, file).toBeGreaterThanOrEqual(0)
        expect(doc.trimEnd().endsWith('*/'), file).toBe(true)
        expect(doc, file).not.toMatch(
          /explicit lifetime and failure ownership|at its owning boundary|Describes .+ ownership at the desktop transport boundary|Supplies .+ through the owning application or document scope|const compose =|void (?:validate|validated|decode|encoded|client|compose)/
        )
        expect(doc, file).toContain('@since 0.0.0')
        expect(doc, file).toMatch(/@category \S+/)
        const declaration = node.declaration
        if (
          declaration.type !== 'TSTypeAliasDeclaration' &&
          declaration.type !== 'TSInterfaceDeclaration'
        ) {
          expect(doc, file).toMatch(/\*\*Example\*\* \(.+\)/)
          expect(doc, file).toContain('```ts')
        }
      }
    }
    expect(exports).toBe(453)
    const fields = readFileSync('apps/desktop/src/renderer/src/transport/RpcField.model.ts', 'utf8')
    expect(fields).toContain('decodes that tag back to undefined')
    expect(fields).toContain('preserving a value that JSON alone cannot represent')
  })
})
