import { languageList, languages, normalizeLanguageCode } from '@vidbee/i18n/languages'
import { $DesktopId } from '@vidbee/identity/packages'
import * as A from 'effect/Array'
import * as HM from 'effect/HashMap'
import * as HS from 'effect/HashSet'
import * as O from 'effect/Option'
import * as Order from 'effect/Order'
import * as P from 'effect/Predicate'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'
import * as Sparse from './ArrayHelpers.js'
import { AiPrompt } from './ai-types'
import { BUILTIN_SKILLS } from './builtin-skills'
import { recordFunction } from './RecordFunction.js'

const $I = $DesktopId.create('shared/ai-prompts')
/** Replaced with the current UI language name before a prompt is shown or sent.
 *
 * **Example** (Access the AI_PROMPT_UI_LANGUAGE_TOKEN contract)
 *
 * ```ts
 * import { AI_PROMPT_UI_LANGUAGE_TOKEN } from './ai-prompts.js'
 * void AI_PROMPT_UI_LANGUAGE_TOKEN
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const AI_PROMPT_UI_LANGUAGE_TOKEN = '{{uiLanguage}}'
interface AiPromptPresetSeed {
  name: string
  description: string
  content: string
}

/** Shared Markdown hygiene appended to every built-in prompt. */
const PRESET_FORMAT_RULES =
  'Keep each list marker on the same line as the item text. Do not wrap the whole reply in a code fence. Do not add a preamble, closing remarks, or a heading that restates the task. Use the same language as the transcript.'

/** Previous official Overview seed, retained only to upgrade unedited saved presets. */
const LEGACY_OVERVIEW_CONTENT = A.join(
  [
    'Write a structural overview of this transcript with chapters and key quotes.',
    '',
    'Each transcript line starts with [m:ss] or [h:mm:ss]. Duration is given when known. Chapters must cover the whole timeline from start to finish. If Duration is given, the last chapter must start after 75% of that duration. Use only timestamps that appear in the transcript. Do not invent timestamps or use 0:00 unless that line exists.',
    '',
    "Include 3-5 key quotes that are surprising, contrarian, memorable, or statistically striking. Quotes must be the speaker's words. Clean filler and transcription errors, but keep their voice.",
    '',
    'Output format:',
    '# {one-sentence takeaway}',
    '## Chapters',
    '- **{m:ss}** {title} — {what this section covers}',
    '## Key quotes',
    '- **{m:ss}** "{quote}"',
    '',
    'Use unordered lists only. Keep each bullet to one or two sentences. Skip empty sections.',
    PRESET_FORMAT_RULES
  ],
  '\n'
)

/** Built-in Overview prompt, pinned beside the transcript tab.
 *
 * **Example** (Access the AI_OVERVIEW_PROMPT_ID contract)
 *
 * ```ts
 * import { AI_OVERVIEW_PROMPT_ID } from './ai-prompts.js'
 * void AI_OVERVIEW_PROMPT_ID
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const AI_OVERVIEW_PROMPT_ID = 'overview'

/** Built-in skills shown in the transcript sidebar until the user chooses otherwise. */
const DEFAULT_TRANSCRIPT_SIDEBAR_SKILLS = HS.fromIterable([
  AI_OVERVIEW_PROMPT_ID,
  'generate-faq',
  'create-mindmap'
])

/** Freeform Agent conversation started from New chat, not shown as a prompt tab.
 *
 * **Example** (Access the AI_CHAT_PROMPT_ID contract)
 *
 * ```ts
 * import { AI_CHAT_PROMPT_ID } from './ai-prompts.js'
 * void AI_CHAT_PROMPT_ID
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const AI_CHAT_PROMPT_ID = 'chat'

/** Instruction used when the user starts an empty Agent conversation. */
const AGENT_CHAT_CONTENT = A.join(
  [
    'Answer the user about this video.',
    'Use tools when you need transcript evidence, timestamps, screenshots, or clips.',
    'Do not invent quotes or timestamps.',
    'Conversation titles are derived automatically. Use rename_conversation only when the user asks to change the title.',
    'Follow the user’s requested output language; otherwise reply in the language of their latest message. Use {{uiLanguage}} only when the user’s language cannot be determined.'
  ],
  '\n'
)

