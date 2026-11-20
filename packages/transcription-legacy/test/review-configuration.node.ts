import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import * as Machine from '../src/asr-recommend'
import * as Recognizer from '../src/asr-recognizer'
import * as Concurrency from '../src/concurrency'
import {observeMachine,observeRecognizer,observeConcurrency} from './review-configuration-fixture'
const baseline=JSON.parse(readFileSync(new URL('./fixtures/review-configuration.json',import.meta.url),'utf8')) as Record<string,unknown>
test('machine host-default reads preserve exact old ordering and fresh defaults',()=>assert.deepEqual(observeMachine(Machine),baseline.machine))
test('manager role/config calls preserve order, configurable defaults, null scalars and error identity',()=>assert.deepEqual(observeRecognizer(Recognizer),baseline.recognizer))
test('concurrency invokes all setters synchronously and ignores Promise returns',async()=>assert.deepEqual(await observeConcurrency(Concurrency),baseline.concurrency))
