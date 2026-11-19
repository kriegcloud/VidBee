import {mkdtempSync,mkdirSync,cpSync,readFileSync,writeFileSync,symlinkSync,readdirSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {repo} from './isolation.mjs';
import {buildDistribution} from './distribution.mjs';
if(process.env.CLI_ISOLATED!=='1')throw Error('isolation required');
const scratch=mkdtempSync(join(tmpdir(),'cli-declaration-consumer-'));
buildDistribution(repo,scratch);
const consumer=join(scratch,'consumer'),modules=join(consumer,'node_modules'),pkg=join(modules,'@vidbee/cli');mkdirSync(pkg,{recursive:true});
cpSync(join(scratch,'shipping/dist'),join(pkg,'dist'),{recursive:true});
const metadata=JSON.parse(readFileSync(join(repo,'apps/cli/package.json'),'utf8'));metadata.exports=metadata.publishConfig.exports;
writeFileSync(join(pkg,'package.json'),JSON.stringify(metadata));
for(const name of readdirSync(join(repo,'node_modules'))){
  if(name.startsWith('.'))continue;
  if(name==='@vidbee'){
    for(const child of readdirSync(join(repo,'node_modules',name)))if(child!=='cli')symlinkSync(join(repo,'node_modules',name,child),join(modules,name,child));
  }else symlinkSync(join(repo,'node_modules',name),join(modules,name));
}
copyFileSync(join(repo,'scripts/cli/fixtures/declaration-consumer.mts'),join(consumer,'consumer.mts'));
writeFileSync(join(consumer,'tsconfig.json'),JSON.stringify({compilerOptions:{module:'NodeNext',moduleResolution:'NodeNext',target:'ES2022',strict:true,exactOptionalPropertyTypes:true,skipLibCheck:true,noEmit:true,types:['node']},files:['consumer.mts']}));
const compiler=join(dirname(fileURLToPath(import.meta.resolve('tsrs/package.json'))),'bin/tsrs');
const result=spawnSync(process.execPath,[compiler,'-p',join(consumer,'tsconfig.json')],{cwd:consumer,encoding:'utf8',timeout:30000});
process.stdout.write(result.stdout+result.stderr);process.stdout.write(`external declaration consumer: ${result.status}\n`);process.exitCode=result.status??1;
