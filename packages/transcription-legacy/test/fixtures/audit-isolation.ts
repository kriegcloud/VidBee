import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Every suite gets a private home and inert desktop endpoints. Children inherit it.
// Keep this before case setup so ambient developer overrides never select real runtimes.
const root=mkdtempSync(join(tmpdir(),'vidbee-audit-isolation-'))
const keys=['HOME','XDG_CONFIG_HOME','XDG_CACHE_HOME','XDG_DATA_HOME','XDG_RUNTIME_DIR','DBUS_SESSION_BUS_ADDRESS','PULSE_SERVER','PIPEWIRE_REMOTE','DISPLAY','WAYLAND_DISPLAY','NODE_OPTIONS','VIDBEE_TRANSCRIPTION_FORCE_LAYER','VIDBEE_TRANSCRIPTION_NODE','VIDBEE_BUNDLED_NODE','VIDBEE_DOWNLOAD_MIRROR']
const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]))
for(const key of keys.filter(key=>key.startsWith('VIDBEE_')))delete process.env[key]
for(const [key,directory] of [['HOME','home'],['XDG_CONFIG_HOME','config'],['XDG_CACHE_HOME','cache'],['XDG_DATA_HOME','data'],['XDG_RUNTIME_DIR','runtime']]){const path=join(root,directory!);mkdirSync(path,{mode:0o700});process.env[key!]=path}
process.env.DBUS_SESSION_BUS_ADDRESS=`unix:path=${join(root,'no-session-bus')}`
process.env.PULSE_SERVER=`unix:${join(root,'no-audio-server')}`
process.env.PIPEWIRE_REMOTE=join(root,'no-pipewire')
delete process.env.DISPLAY;delete process.env.WAYLAND_DISPLAY
const preload=new URL('./audit-network.cjs',import.meta.url).pathname
process.env.NODE_OPTIONS=`--require=${preload}`
// Bun hosts Vitest, so install the same network boundary in this interpreter too.
createRequire(import.meta.url)('./audit-network.cjs')
export const releaseAuditIsolation=()=>{for(const key of keys){const value=saved[key];if(value===undefined)delete process.env[key];else process.env[key]=value}rmSync(root,{recursive:true,force:true})}
process.once('exit',()=>rmSync(root,{recursive:true,force:true}))
