import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const origin = 'chrome-extension://kpelcaehdkgleenlldpipjpoopnacehk'
export async function runExtensionApiCases({ runDir, server, record, raw }) {
  const config = JSON.parse(await readFile(path.join(runDir, 'mcp.json'), 'utf8'))
  const base = new URL(config.url).origin
  const requests = []
  const request = async (method, route, token) => {
    const headers = { origin, 'x-vidbee-extension': origin }
    const response = await fetch(`${base}${route}`, {
      method,
      headers,
      signal: AbortSignal.timeout(120_000)
    })
    const value = { status: response.status, body: await response.json() }
    raw.push({ method, url: `${base}${route}`, headers, response: value })
    requests.push({
      method,
      path: token ? route.replace(token, '<token>') : route,
      headers,
      body: null
    })
    return value
  }
  const status = await request('GET', '/status')
  const issued = await request('POST', '/token')
  assert.equal(issued.status, 200)
  const route = `/video-info?url=${encodeURIComponent(`${server.url}/phase8/page.html`)}&token=${issued.body.token}`
  const response = await request('GET', route, issued.body.token)
  assert.equal(response.status, 200)
  assert.ok(response.body.formats.length)
  await record('extension-api/metadata-success', { response })
  await record('extension-api/token-single-use', {
    response: await request('GET', route, issued.body.token)
  })
  await record('extension-api/request-sequence', { requests: requests.slice(0, 3), status, issued })
  // The packaged origin guard admits only the published identity. Do not weaken it to test binding.
  const other = 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const token = (await request('POST', '/token')).body.token
  const foreign = await fetch(
    `${base}/video-info?url=${encodeURIComponent(`${server.url}/phase8/video.mp4`)}&token=${token}`,
    {
      headers: { origin: other, 'x-vidbee-extension': other },
      signal: AbortSignal.timeout(120_000)
    }
  )
  const foreignResponse = { status: foreign.status, body: await foreign.json() }
  assert.equal(foreignResponse.status, 403)
  await record('extension-api/origin-not-admitted', { origin: other, response: foreignResponse })
  const failedToken = (await request('POST', '/token')).body.token
  const failure = await request(
    'GET',
    `/video-info?url=${encodeURIComponent(`${server.url}/404-phase8.mp4`)}&token=${failedToken}`,
    failedToken
  )
  assert.equal(failure.status, 500)
  await record('extension-api/metadata-failure', { response: failure })
}
