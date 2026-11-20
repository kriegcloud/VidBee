import * as old from '../../../fixtures/cli-pre-port/library.mjs';
import {observe,encode} from './pure-vectors.mjs';
import {writeFileSync} from 'node:fs';
if(process.env.CLI_ISOLATED!=='1')throw Error('isolation required');
const cyclic={};cyclic.self=cyclic;
writeFileSync(new URL('../../../fixtures/cli-pre-port/encoding-results.json',import.meta.url),JSON.stringify([1n,cyclic].map(result=>encode(observe(old,{fn:'renderEnvelope',args:[{ok:true,mode:'subcommand',subcommand:'fixture',result}]}))),null,2)+'\n');
