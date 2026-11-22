import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from '@effect/vitest'
import { createVideoAgentSession } from '../src/main/lib/agent-session'
import { resolvePiModel } from '../src/main/lib/ai-model'
import { AGENT_PERMISSION_MODES } from '../src/shared/agent-permissions'

it.each(AGENT_PERMISSION_MODES)(
  'runs an explicit skill in %s mode after a reviewer upgrade',
  async (mode) => {
    const cwd = await mkdtemp(join(tmpdir(), 'vidbee-skill-'))
    const agentDir = join(cwd, 'agent')
    const reviewerDir = join(agentDir, mode, 'extensions', 'pi-permission-auto-review')
    const reviewerConfig = join(reviewerDir, 'config.json')
    const skillPath = join(cwd, 'SKILL.md')
    try {
      await mkdir(reviewerDir, { recursive: true })
      await writeFile(reviewerConfig, JSON.stringify({ additionalPolicy: 'Old policy' }))
      await writeFile(
        skillPath,
        '---\nname: example\ndescription: Example skill\n---\nReply with the word verified.'
      )
      const chunks = [
        { delta: { role: 'assistant', content: 'verified' }, finish_reason: null },
        { delta: {}, finish_reason: 'stop' }
      ]
      const events = chunks
        .map(
          (choice) =>
            `data: ${JSON.stringify({
              id: 'test-response',
              object: 'chat.completion.chunk',
              created: 1,
              model: 'gpt-6-luna',
              choices: [{ index: 0, ...choice }]
            })}\n\n`
        )
        .join('')
      const requests: string[] = []
      const session = await createVideoAgentSession({
        cwd,
        skillPaths: [skillPath],
        history: [],
        tools: [],
        task: 'test skill',
        systemPrompt: 'Follow the selected skill.',
        model: resolvePiModel({ presetId: 'cliproxy', modelId: 'gpt-6-luna', reasoning: false }),
        thinkingLevel: 'off',
        maxRetries: 0,
        apiKey: 'test-key',
        fetch: async (_input, init) => {
          requests.push(String(init?.body))
          return new Response(`${events}data: [DONE]\n\n`, {
            headers: { 'content-type': 'text/event-stream' }
          })
        },
        signal: new AbortController().signal,
        memory: () => '',
        shouldStop: () => false,
        onSummaryUsage: () => undefined,
        permissions: {
          agentDir,
          packageRoot: fileURLToPath(new URL('../../..', import.meta.url)),
          downloadPath: cwd,
          mode,
          grants: [],
          signal: new AbortController().signal,
          requestApproval: async () => ({ approved: false, approvedPath: false }),
          onApproved: () => undefined,
          onUsage: () => undefined
        }
      })
      try {
        const config = JSON.parse(await readFile(reviewerConfig, 'utf8'))
        expect(config).not.toHaveProperty('additionalPolicy')
        expect(config).toHaveProperty('autoMode.hard_deny')
        await session.prompt('/skill:example')
        expect(requests).toHaveLength(1)
        expect(requests[0]).toContain('Reply with the word verified.')
        const reply = session.agent.state.messages.at(-1)
        expect(reply).toMatchObject({
          role: 'assistant',
          content: [{ type: 'text', text: 'verified' }]
        })
      } finally {
        await session.dispose()
      }
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  },
  20_000
)
