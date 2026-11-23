import assert from 'node:assert/strict'
import test from 'node:test'
import net from 'node:net'
import { spawn } from 'node:child_process'

test('direct worker refuses before connecting to a fake CDP endpoint outside its namespace', async () => {
  let connections = 0
  const server = net.createServer(socket => { connections++; socket.destroy() })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const port = server.address().port
    const child = spawn(process.execPath, ['--import', './scripts/desktop-foundation/no-network-fixture.mjs', 'scripts/desktop-foundation/packaged.mjs', '--worker',
      '--cdp-endpoint', `http://127.0.0.1:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] })
    let error = ''
    child.stderr.on('data', data => { error += data })
    const code = await new Promise(resolve => child.once('close', resolve))
    assert.notEqual(code, 0)
    assert.match(error, /Isolation refused: missing owned run identity/)
    assert.equal(connections, 0)
  } finally { await new Promise(resolve => server.close(resolve)) }
})

test('a known identity still refuses when invoked in the host namespaces', async () => {
  const fs = await import('node:fs/promises')
  const os = await import('node:os')
  const path = await import('node:path')
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'foundation-safety-'))
  const server = net.createServer(socket => { socket.destroy(); assert.fail('Worker connected outside namespace') })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    await fs.writeFile(path.join(directory, 'BRIEF.md'), 'Synthetic test lane')
    const run = path.join(directory, 'run'); await fs.mkdir(run)
    const namespaces = Object.fromEntries(await Promise.all(['net','user','mnt'].map(async kind => [kind,await fs.readlink(`/proc/self/ns/${kind}`)])))
    await fs.writeFile(path.join(run,'identity.json'),JSON.stringify({identity:'known',run,lane:directory,host:namespaces,owned:namespaces,parentPid:process.pid,namespacePid:process.pid,appPid:process.pid}))
    const child = spawn(process.execPath,['--import','./scripts/desktop-foundation/no-network-fixture.mjs','scripts/desktop-foundation/packaged.mjs','--worker','--run',run,'--identity','known','--cdp-endpoint',`http://127.0.0.1:${server.address().port}`],{stdio:['ignore','pipe','pipe']})
    let error='';child.stderr.on('data',data=>{error+=data})
    const code=await new Promise(resolve=>child.once('close',resolve))
    assert.notEqual(code,0);assert.match(error,/Isolation refused: host net namespace/)
  } finally {await new Promise(resolve=>server.close(resolve));await fs.rm(directory,{recursive:true,force:true})}
})