/**
 * Virtual prompt for a blank Agent chat. It is not stored in settings.
 *
 * @param now Timestamp written onto createdAt and updatedAt.
 */
function agentChatPromptBody(now: number, hasSource = true): AiPrompt {
  return {
    name: 'chat',
    content: hasSource
      ? AGENT_CHAT_CONTENT
      : A.join(
          [
            'Help the user with their request. No video or transcript is initially attached. Use select_video to attach completed library media; later application state identifies the selected source.',
            'Use the available tools when helpful. Do not invent source evidence or tool results.',
            'Conversation titles are derived automatically. Use rename_conversation only when the user asks to change the title.',
            'Follow the user’s requested output language; otherwise reply in the language of their latest message. Use {{uiLanguage}} only when the user’s language cannot be determined.'
          ],
          '\n'
        ),
    isPreset: true,
    sortOrder: -1,
    createdAt: now,
    updatedAt: now
  }
}

/**
 * Default transcript skills authored in the repository library. `{{uiLanguage}}` is replaced
 * with the current interface language name before a prompt is shown or sent.
 *
 * **Example** (Access the AI_PROMPT_PRESETS contract)
 *
 * ```ts
 * import { AI_PROMPT_PRESETS } from './ai-prompts.js'
 * void AI_PROMPT_PRESETS
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const AI_PROMPT_PRESETS: readonly AiPromptPresetSeed[] = A.sort(
  Sparse.filter({
    items: BUILTIN_SKILLS,
    predicate: (skill) => !['article-rewrite', 'faq', 'diagnose-task'].includes(skill.name)
  }),
  Order.make<AiPromptPresetSeed>((left, right) => {
    const difference =
      Number(right.name === AI_OVERVIEW_PROMPT_ID) - Number(left.name === AI_OVERVIEW_PROMPT_ID)
    return difference < 0 ? -1 : difference > 0 ? 1 : 0
  })
)
const PRESET_NAMES = HS.fromIterable(
  Sparse.map({
    items: AI_PROMPT_PRESETS,
    map: (prompt) => prompt.name
  })
)
const PRESET_SEED_BY_NAME = HM.fromIterable<string, AiPromptPresetSeed>(
  Sparse.map({
    items: AI_PROMPT_PRESETS,
    map: (preset) => [preset.name, preset]
  })
)

/** Built-in prompts that should no longer be seeded or restored. */
const DEPRECATED_PRESET_NAMES = HS.fromIterable([
  'extract-questions',
  'highlight-key-points',
  'identify-emotions',
  'split-paragraphs'
])

/** Format rules used by the first structured official bodies. */
const SUPERSEDED_FORMAT_RULES =
  'Keep each list marker on the same line as the item text. Do not wrap the whole reply in a code fence. Do not add a preamble or closing remarks. Use the same language as the transcript.'

