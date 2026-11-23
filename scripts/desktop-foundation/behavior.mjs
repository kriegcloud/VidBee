// One projection for historical and current observations. Retain every effect/value/order.
export const settingIdentity = effects => effects.flatMap(row => row[0] === 'save' ? [row[1].key] : ['language','theme','selectDirectory','selectFile'].includes(row[0]) ? [row[0]] : []).filter((key,index,keys)=>keys.indexOf(key)===index).join('+')
export function behavior(observation) {
  const result = structuredClone(observation)
  result.importEffects = result.importEffects.filter(row => !['import','host','sdk:import'].includes(row[0]))
  result.screenControls = result.screenControls.map(screen => ({ ...screen, cases: screen.cases.map(({before,effects}) => ({identity:settingIdentity(effects),before,effects})) }))
  // Historical tuples carry an ordinal; actual tuples carry the adapter's
  // semantic identity and retain the ordinal only as a third diagnostic field.
  const updates = (rows, identity) => rows.map(([state, value]) => [typeof state === 'number' ? identity : state, value])
  result.lifecycle.title.updates = updates(result.lifecycle.title.updates, 'window.isMaximized')
  for (const item of result.lifecycle.appInfo) item.updates = updates(item.updates, 'app.metadata')
  for (const item of result.lifecycle.share) item.updates = updates(item.updates, 'share.platform')
  return result
}
