import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function buildPhase8Fixture(profile) {
  const directory = path.join(profile, 'phase8-fixtures')
  await mkdir(directory, { recursive: true })
  await writeFile(
    path.join(directory, 'page.html'),
    `<!doctype html>
<html><head><title>Golden extension media</title>
<meta property="og:title" content="Golden extension media">
<meta property="og:image" content="{{ORIGIN}}/phase8/thumbnail.png">
</head><body><video controls poster="{{ORIGIN}}/phase8/thumbnail.png">
<source src="{{ORIGIN}}/phase8/video.mp4" type="video/mp4"></video></body></html>\n`
  )
}