/** Older official bodies that should be replaced with the current seed. */
const SUPERSEDED_PRESET_CONTENT: Record<string, readonly string[]> = {
  overview: [LEGACY_OVERVIEW_CONTENT],
  'bullet-points': [
    'Turn this transcript into a bullet point summary. Group related points. Keep each bullet short and easy to scan. Use the same language as the transcript.',
    A.join(
      [
        'Turn this transcript into a scannable bullet summary.',
        '',
        'Output format:',
        '# {title}',
        '## {theme}',
        '- {point}',
        '',
        'Group related points under ## headings. Use unordered lists only. Keep each bullet to one sentence. Skip empty sections.',
        SUPERSEDED_FORMAT_RULES
      ],
      '\n'
    )
  ],
  'improve-grammar': [
    'Correct grammar, spelling, and punctuation so the transcript reads naturally and professionally. Keep the original meaning, speakers, and details. Do not add new facts. Use the same language as the transcript.',
    A.join(
      [
        'Correct grammar, spelling, and punctuation so the transcript reads naturally and professionally. Keep the original meaning, speakers, and details. Do not add new facts.',
        '',
        'Output format:',
        '# {title}',
        '## {speaker or topic}',
        '{cleaned paragraphs}',
        '',
        'Use ## headings for speaker changes or topic shifts. Write cleaned prose in paragraphs. Use an unordered or ordered list only when the original content is already a list.',
        SUPERSEDED_FORMAT_RULES
      ],
      '\n'
    )
  ],
  'generate-faq': [
    'Generate a FAQ from this transcript. Write clear questions and concise answers grounded only in the transcript. If the transcript does not contain an answer, say so. Use the same language as the transcript.',
    A.join(
      [
        'Generate a FAQ from this transcript. Write clear questions and concise answers grounded only in the transcript. If the transcript does not contain an answer, say so.',
        '',
        'Output format:',
        '# FAQ',
        '## {question}',
        '{answer}',
        '',
        'Use one ## heading per question. Put the answer as a short paragraph, or as an unordered list when there are several parts. Do not number the questions.',
        SUPERSEDED_FORMAT_RULES
      ],
      '\n'
    )
  ],
  'extract-statistics': [
    'Extract numbers, percentages, amounts, dates, and growth rates from this transcript. Present them as a Markdown table with columns for the statistic, what it refers to, and the surrounding context. If none are found, say so. Use the same language as the transcript.',
    A.join(
      [
        'Extract numbers, percentages, amounts, dates, and growth rates from this transcript.',
        '',
        'Output format:',
        '# Statistics',
        '## Highlights',
        '- {statistic} — {what it refers to}',
        '## Details',
        '| Statistic | Refers to | Context |',
        '| --- | --- | --- |',
        '| ... | ... | ... |',
        '',
        'Use an unordered list for highlights and a Markdown table for details. If none are found, say so under # Statistics.',
        SUPERSEDED_FORMAT_RULES
      ],
      '\n'
    )
  ],
  'paraphrase-content': [
    'Paraphrase this transcript in a clear, natural style while keeping the original meaning. Do not add claims that are not in the source. Use the same language as the transcript.',
    A.join(
      [
        'Paraphrase this transcript in a clear, natural style while keeping the original meaning. Do not add claims that are not in the source.',
        '',
        'Output format:',
        '# {title}',
        '## {section}',
        '{paraphrased paragraphs}',
        '',
        'Use ## headings for topic shifts. Prefer short paragraphs. Use an unordered list for parallel takeaways and an ordered list for steps or ranked items.',
        SUPERSEDED_FORMAT_RULES
      ],
      '\n'
    )
  ],
  'create-mindmap': [
    'Organize this transcript into a hierarchical mind map. Reply with nested Markdown lists only: a root topic, then branches, then leaves. Keep labels short. Use the same language as the transcript.',
    A.join(
      [
        'Organize this transcript into a hierarchical mind map.',
        '',
        'Output format:',
        '# {root topic}',
        '- {branch}',
        '  - {leaf}',
        '  - {leaf}',
        '- {branch}',
        '  - {leaf}',
        '',
        'Use a # title and nested unordered lists only. Keep labels short. Do not use numbered lists or extra commentary.',
        SUPERSEDED_FORMAT_RULES
      ],
      '\n'
    ),
    A.join(
      [
        'Organize this transcript into a hierarchical mind map.',
        '',
        'Output format:',
        '# {root topic}',
        '- {branch}',
        '  - {leaf}',
        '  - {leaf}',
        '- {branch}',
        '  - {leaf}',
        '',
        'Use a # heading for the root topic and nested unordered lists for branches. Keep labels short. Do not use numbered lists, extra commentary, or a Mindmap title.',
        PRESET_FORMAT_RULES
      ],
      '\n'
    )
  ]
}

/**
 * Native name of a VidBee UI language, used inside built-in prompts.
 *
 * @param languageCode Saved or i18n language tag.
 *
 * **Example** (Access the aiPromptUiLanguageName contract)
 *
 * ```ts
 * import { aiPromptUiLanguageName } from './ai-prompts.js'
 * void aiPromptUiLanguageName
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const aiPromptUiLanguageName = (languageCode: string): string =>
  languages[normalizeLanguageCode(languageCode)].name

/**
 * Replace {{uiLanguage}} with the current interface language name.
 *
 * @param content Prompt body from storage.
 * @param languageCode Saved or i18n language tag.
 */
