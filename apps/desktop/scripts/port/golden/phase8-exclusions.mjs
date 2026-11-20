// The first comparison differed. Never record or accept a favorable retry.
// Both values and run identities: docs/effect-port/reports/8-goldens-exclusions.json.
export const PHASE8_EXCLUSIONS = new Set([
  'extension-api/request-sequence',
  'extension-api/metadata-failure',
  'cli-additions/probe-loopback',
  'cli-additions/descriptor-autostart'
])
