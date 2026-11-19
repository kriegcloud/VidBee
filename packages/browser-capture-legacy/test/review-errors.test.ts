import { expect, it } from '@effect/vitest'
import * as Cause from 'effect/Cause'
import { HostFailure as QueueHostFailure } from '@vidbee/task-queue/TaskQueue.errors'
import { HostFailure, MediaUnavailable } from '../../browser-capture/src/Capture.errors.js'
import { captureError } from '../src/errors.js'
it('keeps arbitrary defect and adapter identities even when they carry domain-like metadata',()=>{
  const error=new Error('callback sentinel')
  Object.assign(error,{original:new Error('nested sentinel'),legacyMessage:'metadata sentinel'})
  expect(captureError(Cause.die(error))).toBe(error)
  expect(captureError(Cause.fail(HostFailure.make({operation:'callback',legacyMessage:error.message,cause:error})))).toBe(error)
  expect(captureError(Cause.fail(QueueHostFailure.make({legacyMessage:error.message,original:error})))).toBe(error)
  const mapped=captureError(Cause.fail(MediaUnavailable.make({operation:'media',legacyMessage:'original media guidance'})))
  expect(mapped).toBeInstanceOf(Error)
  expect((mapped as Error).message).toBe('original media guidance')
})
