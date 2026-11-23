import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import net from 'node:net'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { containedLaunch } from './containment.mjs'

const parent=fs.mkdtempSync(path.join(os.tmpdir(),'foundation-boundary-'))
const work=path.join(parent,'foundation-owned');fs.mkdirSync(work)
const probe=spawnSync('bwrap',containedLaunch(work,['/usr/bin/true']),{encoding:'utf8',timeout:10_000})
const unavailable=probe.error?`Bubblewrap cannot start: ${probe.error.message}`:probe.status===0?false:`Bubblewrap cannot contain: ${probe.stderr.trim()}`
if(process.env.VIDBEE_REQUIRE_CONTAINMENT==='1'&&unavailable!==false)throw new Error(unavailable)

test('containment denies host reads, pathname sockets, processes, writes and symlink escapes', {skip:unavailable}, async () => {
  const outside=path.join(parent,'outside');fs.writeFileSync(outside,'unchanged')
  fs.symlinkSync(outside,path.join(work,'escape'))
  const server=net.createServer(socket=>socket.destroy()),socketPath=`/tmp/foundation-host-${process.pid}.sock`
  await new Promise(resolve=>server.listen(socketPath,resolve))
  const host=spawn('/usr/bin/sleep',['60'])
  try {
    const result=spawnSync('bwrap',containedLaunch(work,[process.execPath,'--input-type=module','-e',`
      import fs from 'node:fs';import net from 'node:net';import assert from 'node:assert/strict';
      fs.writeFileSync(${JSON.stringify(path.join(work,'inside'))},'owned');
      for(const target of ${JSON.stringify([outside,path.join(work,'escape')])}) {
        assert.throws(()=>fs.writeFileSync(target,'escaped'),e=>['ENOENT','EROFS','EACCES'].includes(e.code));
        assert.throws(()=>fs.readFileSync(target),e=>['ENOENT','EACCES'].includes(e.code));
      }
      assert.throws(()=>fs.readFileSync('/proc/${host.pid}/cmdline'));
      assert.throws(()=>process.kill(${host.pid},0),e=>e.code==='ESRCH');
      assert.throws(()=>process.kill(${host.pid},'SIGTERM'),e=>e.code==='ESRCH');
      await new Promise((resolve,reject)=>{const s=net.connect(${JSON.stringify(socketPath)});s.on('connect',()=>{s.destroy();reject(Error('host socket reachable'))});s.on('error',resolve)});
      for(const target of ['/run/user','/var/run','/tmp/host.sock'])assert(!fs.existsSync(target));
    `]),{encoding:'utf8'})
    assert.equal(result.status,0,result.stderr)
    assert.equal(host.exitCode,null,'Host sentinel was signalled')
    assert.equal(fs.readFileSync(outside,'utf8'),'unchanged')
    assert.equal(fs.readFileSync(path.join(work,'inside'),'utf8'),'owned')
  } finally {host.kill();await new Promise(resolve=>host.once('close',resolve));await new Promise(resolve=>server.close(resolve))}
})
test.after(()=>fs.rmSync(parent,{recursive:true,force:true}))
