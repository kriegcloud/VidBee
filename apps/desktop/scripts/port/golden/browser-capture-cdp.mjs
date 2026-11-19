/** Renderer IPC only, via its existing contextBridge public API. */
export async function browserCaptureCdp() {
  const targets = await (
    await fetch('http://127.0.0.1:9230/json', { signal: AbortSignal.timeout(15_000) })
  ).json()
  const target = targets.find((value) => value.type === 'page' && !value.url.startsWith('devtools'))
  if (!target) {
    throw new Error('No renderer CDP target')
  }
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.close()
      reject(new Error('CDP open deadline'))
    }, 15_000)
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timeout)
        resolve()
      },
      { once: true }
    )
    socket.addEventListener(
      'error',
      (error) => {
        clearTimeout(timeout)
        reject(error)
      },
      { once: true }
    )
  })
  let id = 0
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    const command = pending.get(message.id)
    if (!command) {
      return
    }
    clearTimeout(command.timeout)
    pending.delete(message.id)
    if (message.error) {
      command.reject(new Error(JSON.stringify(message.error)))
    } else {
      command.resolve(message.result)
    }
  })
  const evaluate = (expression) =>
    new Promise((resolve, reject) => {
      const key = ++id
      const timeout = setTimeout(() => {
        pending.delete(key)
        reject(new Error('CDP evaluation deadline'))
      }, 90_000)
      pending.set(key, { resolve, reject, timeout })
      socket.send(
        JSON.stringify({
          id: key,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true }
        })
      )
    })
  return {
    evaluate,
    ipc: async (method, input) => {
      const result = await evaluate(
        `(async () => { try { return { ok: true, value: await window.electron.ipcRenderer.invoke(${JSON.stringify(`download.${method}`)}${input === undefined ? '' : `, ${JSON.stringify(input)}`}) } } catch (error) { return { ok: false, message: error.message } } })()`
      )
      if (result.exceptionDetails) {
        throw new Error(JSON.stringify(result.exceptionDetails))
      }
      return result.result.value
    },
    close: () => socket.close()
  }
}
