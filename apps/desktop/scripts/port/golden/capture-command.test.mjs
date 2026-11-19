import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { expect, it } from '@effect/vitest'
import { pinnedNode } from '../../../../../scripts/cli/characterization/pinned-node.mjs'
import { captureCommand } from './capture-command.mjs'

const node = pinnedNode()
it('collects large pretty and probe documents completely through close', async () => {
  const result = await captureCommand(node, [
    '-e',
    `const text=JSON.stringify({stdout:'x'.repeat(4*1024*1024)},null,2)+'\\n';process.stdout.write(text,()=>process.stderr.write('tail'));`
  ])
  expect(result.code).toBe(0)
  expect(result.signal).toBe(null)
  expect(JSON.parse(result.stdout).stdout.length).toBe(4 * 1024 * 1024)
  expect(result.stdout.endsWith('\n')).toBe(true)
  expect(result.stderr).toBe('tail')
})
it('retains bytes written by an owned descendant after the parent exit event', async () => {
  const result = await captureCommand(node, [
    '-e',
    `process.stdout.write('head');require('node:child_process').spawn(process.execPath,['-e',"setTimeout(()=>process.stdout.write('tail'),50)"],{stdio:['ignore',1,2]});process.exit(0);`
  ])
  expect(result.stdout).toBe('headtail')
  expect(result.code).toBe(0)
})
it('bounds a descendant-held pipe after its parent has exited', async () => {
  await expect(
    captureCommand(
      node,
      [
        '-e',
        `require('node:child_process').spawn(process.execPath,['-e','setTimeout(()=>{},500)'],{stdio:['ignore',1,2]});process.exit(0);`
      ],
      { timeoutMs: 100 }
    )
  ).rejects.toThrow('command capture timed out')
})
it('reports the termination signal independently of the exit code', async () => {
  const result = await captureCommand(node, ['-e', `process.kill(process.pid,'SIGTERM')`])
  expect(result.code).toBe(null)
  expect(result.signal).toBe('SIGTERM')
})
it('rejects spawn failures and bounded output', async () => {
  await expect(captureCommand('/fixture/missing-executable', [])).rejects.toMatchObject({
    code: 'ENOENT'
  })
  await expect(
    captureCommand(node, ['-e', `process.stdout.write('123456789')`], { maxBytes: 4 })
  ).rejects.toThrow('exceeded 4 bytes')
})
it('releases both pipes and the owned child on a stream failure', async () => {
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.exitCode = null
  child.signalCode = null
  const signals = []
  child.kill = (signal) => signals.push(signal)
  const result = captureCommand('fixture', [], {}, () => child)
  child.stdout.emit('error', new Error('fixture stream failure'))
  await expect(result).rejects.toThrow('fixture stream failure')
  expect(signals).toEqual(['SIGKILL'])
  expect(child.stdout.destroyed).toBe(true)
  expect(child.stderr.destroyed).toBe(true)
})
