export function sourcePolicy(available, env) {
  if (available) return 'contained'
  if (env.VIDBEE_REQUIRE_CONTAINMENT === '1') throw Error('Source containment required; refusing candidate execution at outer probe')
  if (env.GITHUB_ACTIONS === 'true' || env.VIDBEE_FOUNDATION_UNCONTAINED === '1') return 'uncontained'
  throw Error('Source containment unavailable; refusing candidate execution at outer probe. Explicit diagnostic opt-in: VIDBEE_FOUNDATION_UNCONTAINED=1')
}
