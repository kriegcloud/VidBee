import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
export async function buildInputs(build) {
  const result={}
  async function visit(relative) {
    const file=path.join(build,relative),stat=await fs.lstat(file)
    if(stat.isDirectory())for(const name of (await fs.readdir(file)).sort())await visit(path.join(relative,name))
    else if(stat.isSymbolicLink())result[relative]={link:await fs.readlink(file)}
    else result[relative]=createHash('sha256').update(await fs.readFile(file)).digest('hex')
  }
  for(const name of (await fs.readdir(build)).sort())await visit(name)
  return result
}