function resolveAiPromptContentBody(content: string, languageCode: string): string {
  return Str.replaceAll(AI_PROMPT_UI_LANGUAGE_TOKEN, aiPromptUiLanguageName(languageCode))(content)
}

/**
 * Keep {{uiLanguage}} in storage when the user saved a resolved built-in body
 * without otherwise editing it, so a later language switch still applies.
 *
 * @param promptId Prompt id from storage.
 * @param content Prompt body from the editor.
 */
function canonicalizeAiPromptContentBody(promptId: string, content: string): string {
  const seed = O.getOrUndefined(HM.get(PRESET_SEED_BY_NAME, promptId))
  if (seed === undefined || content === seed.content) {
    return content
  }
  const matchesSeed = A.some(
    languageList,
    (language) => content === resolveAiPromptContentBody(seed.content, language.value)
  )
  return matchesSeed ? seed.content : content
}

/**
 * True when a skill name ships with VidBee.
 *
 * @param name Standard skill name from storage or the UI.
 *
 * **Example** (Access the isAiPromptPresetName contract)
 *
 * ```ts
 * import { isAiPromptPresetName } from './ai-prompts.js'
 * void isAiPromptPresetName
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const isAiPromptPresetName = (name: string): boolean => HS.has(PRESET_NAMES, name)

/** Localize built-in metadata while keeping the standard name as the sole skill identifier. */
function localizedSkillField(
  prompt: Pick<AiPrompt, 'name' | 'isPreset' | 'description'>,
  field: 'name' | 'description',
  translate?: (key: string) => string
): string {
  const fallback = field === 'name' ? prompt.name : (prompt.description ?? '')
  if (
    !(
      P.isTruthy(prompt.isPreset) &&
      translate !== undefined &&
      P.isTruthy(translate) &&
      A.some(BUILTIN_SKILLS, (skill) => skill.name === prompt.name)
    )
  ) {
    return fallback
  }
  const key = `settings.ai.presetSkills.${prompt.name}.${field}`
  const translated = translate(key)
  return translated === key ? fallback : translated
}

/** Show a localized built-in name without introducing another authored name or identifier. */
function aiPromptLabelBody(
  prompt: Pick<AiPrompt, 'name' | 'isPreset' | 'description'>,
  translate?: (key: string) => string
): string {
  return localizedSkillField(prompt, 'name', translate)
}

/** Show localized built-in discovery descriptions in the skill library and composer. */
function aiPromptDescriptionBody(
  prompt: Pick<AiPrompt, 'name' | 'isPreset' | 'description'>,
  translate?: (key: string) => string
): string {
  return localizedSkillField(prompt, 'description', translate)
}

/**
 * Build the default prompt list used on first launch.
 *
 * @param now Timestamp written onto createdAt/updatedAt.
 *
 * **Example** (Access the createDefaultAiPrompts contract)
 *
 * ```ts
 * import { createDefaultAiPrompts } from './ai-prompts.js'
 * void createDefaultAiPrompts
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const createDefaultAiPrompts = (now: number): AiPrompt[] =>
  Sparse.map({
    items: AI_PROMPT_PRESETS,
    map: (preset, index) => ({
      name: preset.name,
      description: preset.description,
      content: preset.content,
      autoRun: false,
      isPreset: true,
      sortOrder: index,
      createdAt: now,
      updatedAt: now
    })
  })

/**
 * Drop retired icon settings and refresh unedited built-in prompt bodies.
 *
 * @param stored Prompt loaded from storage.
 * @param now Timestamp written onto updatedAt when the body changes.
 */
const withCurrentPromptFields = (
  stored: AiPrompt & {
    icon?: unknown
    enabled?: boolean
  },
  now: number
): AiPrompt => {
  let prompt: AiPrompt = stored
  if ('icon' in stored || 'enabled' in stored) {
    const { icon: _icon, enabled: _enabled, ...current } = stored
    prompt = current
  }
  if (!P.isTruthy(prompt.isPreset)) {
    return prompt
  }
  const seed = O.getOrUndefined(HM.get(PRESET_SEED_BY_NAME, prompt.name))
  const oldBodies = SUPERSEDED_PRESET_CONTENT[prompt.name]
  if (
    seed === undefined ||
    oldBodies?.includes(prompt.content) !== true ||
    prompt.content === seed.content
  ) {
    return prompt
  }
  return {
    ...prompt,
    content: seed.content,
    updatedAt: now
  }
}

