// Loaded before the exported worker entry. Only the native package and boundary writes are faked.
const fs = require('node:fs')
const Module = require('node:module')
const originalParse = JSON.parse
const trace = (value) => fs.appendFileSync(process.env.VIDBEE_ADDON_TRACE, JSON.stringify(value) + '\n')
let tick = 0
Object.defineProperty(performance, 'now', { value: () => { trace(['clock', tick]); const value = tick; tick += 10; return value } })
class OfflineRecognizer {
  constructor(config) { trace(['recognizer', config]) }
  createStream() {
    trace('createStream')
    return {
      acceptWaveform: ({sampleRate, samples}) => trace(['acceptWaveform', sampleRate, samples.length, samples[0], samples[1]]),
      inputFinished: () => trace('inputFinished')
    }
  }
  decode() { trace('decode') }
  getResult() { trace(['getResult', JSON.parse === originalParse]); return JSON.parse('{"text":"Hello\nworld."}') }
}
const load = Module._load
Module._load = function(request, parent, main) {
  if (request === 'sherpa-onnx-node') return { OfflineRecognizer }
  return load.call(this, request, parent, main)
}
globalThis.require = Module.createRequire(__filename)
const write = fs.writeSync
let calls = 0
fs.writeSync = function(fd, buffer, offset, length) {
  if (fd !== 1 || !process.env.VIDBEE_WRITE_MODE) return write(fd, buffer, offset, length)
  calls += 1
  if (process.env.VIDBEE_WRITE_MODE === 'retry') {
    if (calls <= 2) { trace(['write-retry', calls]); throw Object.assign(new Error('fixture pipe busy'), {code: calls === 1 ? 'EAGAIN' : 'EWOULDBLOCK'}) }
    const count = Math.min(length, 3)
    trace(['write', offset, count])
    return write(fd, buffer, offset, count)
  }
  if (process.env.VIDBEE_WRITE_MODE === 'backpressure') {
    trace(['write-before', calls])
    const count = write(fd, buffer, offset, length)
    trace(['write-after', calls, count])
    return count
  }
  trace(['write-invalid', process.env.VIDBEE_WRITE_MODE, buffer.toString('utf8', offset, offset + length)])
  return Number(process.env.VIDBEE_WRITE_MODE)
}
require('node:module').syncBuiltinESMExports()
if (process.env.VIDBEE_WRITE_MODE === 'backpressure') {
  const on = process.stdin.on
  process.stdin.on = function(event, listener) {
    if (event !== 'data') return on.call(this, event, listener)
    return on.call(this, event, function(chunk) {
      fs.appendFileSync(process.env.VIDBEE_ADDON_TRACE + '.parsed', String(chunk).split('\n').length - 1 + '\n')
      return listener.call(this, chunk)
    })
  }
}
