import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {repo} from './isolation.mjs';
import {buildDistribution} from './distribution.mjs';
if(process.env.CLI_ISOLATED!=='1')throw Error('isolation required');
const scratch=mkdtempSync(join(tmpdir(),'cli-built-import-'));
buildDistribution(repo,scratch);
for(const target of ['index','parser/index','envelope/index']) {
  try { await import(pathToFileURL(join(scratch,'shipping/dist/library',target+'.js')));process.stdout.write(target+': import passed\n'); }
  catch(error){process.stdout.write(target+': '+error.code+' '+error.message+'\n');process.exitCode=1;}
}
