import { setTimeout as delay } from 'node:timers/promises'

export async function until(condition, label, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const value = await condition()
    if (value) {
      return value
    }
    await delay(50)
  }
  throw new Error(`Extension browser deadline: ${label}`)
}

/** Flattened CDP sessions, bounded commands, and explicit transport release. */
export async function connectCdp(url, trace = () => {}) {
  const socket = new WebSocket(url)
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP connection deadline')), 10_000)
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timer)
        reject(new Error('CDP connection error'))
      },
      { once: true }
    )
  })
  let next = 0
  const pending = new Map()
  const listeners = new Set()
  const close = () => {
    for (const item of pending.values()) {
      clearTimeout(item.timer)
      item.reject(new Error('CDP disconnected'))
    }
    pending.clear()
    socket.close()
  }
  socket.addEventListener('close', close, { once: true })
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    trace({
      direction: 'receive',
      id: message.id,
      method: message.method,
      sessionId: message.sessionId,
      params:
        message.method?.startsWith('Target.') || message.method === 'Debugger.paused'
          ? message.params
          : undefined,
      error: message.error
    })
    if (message.id) {
      const item = pending.get(message.id)
      if (!item) {
        return
      }
      pending.delete(message.id)
      clearTimeout(item.timer)
      if (message.error) {
        item.reject(new Error(JSON.stringify(message.error)))
      } else {
        item.resolve(message.result)
      }
    } else {
      for (const listener of listeners) {
        listener(message)
      }
    }
  })
  const send = (method, params, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++next
      trace({
        direction: 'send',
        id,
        method,
        sessionId,
        expression: params?.expression?.slice(0, 90)
      })
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`CDP deadline: ${method}`))
      }, 15_000)
      pending.set(id, { resolve, reject, timer })
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  return {
    send,
    close,
    on: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    evaluate: async (session, expression) => {
      const value = await send(
        'Runtime.evaluate',
        { expression, awaitPromise: true, returnByValue: true },
        session
      )
      if (value.exceptionDetails) {
        throw new Error(JSON.stringify(value.exceptionDetails))
      }
      return value.result.value
    }
  }
}

/** Runs while the actual worker/popup is paused, before application initialization.
 * Wrappers forward the original arguments, receiver and return value unchanged.
 * Counts are diagnostics of observed API registrations, never a claim about GC.
 */
export const instrument = `(() => {
  if (globalThis.__extensionProof || !globalThis.chrome?.runtime?.id) return;
  const api = globalThis.browser?.runtime?.id ? globalThis.browser : globalThis.chrome;
  const proof = globalThis.__extensionProof = { queries: [], icons: [], storage: [], errors: [], listeners: {}, timeouts: [], intervals: [] };
  const wrap = (object, key, observe) => {
    if (!object || typeof object[key] !== 'function') return;
    const original = object[key];
    object[key] = function(...args) { observe(args); return Reflect.apply(original, this, args); };
  };
  if (api?.tabs) {
    const original = api.tabs.query;
    api.tabs.query = function(...args) {
      const value = Reflect.apply(original, this, args);
      if (value?.then) value.then(result => proof.queries.push({ input: args[0], result }), error => proof.errors.push(String(error)));
      return value;
    };
  }
  wrap(api?.action, 'setIcon', args => proof.icons.push(args[0]));
  for (const key of ['get', 'set', 'remove', 'clear']) wrap(api?.storage?.local, key, args => proof.storage.push({ operation: key, args }));
  for (const [name, event] of Object.entries({ storage: api?.storage?.onChanged, message: api?.runtime?.onMessage, command: api?.commands?.onCommand })) {
    if (!event) continue;
    const callbacks = [];
    proof.listeners[name] = callbacks;
    wrap(event, 'addListener', args => { if (!callbacks.includes(args[0])) callbacks.push(args[0]); });
    wrap(event, 'removeListener', args => { const i = callbacks.indexOf(args[0]); if (i >= 0) callbacks.splice(i, 1); });
  }
  for (const [set, clear, key, repeat] of [['setTimeout','clearTimeout','timeouts',false],['setInterval','clearInterval','intervals',true]]) {
    const start = globalThis[set], stop = globalThis[clear];
    globalThis[set] = function(callback, ms, ...args) {
      let id;
      id = Reflect.apply(start, this, [typeof callback === 'function' ? function(...values) { if (!repeat) proof[key] = proof[key].filter(v => v !== id); return Reflect.apply(callback, this, values); } : callback, ms, ...args]);
      proof[key].push(id); return id;
    };
    globalThis[clear] = function(id) { proof[key] = proof[key].filter(v => v !== id); return Reflect.apply(stop, this, [id]); };
  }
  globalThis.addEventListener('error', event => proof.errors.push(event.message));
  globalThis.addEventListener('unhandledrejection', event => proof.errors.push(String(event.reason)));
})()`

export const countsExpression =
  '({ listeners: Object.fromEntries(Object.entries(__extensionProof.listeners).map(([key, value]) => [key, value.length])), timeouts: __extensionProof.timeouts.length, intervals: __extensionProof.intervals.length })'
