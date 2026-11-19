import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
if(process.env.CLI_ISOLATED!=='1')throw Error('native CLI tests require namespace isolation');
writeFileSync(join(process.env.PATH,'yt-dlp'),`#!${process.execPath}\nprocess.stdout.write('native fixture');`,{mode:0o755});
writeFileSync(join(process.env.PATH,'vidbee-desktop'),`#!${process.execPath}\n`,{mode:0o755});
const result=spawnSync(process.argv[2],['x','--bun','vitest','run','--config',process.argv[3]],{cwd:process.cwd(),env:process.env,stdio:'inherit',timeout:180000});
process.exit(result.status??1);
