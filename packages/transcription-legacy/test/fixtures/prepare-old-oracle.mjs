// Usage: node prepare-old-oracle.mjs <disk scratch> [git revision=frozen pre-port commit]
// Extract unchanged source; bundle only relative imports and keep workspace dependencies external.
import {execFileSync} from 'node:child_process'
import {mkdirSync,symlinkSync,readdirSync,writeFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
const repo=fileURLToPath(new URL('../../../../',import.meta.url))
const scratch=resolve(process.argv[2]);const revision=process.argv[3]??'9dab889b0b1d5328721802d65699a5f8593bf2e2'
mkdirSync(scratch,{recursive:true})
writeFileSync(join(scratch,'package.json'),JSON.stringify({type:'module'}))
writeFileSync(join(scratch,'source.tar'),execFileSync('git',['archive',revision,'packages/transcription/src'],{cwd:repo,maxBuffer:32*1024*1024}))
execFileSync('/usr/bin/tar',['-xf',join(scratch,'source.tar'),'-C',scratch],{stdio:'inherit'})
try{symlinkSync(join(repo,'node_modules'),join(scratch,'node_modules'),'dir')}catch(error){if(error.code!=='EEXIST')throw error}
const require=createRequire(new URL('../../../../apps/desktop/package.json',import.meta.url))
const {build}=require('esbuild')
const src=join(scratch,'packages/transcription/src');const modules=join(scratch,'modules');mkdirSync(modules,{recursive:true})
for(const entry of readdirSync(src,{recursive:true}).filter(name=>name.endsWith('.ts'))){
 mkdirSync(resolve(modules,entry,'..'),{recursive:true})
 await build({entryPoints:[join(src,entry)],outfile:join(modules,entry.replace(/\.ts$/,'.js')),bundle:true,packages:'external',platform:'node',format:'esm',logLevel:'silent'})
}
await build({entryPoints:[join(src,'index.ts')],outfile:join(scratch,'old.mjs'),bundle:true,packages:'external',platform:'node',format:'esm',logLevel:'silent'})
await build({entryPoints:[join(src,'worker/entry.ts')],outfile:join(scratch,'worker.cjs'),bundle:true,packages:'external',platform:'node',format:'cjs',logLevel:'silent'})
