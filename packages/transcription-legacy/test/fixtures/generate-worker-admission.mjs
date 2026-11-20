import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
process.env.VIDBEE_REVIEW_WORKER_HELPER='1'
const {admissionModes,observeWorkerAdmission}=await import('../review-worker-admission.node.ts')
const results={}
for(const mode of admissionModes)results[mode]=await observeWorkerAdmission(mode,['--import',fileURLToPath(new URL('../../../../node_modules/tsx/dist/loader.mjs',import.meta.url)),resolve(process.argv[2],'worker.cjs')])
const bytes=JSON.stringify(results,null,2)+'\n'
if(bytes!==readFileSync(new URL('./review-worker-admission.json',import.meta.url),'utf8'))throw new Error('Old worker admission regeneration differs')
console.log('4 old worker admission scenarios: identical bytes')
