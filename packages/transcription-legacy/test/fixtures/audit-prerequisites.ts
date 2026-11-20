import { spawnSync } from 'node:child_process'
// Probe capabilities rather than assuming GNU tar or the caller's installed tools.
export const tarSkipReason = (() => {
  for (const [command,args] of [['tar',['--version']],['bzip2',['--help']]] as const) {
    const probe=spawnSync(command,[...args],{encoding:'utf8',timeout:10000})
    if(probe.error || probe.status!==0) return `requires bzip2-capable tar: ${command} unavailable`
  }
  return false
})()
