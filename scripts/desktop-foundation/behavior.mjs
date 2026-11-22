// One projection for historical and current observations. Retain every effect/value/order.
export const settingIdentity = effects => effects.flatMap(row => row[0] === 'save' ? [row[1].key] : ['language','theme','selectDirectory','selectFile'].includes(row[0]) ? [row[0]] : []).filter((key,index,keys)=>keys.indexOf(key)===index).join('+')
export function behavior(observation) {
  const result = structuredClone(observation)
  result.importEffects = result.importEffects.filter(row => !['import','host','sdk:import'].includes(row[0]))
  result.screenControls = result.screenControls.map(screen => ({ ...screen, cases: screen.cases.map(({before,effects}) => ({identity:settingIdentity(effects),before,effects})) }))
  return result
}
