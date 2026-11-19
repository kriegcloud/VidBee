// Fail closed before loading application code, in both VMs and host/DOM globals.
export const networkRefusals = []
export function denyNetwork(window) {
  const refuse = () => { networkRefusals.push('network'); throw new Error('Real network prohibited') }
  globalThis.fetch = refuse
  if (window) {
    window.fetch = refuse
    window.XMLHttpRequest = class { constructor() { refuse() } }
    window.WebSocket = class { constructor() { refuse() } }
  }
}
export function requestOptions(options) {
  const result = { method: options.method, headers: structuredClone(options.headers), body: options.body }
  for (const key of Object.keys(options).sort()) {
    if (options[key] === undefined || ['method', 'headers', 'body'].includes(key)) continue
    result[key] = key === 'signal' ? { abortSignal: options.signal instanceof AbortSignal } : structuredClone(options[key])
  }
  return result
}
