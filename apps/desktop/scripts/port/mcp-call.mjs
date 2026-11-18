// Minimal MCP client for a test instance (streamable HTTP, bearer token from mcp.json).
// Run inside the instance's network namespace:
//   node mcp-call.mjs <mcp.json> list
//   node mcp-call.mjs <mcp.json> call <tool> '<json arguments>'
import { readFileSync } from 'node:fs'

const [configPath, command, tool, rawArguments] = process.argv.slice(2)
const config = JSON.parse(readFileSync(configPath, 'utf8'))
let protocolVersion
let sessionId
let nextId = 0

const parseBody = async (response) => {
  const text = await response.text()
  if (!text) {
    return
  }
  if ((response.headers.get('content-type') ?? '').includes('text/event-stream')) {
    const messages = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => JSON.parse(line.slice(5)))
    return messages.find((message) => message.id !== undefined) ?? messages.at(-1)
  }
  return JSON.parse(text)
}

const rpc = async (method, params, notification = false) => {
  nextId += 1
  const headers = {
    accept: 'application/json, text/event-stream',
    authorization: `Bearer ${config.token}`,
    'content-type': 'application/json'
  }
  if (protocolVersion) {
    headers['MCP-Protocol-Version'] = protocolVersion
  }
  if (sessionId) {
    headers['mcp-session-id'] = sessionId
  }
  const body = notification
    ? { jsonrpc: '2.0', method, params }
    : { jsonrpc: '2.0', id: nextId, method, params }
  const response = await fetch(config.url, { method: 'POST', headers, body: JSON.stringify(body) })
  sessionId = response.headers.get('mcp-session-id') ?? sessionId
  return { status: response.status, message: await parseBody(response) }
}

const initialized = await rpc('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'vidbee-port-harness', version: '1' }
})
protocolVersion = initialized.message.result.protocolVersion
await rpc('notifications/initialized', {}, true)
const result =
  command === 'list'
    ? await rpc('tools/list', {})
    : await rpc('tools/call', { name: tool, arguments: JSON.parse(rawArguments ?? '{}') })
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
