import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
const hash=(text:string)=>createHash('sha256').update(text).digest('hex')
test('review: unchanged old observations and exact Before the port trace remain reviewable',()=>{
 const rows:Array<{module:string;name:string;args:unknown;expected:unknown}>=JSON.parse(readFileSync(new URL('./fixtures/review-pure-oracle.json',import.meta.url),'utf8'))
 const payload=rows.slice(0,21191).map(({module,name,args,expected})=>({module,name,args,expected}))
 assert.equal(hash(JSON.stringify(payload)),'6c77175e11e6438cf8cfc0ba545ce0f3724ec5561c764ed404f9537c4093454f','original pinned-Node observations must remain unchanged')
 const source=readFileSync(new URL('./characterization-cloud.test.ts',import.meta.url),'utf8')
 const marker='/* Before the port: exact recorded combined expectation retained verbatim.\n'
 const start=source.indexOf(marker)
 assert.ok(start>=0,'old trace must remain beside the declared rejection')
 const end=source.indexOf('\n  */',start)
 assert.equal(hash(source.slice(start+marker.length,end)),'e9f1ac6b6f8f9958dfc766b69856c4ead7dda659dad1007a09706f4d29040c6c','exact de1a8b6 snapshot trace')
})
