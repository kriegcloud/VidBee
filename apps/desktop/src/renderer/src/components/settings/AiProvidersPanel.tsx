import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle
} from '@renderer/components/ui/item'
import { ipcServices } from '@renderer/lib/ipc'
import { logger } from '@renderer/lib/logger'
import { AI_PROVIDER_PRESETS } from '@shared/ai-presets'
import type {
  AiProviderConfig,
  AiProviderPreset,
  AiProviderPresetId,
  AiProviderTestResult,
  AiProviderWriteInput,
  AiSettingsSnapshot
} from '@shared/ai-types'
import { Check, Plus, Trash2 } from 'lucide-react'
import { type KeyboardEvent, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AiProviderDialog } from './AiProviderDialog'
import { AiProviderIcon } from './ai-provider-icon'

/**
 * Secondary text for a catalog provider: default model, otherwise the base URL.
 *
 * @param preset Catalog entry.
 */
const catalogHint = (preset: AiProviderPreset): string =>
  preset.defaultModel || preset.baseUrl || ''

/**
 * Settings page for built-in LLM providers and the shared add/edit dialog.
 */
export function AiProvidersPanel() {
  const { t } = useTranslation()
  const [snapshot, setSnapshot] = useState<AiSettingsSnapshot | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogPresetId, setDialogPresetId] = useState<AiProviderPresetId | null>(null)
  const [editing, setEditing] = useState<AiProviderConfig | null>(null)
  const [saving, setSaving] = useState(false)

  /**
   * Load providers from the main process.
   */
  const refresh = useCallback(async (): Promise<void> => {
    try {
      setSnapshot(await ipcServices.ai.getSnapshot())
    } catch (error) {
      logger.error('Failed to load AI providers', error)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /**
   * Open the unified dialog for a catalog provider.
   *
   * @param presetId Built-in provider id.
   */
  const openCreate = (presetId: AiProviderPresetId): void => {
    setEditing(null)
    setDialogPresetId(presetId)
    setDialogOpen(true)
  }

  /**
   * Open the unified dialog for an existing provider.
   *
   * @param provider Saved provider.
   */
  const openEdit = (provider: AiProviderConfig): void => {
    setEditing(provider)
    setDialogPresetId(provider.presetId)
    setDialogOpen(true)
  }

  /**
   * Ping the model with the dialog values without saving first.
   *
   * @param input Dialog payload.
   */
  const handleTest = (input: AiProviderWriteInput): Promise<AiProviderTestResult> =>
    ipcServices.ai.testProvider(input)

  /**
   * Persist dialog values and refresh the list.
   *
   * @param input Dialog payload.
   */
  const handleSave = async (input: AiProviderWriteInput): Promise<void> => {
    setSaving(true)
    try {
      setSnapshot(await ipcServices.ai.upsertProvider(input))
      setDialogOpen(false)
    } catch (error) {
      logger.error('Failed to save AI provider', error)
      toast.error(error instanceof Error ? error.message : t('settings.ai.saveError'))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Enable a provider for transcript prompts.
   *
   * @param id Provider id.
   */
  const handleUse = async (id: string): Promise<void> => {
    try {
      setSnapshot(await ipcServices.ai.setActiveProvider(id))
    } catch (error) {
      logger.error('Failed to enable AI provider', error)
      toast.error(t('settings.ai.saveError'))
    }
  }

  /**
   * Activate a catalog card with Enter or Space.
   *
   * @param event Keyboard event from the card.
   * @param presetId Built-in provider id.
   */
  const handleCatalogKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    presetId: AiProviderPresetId
  ): void => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }
    event.preventDefault()
    openCreate(presetId)
  }

  /**
   * Remove a configured provider.
   *
   * @param id Provider id.
   */
  const handleDelete = async (id: string): Promise<void> => {
    try {
      setSnapshot(await ipcServices.ai.deleteProvider(id))
    } catch (error) {
      logger.error('Failed to delete AI provider', error)
      toast.error(t('settings.ai.saveError'))
    }
  }

  const providers = snapshot?.providers ?? []
  const activeProviderId = snapshot?.activeProviderId ?? null
  return (
    <div className="space-y-4">
      {providers.length > 0 ? (
        <div className="space-y-2">
          <h3 className="px-1 font-medium text-muted-foreground text-sm">
            {t('settings.ai.configured')}
          </h3>
          <ItemGroup>
            {providers.map((provider, index) => {
              const inUse = provider.id === activeProviderId
              return (
                <div key={provider.id}>
                  {index > 0 ? <ItemSeparator /> : null}
                  <Item variant="muted">
                    <ItemMedia className="border-border bg-background" variant="icon">
                      <AiProviderIcon presetId={provider.presetId} />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>
                        {provider.name}
                        {inUse ? (
                          <Badge variant="secondary">
                            <Check aria-hidden className="size-3" />
                            {t('settings.ai.inUse')}
                          </Badge>
                        ) : null}
                      </ItemTitle>
                      <ItemDescription>{provider.modelId}</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      {inUse ? null : (
                        <Button
                          onClick={() => void handleUse(provider.id)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {t('settings.ai.useProvider')}
                        </Button>
                      )}
                      <Button
                        onClick={() => openEdit(provider)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {t('settings.ai.edit')}
                      </Button>
                      <Button
                        aria-label={t('settings.ai.deleteProvider')}
                        className="size-8"
                        onClick={() => void handleDelete(provider.id)}
                        size="icon"
                        title={t('settings.ai.deleteProvider')}
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </ItemActions>
                  </Item>
                </div>
              )
            })}
          </ItemGroup>
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="px-1 font-medium text-muted-foreground text-sm">
          {t('settings.ai.allServices')}
        </h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {AI_PROVIDER_PRESETS.map((preset) => {
            const name = t(`settings.ai.presets.${preset.id}`)
            const hint = catalogHint(preset)
            return (
              <Item
                aria-label={t('settings.ai.addProvider', { name })}
                className="cursor-pointer hover:bg-accent/50"
                key={preset.id}
                onClick={() => openCreate(preset.id)}
                onKeyDown={(event) => handleCatalogKeyDown(event, preset.id)}
                role="button"
                rounded="both"
                size="sm"
                tabIndex={0}
                variant="muted"
              >
                <ItemMedia className="border-border bg-background" variant="icon">
                  <AiProviderIcon presetId={preset.id} />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{name}</ItemTitle>
                  {hint ? <ItemDescription className="line-clamp-1">{hint}</ItemDescription> : null}
                </ItemContent>
                <ItemActions>
                  <Plus aria-hidden className="size-4 text-muted-foreground" />
                </ItemActions>
              </Item>
            )
          })}
        </div>
      </div>

      <AiProviderDialog
        onOpenChange={setDialogOpen}
        onSave={handleSave}
        onTest={handleTest}
        open={dialogOpen}
        presetId={dialogPresetId}
        provider={editing}
        saving={saving}
      />
    </div>
  )
}
