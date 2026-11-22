import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root=process.cwd()
const parent=path.join(root,'tooling/standards/.cache')
fs.mkdirSync(parent,{recursive:true})
const directory=fs.mkdtempSync(path.join(parent,'shared-examples-'))
try {
 const files=[]
 const visit=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?visit(path.join(dir,entry.name)):entry.name.endsWith('.ts')?[path.join(dir,entry.name)]:[])
 for(const file of visit('apps/desktop/src/shared')){
  if(file.endsWith('/types/ipc.ts'))continue
  const source=fs.readFileSync(file,'utf8')
  if(/@(?:example|remarks)\b/.test(source))throw new Error(`Legacy documentation carrier in ${file}`)
  for(const block of source.matchAll(/\/\*\*[\s\S]*?\*\//g)){
   const doc=block[0].replace(/^\s*\* ?/gm,'')
   for(const match of doc.matchAll(/```ts\n([\s\S]*?)```/g)){
    if(!doc.slice(0,match.index).includes('**Example** ('))throw new Error(`Untitled example in ${file}`)
    const code=match[1].replace(/(from\s*['"])(\.[^'"]+)(['"])/g,(_all,a,module,b)=>a+path.resolve(path.dirname(file),module)+b)
    const output=path.join(directory,`example-${files.length}.ts`)
    fs.writeFileSync(output,code);files.push(output)
   }
  }
 }
 const config=path.join(directory,'tsconfig.json')
 fs.writeFileSync(config,JSON.stringify({extends:path.join(root,'tsconfig.base.json'),compilerOptions:{module:'esnext',moduleResolution:'bundler',rootDir:root,noEmit:true,composite:false,incremental:false,lib:['ESNext','DOM'],typeRoots:[path.join(root,'node_modules/@types')],types:['node']},files:[...files,path.join(root,'node_modules/vite/client.d.ts')],include:[]}))
 const result=spawnSync('bunx',['--bun','tsc','--noEmit','-p',config],{stdio:'inherit'})
 if(result.status!==0)throw new Error(`Shared documentation examples failed (${result.status})`)
 console.log(`Compiled ${files.length} titled shared examples`)
} finally {fs.rmSync(directory,{recursive:true,force:true})}
