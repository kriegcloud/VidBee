import {spawnSync} from 'node:child_process';
import {dirname} from 'node:path';
if(process.env.CLI_ISOLATED!=='1')throw Error('goldens require the outer CLI namespace');
// The whole existing golden harness inherits the private PID/mount/network
// namespaces and masked owner paths. Its own launchers add fixture namespaces.
const env={...process.env,VIDBEE_GOLDEN_REFERENCE:process.argv.includes('--update')?'1':'0',PATH:dirname(process.execPath)+':/usr/bin:/bin'};
const result=spawnSync(process.execPath,['apps/desktop/scripts/port/golden/run.mjs','--scratch',process.argv[2],...process.argv.slice(3)],{cwd:process.cwd(),env,encoding:'utf8',timeout:1200000,maxBuffer:64*1024*1024});
process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');
if(result.error)process.stderr.write(String(result.error)+'\n');
process.exitCode=result.status??1;