/** Resolve saved sidebar preferences while keeping custom skills on their existing defaults.
 *
 * **Example** (Access the isTranscriptSkillSidebarEnabled contract)
 *
 * ```ts
 * import { isTranscriptSkillSidebarEnabled } from './ai-prompts.js'
 * void isTranscriptSkillSidebarEnabled
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export function isTranscriptSkillSidebarEnabled(prompt: AiPrompt): boolean {
  return (
    prompt.showInTranscript ??
    (prompt.isPreset
      ? HS.has(DEFAULT_TRANSCRIPT_SIDEBAR_SKILLS, prompt.name)
      : !P.isTruthy(prompt.workflowOnly))
  )
}

/** Exclude invalid skills after resolving their transcript sidebar preference.
 *
 * **Example** (Access the isTranscriptSkillVisible contract)
 *
 * ```ts
 * import { isTranscriptSkillVisible } from './ai-prompts.js'
 * void isTranscriptSkillVisible
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export function isTranscriptSkillVisible(prompt: AiPrompt): boolean {
  return isTranscriptSkillSidebarEnabled(prompt) && !P.isTruthy(prompt.skillError)
}

/**
 * Split the Overview prompt from the remaining visible prompt tabs.
 *
 * @param prompts Installed prompts shown in the transcript side panel.
 *
 * **Example** (Access the partitionTranscriptPromptTabs contract)
 *
 * ```ts
 * import { partitionTranscriptPromptTabs } from './ai-prompts.js'
 * void partitionTranscriptPromptTabs
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const partitionTranscriptPromptTabs = (
  prompts: readonly AiPrompt[]
): {
  overview: AiPrompt | null
  rest: AiPrompt[]
} => {
  let overview: AiPrompt | null = null
  const rest: AiPrompt[] = []
  for (const prompt of prompts) {
    if (!isTranscriptSkillVisible(prompt)) {
      continue
    }
    if (prompt.name === AI_OVERVIEW_PROMPT_ID && overview === null) {
      overview = prompt
      continue
    }
    rest.push(prompt)
  }
  return {
    overview,
    rest
  }
}

/**
 * Re-insert any missing built-in prompts without overwriting user edits,
 * refresh unedited official prompt bodies to the current seed, and drop
 * retired icon settings and built-in ids so they are not restored.
 *
 * @param existing Prompts already in storage.
 * @param now Timestamp for newly inserted or refreshed presets.
 */
function mergeDefaultAiPromptsBody(existing: AiPrompt[], now: number): AiPrompt[] {
  const kept = Sparse.filter({
    items: existing,
    predicate: (prompt) => !HS.has(DEPRECATED_PRESET_NAMES, prompt.name)
  })
  const present = HS.fromIterable(
    Sparse.map({
      items: kept,
      map: (prompt) => prompt.name
    })
  )
  const missing = Sparse.filter({
    items: createDefaultAiPrompts(now),
    predicate: (prompt) => !HS.has(present, prompt.name)
  })
  const refreshed = Sparse.map({
    items: kept,
    map: (prompt) => withCurrentPromptFields(prompt, now)
  })
  const fieldsChanged = A.some(refreshed, (prompt, index) => prompt !== kept[index])
  if (missing.length === 0 && kept.length === existing.length && !fieldsChanged) {
    return existing
  }
  const overviewMissing = O.getOrUndefined(
    A.findFirst(missing, (prompt) => prompt.name === AI_OVERVIEW_PROMPT_ID)
  )
  const otherMissing = Sparse.filter({
    items: missing,
    predicate: (prompt) => prompt.name !== AI_OVERVIEW_PROMPT_ID
  })
  const nextSort = A.reduce(refreshed, -1, (max, prompt) => Math.max(max, prompt.sortOrder)) + 1
  const minSort = A.reduce(refreshed, 0, (min, prompt) => Math.min(min, prompt.sortOrder))
  return [
    ...(overviewMissing === undefined
      ? []
      : [
          {
            ...overviewMissing,
            sortOrder: minSort - 1
          }
        ]),
    ...refreshed,
    ...Sparse.map({
      items: otherMissing,
      map: (prompt, index) => ({
        ...prompt,
        sortOrder: nextSort + index
      })
    })
  ]
}

