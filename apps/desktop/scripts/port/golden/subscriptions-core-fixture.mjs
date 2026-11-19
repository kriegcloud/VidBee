import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const origin = '{{ORIGIN}}'
const rssItem = (id, title, day, family) =>
  `<item><guid isPermaLink="false">${family}-${id}</guid><title>${title}</title><link>${origin}/subscriptions-core/${family}-${id}.mp4</link><pubDate>${day} Jan 2025 12:00:00 GMT</pubDate><enclosure url="${origin}/subscriptions-core/cover.png" type="image/png" length="68"/></item>`
const rss = (family, revision) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>Loopback ${family} ${revision}</title><link>${origin}/subscriptions-core/site</link><description>Synthetic subscription fixture</description><image><url>${origin}/subscriptions-core/cover.png</url><title>Loopback cover</title><link>${origin}/subscriptions-core/site</link></image>${rssItem('retained', 'River retained', '02', family)}${revision === 'A' ? rssItem('dropped', 'Forest dropped', '01', family) : rssItem('newer', 'Mountain newer', '03', family)}</channel></rss>`

/** Generate fixed XML/HTML inputs without importing application implementation. */
export async function buildSubscriptionsFixture(profileDir) {
  const directory = path.join(profileDir, 'subscriptions-core-fixtures')
  await mkdir(directory, { recursive: true })
  const documents = {
    'rss-a.xml': rss('manual', 'A'),
    'rss-b.xml': rss('manual', 'B'),
    'auto.xml': rss('automatic', 'A'),
    'pending.xml': rss('pending', 'A')
      .replaceAll(
        `${origin}/subscriptions-core/pending-retained.mp4`,
        `${origin}/slow-subscription-retained.mp4`
      )
      .replaceAll(
        `${origin}/subscriptions-core/pending-dropped.mp4`,
        `${origin}/slow-subscription-dropped.mp4`
      ),
    'atom.xml': `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Loopback Atom</title><id>urn:loopback:atom</id><updated>2025-01-02T12:00:00Z</updated>${['02', '01'].map((day, index) => `<entry><id>urn:loopback:atom:${index + 1}</id><title>Atom item ${index + 1}</title><link href="${origin}/subscriptions-core/atom-${index + 1}.mp4"/><updated>2025-01-${day}T12:00:00Z</updated><published>2025-01-${day}T12:00:00Z</published></entry>`).join('')}</feed>`,
    'discovery.html':
      '<!doctype html><html><head><title>Loopback discovery</title><link rel="alternate" type="application/rss+xml" href="../rss.xml"><link rel="alternate" type="application/rss+xml" href="../rss.xml"><link rel="alternate" type="application/atom+xml" href="javascript:invalid"><link rel="alternate" type="application/rss+xml" href="http://user:secret@127.0.0.1/credentials"><link rel="alternate" type="application/atom+xml" href="../atom.xml"><link rel="alternate" type="application/rss+xml" href="../candidate-1.xml"><link rel="alternate" type="application/rss+xml" href="../candidate-2.xml"></head><body>Synthetic discovery</body></html>',
    'invalid.xml': '<rss><broken></rss>',
    'failed-discovery.html':
      '<html><head><link rel="alternate" type="application/rss+xml" href="candidate-1.xml"><link rel="alternate" type="application/rss+xml" href="candidate-1.xml"><link rel="alternate" type="application/rss+xml" href="file:///invalid"><link rel="alternate" type="application/rss+xml" href="http://user:secret@127.0.0.1/credentials"><link rel="alternate" type="application/rss+xml" href="candidate-2.xml"><link rel="alternate" type="application/rss+xml" href="candidate-3.xml"><link rel="alternate" type="application/rss+xml" href="candidate-4.xml"></head><body>Not a feed</body></html>'
  }
  for (const [name, document] of Object.entries(documents)) {
    await writeFile(path.join(directory, name), document)
  }
  return directory
}
