import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
export function pinnedNode(){
  const version=readFileSync(new URL('../../../.node-version',import.meta.url),'utf8').trim();
  const paths=[process.env.CLI_NODE,...(process.env.PATH??'').split(delimiter).map(dir=>join(dir,'node'))];
  for(const path of paths){
    if(!path||!existsSync(path))continue;
    const binary=realpathSync(path);
    const result=spawnSync(binary,['--version'],{encoding:'utf8',timeout:10000});
    if(result.status===0&&result.stdout.trim()==='v'+version)return binary;
  }
  throw Error('CLI oracle requires pinned Node '+version+' on PATH');
}