/** Record contract for agentChatPrompt. structural for legacy construction.
 * @category ports
 * @since 0.0.0
 *
 * **Example** (Access the AgentChatPromptInput contract)
 *
 * ```ts
 * import { AgentChatPromptInput } from './ai-prompts.js'
 * void AgentChatPromptInput
 * ```
 *
 */
export const AgentChatPromptInput = S.Struct({
  now: S.mutableKey(S.Finite),
  hasSource: S.Union([S.Boolean, S.Undefined]).pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
}).pipe(
  $I.annoteSchema('AgentChatPromptInput', {
    description:
      'Explicit input record for AgentChatPromptInput; structural for legacy construction.'
  })
)
/** Schema-derived AgentChatPromptInput input.
 * @category type-level
 * @since 0.0.0
 */
export type AgentChatPromptInput = typeof AgentChatPromptInput.Type
/** agentChatPrompt with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the agentChatPrompt contract)
 *
 * ```ts
 * import { agentChatPrompt } from './ai-prompts.js'
 * void agentChatPrompt
 * ```
 *
 */
export const agentChatPrompt: {
  (): (input: AgentChatPromptInput) => AiPrompt
  (input: AgentChatPromptInput): AiPrompt
} = recordFunction(
  (input: AgentChatPromptInput): AiPrompt => agentChatPromptBody(input.now, input.hasSource)
)
/** Record contract for resolveAiPromptContent. structural for legacy construction.
 * @category ports
 * @since 0.0.0
 *
 * **Example** (Access the ResolveAiPromptContentInput contract)
 *
 * ```ts
 * import { ResolveAiPromptContentInput } from './ai-prompts.js'
 * void ResolveAiPromptContentInput
 * ```
 *
 */
export const ResolveAiPromptContentInput = S.Struct({
  content: S.mutableKey(S.String),
  languageCode: S.mutableKey(S.String)
}).pipe(
  $I.annoteSchema('ResolveAiPromptContentInput', {
    description:
      'Explicit input record for ResolveAiPromptContentInput; structural for legacy construction.'
  })
)
/** Schema-derived ResolveAiPromptContentInput input.
 * @category type-level
 * @since 0.0.0
 */
export type ResolveAiPromptContentInput = typeof ResolveAiPromptContentInput.Type
/** resolveAiPromptContent with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the resolveAiPromptContent contract)
 *
 * ```ts
 * import { resolveAiPromptContent } from './ai-prompts.js'
 * void resolveAiPromptContent
 * ```
 *
 */
export const resolveAiPromptContent: {
  (): (input: ResolveAiPromptContentInput) => string
  (input: ResolveAiPromptContentInput): string
} = recordFunction((input: ResolveAiPromptContentInput): string =>
  resolveAiPromptContentBody(input.content, input.languageCode)
)
/** Record contract for canonicalizeAiPromptContent. structural for legacy construction.
 * @category ports
 * @since 0.0.0
 *
 * **Example** (Access the CanonicalizeAiPromptContentInput contract)
 *
 * ```ts
 * import { CanonicalizeAiPromptContentInput } from './ai-prompts.js'
 * void CanonicalizeAiPromptContentInput
 * ```
 *
 */
export const CanonicalizeAiPromptContentInput = S.Struct({
  promptId: S.mutableKey(S.String),
  content: S.mutableKey(S.String)
}).pipe(
  $I.annoteSchema('CanonicalizeAiPromptContentInput', {
    description:
      'Explicit input record for CanonicalizeAiPromptContentInput; structural for legacy construction.'
  })
)
/** Schema-derived CanonicalizeAiPromptContentInput input.
 * @category type-level
 * @since 0.0.0
 */
