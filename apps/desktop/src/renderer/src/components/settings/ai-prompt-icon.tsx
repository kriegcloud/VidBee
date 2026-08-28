import type { AiPromptIconId } from '@shared/ai-types'
import {
  ChartNoAxesColumn,
  CircleHelp,
  GitBranch,
  Highlighter,
  Languages,
  List,
  type LucideIcon,
  MessageCircleQuestion,
  Repeat2,
  Rows3,
  Smile,
  Sparkles,
  SpellCheck
} from 'lucide-react'

const PROMPT_ICONS: Record<AiPromptIconId, LucideIcon> = {
  list: List,
  'spell-check': SpellCheck,
  'rows-3': Rows3,
  highlighter: Highlighter,
  'circle-help': CircleHelp,
  smile: Smile,
  'message-circle-question': MessageCircleQuestion,
  'chart-no-axes-column': ChartNoAxesColumn,
  'repeat-2': Repeat2,
  'git-branch': GitBranch,
  languages: Languages,
  sparkles: Sparkles
}

export const AI_PROMPT_ICON_IDS = Object.keys(PROMPT_ICONS) as AiPromptIconId[]

/**
 * Render the Lucide icon stored with a prompt.
 *
 * @param props.icon Stored icon id.
 * @param props.className Optional class names.
 */
export const AiPromptIcon = ({ className, icon }: { className?: string; icon: AiPromptIconId }) => {
  const Icon = PROMPT_ICONS[icon] ?? Sparkles
  return <Icon aria-hidden className={className ?? 'size-4'} />
}
