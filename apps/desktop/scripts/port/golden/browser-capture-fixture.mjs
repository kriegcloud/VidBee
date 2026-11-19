import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const profileFixtures = [
  [
    'onlyfans',
    'synthetic_creator',
    { username: 'synthetic_creator', profileUrl: 'https://onlyfans.com/synthetic_creator' }
  ],
  ...['messages', 'gallery', 'opened', 'purchased', 'photos', 'videos'].map((route) => [
    'onlyfans',
    route === 'messages' ? '12345' : `12345-${route}`,
    {
      username: '12345',
      chatId: '12345',
      ...(route === 'messages' ? {} : { chatRoute: route }),
      profileUrl: `https://onlyfans.com/my/chats/chat/12345${route === 'messages' ? '' : `/gallery${route === 'gallery' ? '' : `/${route}`}`}`
    }
  ]),
  ...['all', 'photos', 'videos', 'posts', 'messages'].map((route) => [
    'onlyfans',
    `purchased-67890-${route}`,
    {
      username: '67890',
      purchasedUserId: '67890',
      purchasedRoute: route,
      profileUrl: `https://onlyfans.com/my/collections/user-lists/purchased/posts/67890${{ all: '', photos: '?postType=photos', videos: '?postType=videos', posts: '?entityType=posts', messages: '?entityType=messages' }[route]}`
    }
  ]),
  [
    'fansly',
    'synthetic_creator',
    { username: 'synthetic_creator', profileUrl: 'https://fansly.com/synthetic_creator' }
  ]
]

export async function buildBrowserCaptureFixture(profileDir, build, command) {
  for (const [site, key, identity] of profileFixtures) {
    const directory = path.join(profileDir, `${site}-profiles`)
    await mkdir(directory, { recursive: true })
    await writeFile(
      path.join(directory, `${key}.json`),
      JSON.stringify({
        ...identity,
        state: 'mapping',
        updatedAt: 1_735_689_600_000,
        pages: 3,
        unknownFixtureKey: 'must be stripped',
        items: [
          {
            id: '1001',
            postId: '2001',
            category: 'videos',
            state: 'available',
            unknownItemKey: true
          },
          { id: '1002', postId: '2002', category: 'photos', state: 'locked', downloaded: false },
          { id: '1003', postId: '2003', category: 'videos', state: 'drm', downloaded: false }
        ]
      })
    )
    await writeFile(path.join(directory, 'unreadable.json'), '{invalid synthetic JSON')
  }
  const directory = path.join(profileDir, 'browser-capture-fixtures')
  await mkdir(directory, { recursive: true })
  const ffmpeg = path.join(build, 'resources/resources/ffmpeg/ffmpeg')
  for (const [name, size, audio] of [
    ['landscape', '320x180', true],
    ['portrait', '180x320', true],
    ['silent', '320x180', false]
  ]) {
    await command(ffmpeg, [
      '-nostdin',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=${size}:rate=24:duration=24`,
      ...(audio ? ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=24'] : []),
      '-map_metadata',
      '-1',
      '-c:v',
      'libx264',
      '-threads',
      '1',
      ...(audio ? ['-c:a', 'aac'] : ['-an']),
      '-movflags',
      '+faststart',
      path.join(directory, `${name}.mp4`)
    ])
  }
}
