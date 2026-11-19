import { readFile } from 'node:fs/promises'
import path from 'node:path'

export async function phase8Routes(runDir) {
  const template = await readFile(path.join(runDir, 'userdata/phase8-fixtures/page.html'), 'utf8')
  return (request, response, url) => {
    if (url.pathname !== '/phase8/page.html') {
      return false
    }
    const data = Buffer.from(template.replaceAll('{{ORIGIN}}', `http://${request.headers.host}`))
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': data.length,
      'Last-Modified': 'Wed, 01 Jan 2025 00:00:00 GMT'
    })
    response.end(request.method === 'HEAD' ? undefined : data)
    return true
  }
}
