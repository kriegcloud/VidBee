import { Button } from '@renderer/components/ui/button'
import { aiPromptErrorNeedsProviderSettings } from '@shared/ai-run'
import type { AiPromptErrorCode } from '@shared/ai-types'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

const GUIDE_KEY: Record<AiPromptErrorCode, string> = {
  'no-provider': 'transcript.promptGuide.noProvider',
  'missing-api-key': 'transcript.promptGuide.missingApiKey',
  'missing-model': 'transcript.promptGuide.missingModel',
  'unknown-prompt': 'transcript.promptGuide.unknownPrompt',
  'empty-transcript': 'transcript.promptGuide.emptyTranscript',
  auth: 'transcript.promptGuide.auth',
  network: 'transcript.promptGuide.network',
  'empty-output': 'transcript.promptGuide.emptyOutput',
  unknown: 'transcript.promptGuide.unknown'
}

const SOLUTION_KEY: Record<AiPromptErrorCode, string> = {
  'no-provider': 'noProvider',
  'missing-api-key': 'missingApiKey',
  'missing-model': 'missingModel',
  'unknown-prompt': 'unknownPrompt',
  'empty-transcript': 'emptyTranscript',
  auth: 'auth',
  network: 'network',
  'empty-output': 'emptyOutput',
  unknown: 'unknown'
}

interface TranscriptPromptGuidanceProps {
  error?: string | null
  errorCode: AiPromptErrorCode
  onRetry?: () => void
  providerLabel?: string | null
}

const SOLUTION_STEP_KEYS = ['s1', 's2', 's3'] as const

/**
 * Read the i18n solution list for an error code.
 *
 * @param t Translator.
 * @param errorCode Guidance code.
 */
const solutionSteps = (t: (key: string) => string, errorCode: AiPromptErrorCode): string[] =>
  SOLUTION_STEP_KEYS.map((step) =>
    t(`transcript.promptSolutions.${SOLUTION_KEY[errorCode]}.${step}`)
  ).filter((step) => step.length > 0 && !step.startsWith('transcript.promptSolutions.'))

/**
 * Explain a prompt failure, list fixes, and show the raw provider error.
 */
export function TranscriptPromptGuidance({
  error,
  errorCode,
  onRetry,
  providerLabel
}: TranscriptPromptGuidanceProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const openSettings = aiPromptErrorNeedsProviderSettings(errorCode)
  const steps = solutionSteps(t, errorCode)
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="font-medium text-sm">{t(GUIDE_KEY[errorCode])}</p>
      {providerLabel ? (
        <p className="text-muted-foreground text-xs">
          {t('transcript.promptUsingProvider', { name: providerLabel })}
        </p>
      ) : null}
      {steps.length > 0 ? (
        <div className="w-full">
          <p className="mb-1 font-medium text-muted-foreground text-xs">
            {t('transcript.promptWhatToDo')}
          </p>
          <ol className="list-decimal space-y-1 pl-4 text-sm">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}
      {error ? (
        <div className="w-full min-w-0">
          <p className="mb-1 font-medium text-muted-foreground text-xs">
            {t('transcript.promptErrorDetails')}
          </p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-muted-foreground text-xs">
            {error}
          </pre>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {openSettings ? (
          <Button
            onClick={() => void navigate({ search: { tab: 'providers' }, to: '/settings' })}
            size="sm"
            type="button"
          >
            {t('transcript.promptOpenSettings')}
          </Button>
        ) : null}
        {onRetry ? (
          <Button onClick={onRetry} size="sm" type="button" variant="outline">
            {t('transcript.promptTryAgain')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
