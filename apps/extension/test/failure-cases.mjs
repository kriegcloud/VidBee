const url = 'https://example.invalid/watch'
export const scenarios = [
  ...['read', 'pending', 'ready', 'error', 'icon'].map(failure => ({ failure })),
  ...[undefined, null, false, 0, '', true, 1, 'x', [], [null], { nullEntry: null }, { old: { fetchedAt: '0' }, missing: {}, bool: { fetchedAt: false } }].map(map => ({ map, engine: true })),
  ...[null, false, 0, 7, 'entry', {}, { status: 'ready' }, { status: 'ready', fetchedAt: 1700000000000, info: null }, { status: 'ready', fetchedAt: 1700000000000, url: false }, { status: 'unknown', fetchedAt: 1700000000000 }].map(value => ({ map: { [url]: value }, engine: true }))
]
