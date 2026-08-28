import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  aiProviderNeedsApiKey,
  aiProviderRequiresBaseUrl,
  getAiProviderPreset
} from '@shared/ai-presets'
import type {
  AiProviderConfig,
  AiProviderPresetId,
  AiProviderTestResult,
  AiProviderWriteInput
} from '@shared/ai-types'
import { Loader2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AiProviderIcon } from './ai-provider-icon'

const REPLY_PREVIEW_MAX = 80

interface AiProviderDialogProps {
  onOpenChange: (open: boolean) => void
  onSave: (input: AiProviderWriteInput) => Promise<void>
  onTest: (input: AiProviderWriteInput) => Promise<AiProviderTestResult>
  open: boolean
  presetId: AiProviderPresetId | null
  provider?: AiProviderConfig | null
  saving?: boolean
}

/**
 * Shared dialog for adding or editing an LLM provider.
 *
 * Preset providers hide the base URL. Custom keeps it so any OpenAI-compatible
 * endpoint can be wired in.
 */
export function AiProviderDialog({
  onOpenChange,
  onSave,
  onTest,
  open,
  presetId,
  provider,
  saving = false
}: AiProviderDialogProps) {
  const { t } = useTranslation()
  const nameId = useId()
  const baseUrlId = useId()
  const apiKeyId = useId()
  const modelId = useId()
  const openRef = useRef(open)
  const resolvedPresetId = provider?.presetId ?? presetId ?? 'custom'
  const preset = getAiProviderPreset(resolvedPresetId)
  const showBaseUrl = aiProviderRequiresBaseUrl(resolvedPresetId)
  const needsKey = aiProviderNeedsApiKey(resolvedPresetId)
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<AiProviderTestResult | null>(null)
  openRef.current = open
  useEffect(() => {
    if (!open) {
      return
    }
    setName(provider?.name ?? '')
    setBaseUrl(provider?.baseUrl ?? '')
    setApiKey('')
    setModel(provider?.modelId ?? preset?.defaultModel ?? '')
    setTesting(false)
    setTestResult(null)
  }, [open, preset?.defaultModel, provider])

  const title = provider
    ? t('settings.ai.editProvider')
    : t('settings.ai.addProvider', { name: t(`settings.ai.presets.${resolvedPresetId}`) })
  const canSave =
    model.trim().length > 0 &&
    (!showBaseUrl || baseUrl.trim().length > 0) &&
    (!needsKey || apiKey.trim().length > 0 || Boolean(provider?.hasApiKey))

  /**
   * Collect the current dialog values for save or a connectivity ping.
   */
  const writeInput = (): AiProviderWriteInput => ({
    id: provider?.id,
    presetId: resolvedPresetId,
    name: name.trim() || undefined,
    baseUrl: showBaseUrl ? baseUrl.trim() : undefined,
    modelId: model.trim(),
    apiKey: apiKey.trim() || undefined
  })

  /**
   * Persist the dialog values through the parent.
   */
  const handleSave = async (): Promise<void> => {
    if (!canSave || saving || testing) {
      return
    }
    await onSave(writeInput())
  }

  /**
   * Send a short prompt with the current fields to check that the model works.
   */
  const handleTest = async (): Promise<void> => {
    if (!canSave || saving || testing) {
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const result = await onTest(writeInput())
      if (openRef.current) {
        setTestResult(result)
      }
    } catch (error) {
      if (openRef.current) {
        setTestResult({
          ok: false,
          text: '',
          error: error instanceof Error ? error.message : t('settings.ai.testFailed'),
          errorCode: 'unknown'
        })
      }
    } finally {
      if (openRef.current) {
        setTesting(false)
      }
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AiProviderIcon presetId={resolvedPresetId} />
            {title}
          </DialogTitle>
          <DialogDescription>{t('settings.ai.providerDialogDescription')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={nameId}>{t('settings.ai.name')}</Label>
            <Input
              id={nameId}
              onChange={(event) => setName(event.currentTarget.value)}
              placeholder={t(`settings.ai.presets.${resolvedPresetId}`)}
              value={name}
            />
          </div>
          {showBaseUrl ? (
            <div className="grid gap-2">
              <Label htmlFor={baseUrlId}>{t('settings.ai.baseUrl')}</Label>
              <Input
                id={baseUrlId}
                onChange={(event) => setBaseUrl(event.currentTarget.value)}
                placeholder="https://api.example.com/v1"
                value={baseUrl}
              />
            </div>
          ) : null}
          {needsKey ? (
            <div className="grid gap-2">
              <Label htmlFor={apiKeyId}>{t('settings.ai.apiKey')}</Label>
              <Input
                autoComplete="off"
                id={apiKeyId}
                onChange={(event) => setApiKey(event.currentTarget.value)}
                placeholder={provider?.hasApiKey ? t('settings.ai.apiKeyKept') : 'sk-...'}
                type="password"
                value={apiKey}
              />
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor={modelId}>{t('settings.ai.modelId')}</Label>
            <Input
              id={modelId}
              onChange={(event) => setModel(event.currentTarget.value)}
              placeholder={preset?.defaultModel || t('settings.ai.modelIdPlaceholder')}
              value={model}
            />
          </div>
          {testing || testResult ? (
            <div aria-live="polite">
              {testing ? (
                <p className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="size-3.5 animate-spin" />
                  {t('settings.ai.testingConnection')}
                </p>
              ) : null}
              {testResult?.ok ? (
                <p className="text-emerald-700 text-sm dark:text-emerald-400">
                  {t('settings.ai.testSuccess', {
                    reply: testResult.text.trim().slice(0, REPLY_PREVIEW_MAX)
                  })}
                </p>
              ) : null}
              {testResult && !testResult.ok ? (
                <div className="grid gap-1">
                  <p className="text-destructive text-sm">{t('settings.ai.testFailed')}</p>
                  {testResult.error ? (
                    <p className="break-all text-muted-foreground text-xs">{testResult.error}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button
            disabled={!canSave || saving || testing}
            onClick={() => void handleTest()}
            type="button"
            variant="outline"
          >
            {testing ? <Loader2 className="size-4 animate-spin" /> : null}
            {t('settings.ai.testConnection')}
          </Button>
          <div className="flex gap-2">
            <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
              {t('settings.ai.cancel')}
            </Button>
            <Button
              disabled={!canSave || saving || testing}
              onClick={() => void handleSave()}
              type="button"
            >
              {t('settings.ai.save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
