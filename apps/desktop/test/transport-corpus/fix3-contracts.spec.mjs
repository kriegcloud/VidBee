import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { it } from '@effect/vitest'
import { FanslyCommandSchema } from '@vidbee/downloader-core/fansly-profile'
import * as Result from 'effect/Result'
import * as RpcSerialization from 'effect/rpc/RpcSerialization'
import * as S from 'effect/Schema'
import { AiRpcs } from '../../src/renderer/src/transport/census/Ai.rpc.js'
import { DownloadsRpcs } from '../../src/renderer/src/transport/census/Downloads.rpc.js'
import { RpcArray } from '../../src/renderer/src/transport/RpcField.model.js'

it('fix3 R9: census-derived authored arrays all use dense admission, including future fields', () => {
  const directory = new URL('../../src/renderer/src/transport/census/', import.meta.url)
  for (const file of readdirSync(directory).filter((file) => file.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, directory), 'utf8')
    assert.equal(
      /\bS\.(?:Array|NonEmptyArray)\s*\(/.test(source),
      false,
      `${file}: authored arrays require RpcArray`
    )
  }
  const schema = AiRpcs.requests.get('Ai.GetAgentUiTasks').payloadSchema
  for (const defect of ['hole', 'extra', 'symbol', 'nonenumerable', 'accessor']) {
    const ids = ['one']
    if (defect === 'hole') {
      Reflect.deleteProperty(ids, '0')
    }
    if (defect === 'extra') {
      ids.extra = 'should reject'
    }
    if (defect === 'symbol') {
      ids[Symbol('extra')] = true
    }
    if (defect === 'nonenumerable') {
      Object.defineProperty(ids, '0', { enumerable: false, value: 'one' })
    }
    if (defect === 'accessor') {
      Object.defineProperty(ids, '0', {
        enumerable: true,
        get() {
          throw new Error('accessor must not execute')
        }
      })
    }
    for (const codec of [schema, RpcSerialization.json.codecFor(schema)]) {
      assert(Result.isFailure(S.encodeUnknownResult(codec)({ ids })), defect)
    }
  }
  const decorated = [1]
  decorated.extra = true
  assert(Result.isFailure(S.encodeUnknownResult(RpcArray(S.Int))(decorated)))
})

it('fix3 R11: actual Fansly request accepts exactly the native command categories', () => {
  const schema = DownloadsRpcs.requests.get('Downloads.FanslyProfileCommand').payloadSchema
  for (const category of ['posts', 'media', 'photos', 'videos', null, undefined]) {
    const input = {
      url: 'https://fansly.com/example',
      action: 'get',
      ...(category === undefined ? {} : { category })
    }
    const native = S.decodeUnknownResult(FanslyCommandSchema)(input)
    const transport = S.encodeUnknownResult(schema)({ input })
    assert.equal(Result.isSuccess(transport), Result.isSuccess(native), `category ${category}`)
  }
})

it('fix3 R12: every strict public owner has law metadata and compiling-example carriers', () => {
  const root = process.cwd()
  const units = JSON.parse(
    readFileSync(`${root}/apps/desktop/port-units.json`, 'utf8')
  ).files.filter((unit) => unit.partition === 'strict')
  for (const { file } of units) {
    const source = readFileSync(`${root}/${file}`, 'utf8')
    assert.equal(/^\s*switch\s*\(/m.test(source), false, `${file}: native switch is forbidden`)
    for (const match of source.matchAll(/^export (const|class|interface|type) (\w+)/gm)) {
      const prefix = source.slice(0, match.index)
      const start = prefix.lastIndexOf('/**')
      const end = prefix.lastIndexOf('*/')
      assert(
        start >= 0 && end > start && prefix.slice(end + 2).trim() === '',
        `${file}: ${match[2]} has no owning JSDoc`
      )
      const doc = prefix.slice(start, end)
      assert(
        /@category \S+/.test(doc) && /@since 0\.0\.0\b/.test(doc),
        `${file}: ${match[2]} metadata`
      )
      if (match[1] !== 'interface' && match[1] !== 'type') {
        assert(
          /\*\*Example\*\* \([^)]+\)/.test(doc) && /```ts\n/.test(doc),
          `${file}: ${match[2]} Example`
        )
      }
    }
  }
})
