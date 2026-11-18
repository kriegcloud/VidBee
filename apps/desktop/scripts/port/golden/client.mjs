import { readFileSync } from 'node:fs'
export function createClient(runDir) {
  const config = JSON.parse(readFileSync(`${runDir}/mcp.json`, 'utf8'))
  const base = new URL(config.url).origin
  let session
  let protocol
  let nextId = 0
  let automationToken
  const parse = async (response) => {
    const text = await response.text()
    if (!text) {
      return null
    }
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      return text
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => JSON.parse(line.slice(5)))
        .find((message) => message.id !== undefined)
    }
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }
  const rpc = async (method, params = {}, notification = false) => {
    const headers = {
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${config.token}`,
      'content-type': 'application/json'
    }
    if (session) {
      headers['mcp-session-id'] = session
    }
    if (protocol) {
      headers['MCP-Protocol-Version'] = protocol
    }
    const body = { jsonrpc: '2.0', method, params }
    if (!notification) {
      body.id = ++nextId
    }
    const response = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000)
    })
    session = response.headers.get('mcp-session-id') ?? session
    const message = await parse(response)
    if (method === 'initialize') {
      protocol = message.result.protocolVersion
    }
    return {
      status: response.status,
      ...(message?.error ? { error: message.error } : { result: message?.result })
    }
  }
  const http = async (method, path, body, auth = 'valid') => {
    const headers = { 'content-type': 'application/json' }
    if (auth === 'valid') {
      if (!automationToken) {
        const response = await fetch(`${base}/automation/v1/handshake`, {
          method: 'POST',
          headers,
          body: '{}'
        })
        automationToken = (await response.json()).token
      }
      headers.authorization = `Bearer ${automationToken}`
    } else if (auth === 'bad') {
      headers.authorization = 'Bearer invalid-token'
    } else if (auth && typeof auth === 'object') {
      headers.origin = 'chrome-extension://kpelcaehdkgleenlldpipjpoopnacehk'
      headers['x-vidbee-extension'] = headers.origin
      if (auth.token) {
        headers.authorization = `Bearer ${auth.token}`
      }
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)
    try {
      const response = await fetch(`${base}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal
      })
      let value
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        const reader = response.body.getReader()
        let text = ''
        while (!text.includes('\n\n')) {
          const chunk = await reader.read()
          if (chunk.done) {
            throw new Error('SSE ended before its first frame')
          }
          text += new TextDecoder().decode(chunk.value)
        }
        const frame = text.split('\n\n')[0]
        value = {
          event:
            frame
              .split('\n')
              .find((line) => line.startsWith('event:'))
              ?.slice(6)
              .trim() ?? 'message',
          data: JSON.parse(
            frame
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trim())
              .join('\n')
          )
        }
        await reader.cancel()
      } else {
        value = await parse(response)
      }
      if (path === '/automation/v1/handshake' && value?.token) {
        automationToken = value.token
      }
      return { status: response.status, body: value }
    } finally {
      clearTimeout(timeout)
    }
  }
  const events = async () => {
    const handshake = await http('POST', '/automation/v1/handshake', {})
    const response = await fetch(`${base}/automation/v1/events`, {
      headers: { authorization: `Bearer ${handshake.body.token}` }
    })
    if (!response.ok) {
      throw new Error(`Event stream failed: ${response.status}`)
    }
    const reader = response.body.getReader()
    const values = []
    let buffer = ''
    const consume = async () => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          return
        }
        buffer += new TextDecoder().decode(value)
        let end = buffer.indexOf('\n\n')
        while (end >= 0) {
          const frame = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          const data = frame.split('\n').find((line) => line.startsWith('data:'))
          if (data) {
            values.push(JSON.parse(data.slice(5)))
          }
          end = buffer.indexOf('\n\n')
        }
      }
    }
    const consuming = consume()
    return {
      values,
      close: async () => {
        await reader.cancel()
        await consuming
      }
    }
  }
  return {
    rpc,
    http,
    events,
    mcp: async (name, args = {}) => rpc('tools/call', { name, arguments: args })
  }
}