export type CanonicalizeAiPromptContentInput = typeof CanonicalizeAiPromptContentInput.Type
/** canonicalizeAiPromptContent with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the canonicalizeAiPromptContent contract)
 *
 * ```ts
 * import { canonicalizeAiPromptContent } from './ai-prompts.js'
 * void canonicalizeAiPromptContent
 * ```
 *
 */
export const canonicalizeAiPromptContent: {
  (): (input: CanonicalizeAiPromptContentInput) => string
  (input: CanonicalizeAiPromptContentInput): string
} = recordFunction((input: CanonicalizeAiPromptContentInput): string =>
  canonicalizeAiPromptContentBody(input.promptId, input.content)
)
/** Record contract for aiPromptLabel.
 * @category ports
 * @since 0.0.0
 *
 * **Example** (Import the AiPromptLabelInput contract)
 *
 * ```ts
 * export type { AiPromptLabelInput } from './ai-prompts.js'
 * ```
 *
 */
export interface AiPromptLabelInput {
  prompt: Pick<AiPrompt, 'name' | 'isPreset' | 'description'>
  translate?: ((key: string) => string) | undefined
}
/** aiPromptLabel with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the aiPromptLabel contract)
 *
 * ```ts
 * import { aiPromptLabel } from './ai-prompts.js'
 * void aiPromptLabel
 * ```
 *
 */
export const aiPromptLabel: {
  (): (input: AiPromptLabelInput) => string
  (input: AiPromptLabelInput): string
} = recordFunction((input: AiPromptLabelInput): string =>
  aiPromptLabelBody(input.prompt, input.translate)
)
/** Record contract for aiPromptDescription.
 * @category ports
 * @since 0.0.0
 *
 * **Example** (Import the AiPromptDescriptionInput contract)
 *
 * ```ts
 * export type { AiPromptDescriptionInput } from './ai-prompts.js'
 * ```
 *
 */
export interface AiPromptDescriptionInput {
  prompt: Pick<AiPrompt, 'name' | 'isPreset' | 'description'>
  translate?: ((key: string) => string) | undefined
}
/** aiPromptDescription with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the aiPromptDescription contract)
 *
 * ```ts
 * import { aiPromptDescription } from './ai-prompts.js'
 * void aiPromptDescription
 * ```
 *
 */
export const aiPromptDescription: {
  (): (input: AiPromptDescriptionInput) => string
  (input: AiPromptDescriptionInput): string
} = recordFunction((input: AiPromptDescriptionInput): string =>
  aiPromptDescriptionBody(input.prompt, input.translate)
)
/** Record contract for mergeDefaultAiPrompts. structural for legacy construction.
 * @category ports
 * @since 0.0.0
 *
 * **Example** (Access the MergeDefaultAiPromptsInput contract)
 *
 * ```ts
 * import { MergeDefaultAiPromptsInput } from './ai-prompts.js'
 * void MergeDefaultAiPromptsInput
 * ```
 *
 */
export const MergeDefaultAiPromptsInput = S.Struct({
  existing: AiPrompt.pipe(S.Array, S.mutable, S.mutableKey),
  now: S.mutableKey(S.Finite)
}).pipe(
  $I.annoteSchema('MergeDefaultAiPromptsInput', {
    description:
      'Explicit input record for MergeDefaultAiPromptsInput; structural for legacy construction.'
  })
)
/** Schema-derived MergeDefaultAiPromptsInput input.
 * @category type-level
 * @since 0.0.0
 */
export type MergeDefaultAiPromptsInput = typeof MergeDefaultAiPromptsInput.Type
/** mergeDefaultAiPrompts with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the mergeDefaultAiPrompts contract)
 *
 * ```ts
 * import { mergeDefaultAiPrompts } from './ai-prompts.js'
 * void mergeDefaultAiPrompts
 * ```
 *
 */
export const mergeDefaultAiPrompts: {
  (): (input: MergeDefaultAiPromptsInput) => AiPrompt[]
  (input: MergeDefaultAiPromptsInput): AiPrompt[]
} = recordFunction((input: MergeDefaultAiPromptsInput): AiPrompt[] =>
  mergeDefaultAiPromptsBody(input.existing, input.now)
)
