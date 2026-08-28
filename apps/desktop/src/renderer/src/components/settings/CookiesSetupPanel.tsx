import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle
} from '@renderer/components/ui/item'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { ipcServices } from '@renderer/lib/ipc'
import { logger } from '@renderer/lib/logger'
import { withDesktopUtm } from '@renderer/lib/url'
import { saveSettingAtom, settingsAtom } from '@renderer/store/settings'
import {
  buildBrowserCookiesSetting,
  parseBrowserCookiesSetting
} from '@vidbee/downloader-core/browser-cookies-setting'
import {
  COOKIES_CHROME_EXTENSION_URL,
  COOKIES_FIREFOX_EXTENSION_URL,
  COOKIES_GUIDE_URL,
  type CookieBrowserId,
  type CookieHealth,
  type CookieSetupRecommendation,
  hasConfiguredCookieSettings,
  type InstalledCookieBrowser,
  isWindowsBlockedCookieBrowser,
  listSelectableCookieBrowsers,
  recommendCookieSetup,
  unconfiguredCookieHealth
} from '@vidbee/downloader-core/cookie-setup'
import { useAtomValue, useSetAtom } from 'jotai'
import { AlertTriangle, Cookie } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

interface CookiesSetupPanelProps {
  onHealthChange?: (health: CookieHealth) => void
  platform?: string
}

type TranslateFn = (key: string, options?: Record<string, string>) => string

/**
 * Translate a browser id using the shared settings labels.
 *
 * @param browser Browser id.
 * @param t i18n function.
 */
const browserLabel = (browser: string, t: TranslateFn): string => {
  if (!browser || browser === 'none') {
    return t('settings.none')
  }
  return t(`settings.browserOptions.${browser}`)
}

/**
 * Status badge label for the current cookie health.
 *
 * @param health Cookie health snapshot.
 * @param t i18n function.
 */
const healthBadgeLabel = (health: CookieHealth, t: TranslateFn): string => {
  switch (health.status) {
    case 'ok':
      return t('settings.cookiesSetup.statusOk')
    case 'expired':
      return t('settings.cookiesSetup.statusExpired')
    case 'empty':
      return t('settings.cookiesSetup.statusEmpty')
    case 'invalid':
      return t('settings.cookiesSetup.statusInvalid')
    default:
      return t('settings.cookiesSetup.statusNotConfigured')
  }
}

/**
 * Human-readable explanation of the current cookie source.
 *
 * @param health Cookie health snapshot.
 * @param t i18n function.
 */
const healthDescription = (health: CookieHealth, t: TranslateFn): string => {
  if (health.status === 'unconfigured') {
    return t('settings.cookiesSetup.statusNotConfiguredHint')
  }
  if (health.status === 'expired') {
    return t('settings.cookiesSetup.healthExpired')
  }
  if (health.status === 'empty') {
    return t('settings.cookiesSetup.healthEmpty')
  }
  if (health.status === 'invalid') {
    if (health.reason === 'unsupported-browser') {
      return t('settings.cookiesSetup.healthUnsupportedBrowser')
    }
    if (health.source === 'file') {
      return t('settings.cookiesSetup.healthInvalidFile')
    }
    if (health.reason === 'macos-files-permission') {
      return t('settings.cookiesSetup.healthMacosFilesPermission')
    }
    if (health.reason === 'missing-cookie-db') {
      return t('settings.cookiesSetup.profileMissingDb')
    }
    return t('settings.cookiesSetup.healthInvalidBrowser')
  }
  if (health.source === 'browser' && health.browser) {
    return t('settings.cookiesSetup.healthOkBrowser', {
      browser: browserLabel(health.browser, t)
    })
  }
  if (health.sites.length > 0) {
    return t('settings.cookiesSetup.healthOkFile', {
      sites: health.sites.map((site) => site.label).join(', ')
    })
  }
  return t('settings.cookiesSetup.healthOkFileGeneric')
}

/**
 * Copy for the recommended setup path.
 *
 * @param recommendation Setup recommendation.
 * @param t i18n function.
 */
const recommendationCopy = (
  recommendation: CookieSetupRecommendation,
  t: TranslateFn
): { title: string; hint: string; action: string } => {
  if (recommendation.method === 'browser' && recommendation.browser) {
    const browser = browserLabel(recommendation.browser, t)
    const hint =
      recommendation.reason === 'windows-firefox'
        ? t('settings.cookiesSetup.recommendedFirefoxHint')
        : t('settings.cookiesSetup.recommendedUseBrowserHint', { browser })
    return {
      action: t('settings.cookiesSetup.useThisBrowser', { browser }),
      hint,
      title: t('settings.cookiesSetup.recommendedUseBrowser', { browser })
    }
  }
  const hint =
    recommendation.reason === 'windows-file'
      ? t('settings.cookiesSetup.recommendedImportFileWindowsHint')
      : t('settings.cookiesSetup.recommendedImportFileHint')
  return {
    action: t('settings.cookiesSetup.importFile'),
    hint,
    title: t('settings.cookiesSetup.recommendedImportFile')
  }
}

/**
 * Guided cookies setup for Settings and the download-failure dialog.
 */
export function CookiesSetupPanel({
  onHealthChange,
  platform: platformProp
}: CookiesSetupPanelProps) {
  const { t } = useTranslation()
  const settings = useAtomValue(settingsAtom)
  const saveSetting = useSetAtom(saveSettingAtom)
  const [platform, setPlatform] = useState(platformProp ?? '')
  const [installedBrowsers, setInstalledBrowsers] = useState<InstalledCookieBrowser[]>([])
  const [health, setHealth] = useState<CookieHealth>(unconfiguredCookieHealth())
  const [healthLoading, setHealthLoading] = useState(false)
  const [profileValidation, setProfileValidation] = useState<{
    valid: boolean
    reason?: string
  }>({ valid: false })

  const parsedBrowserCookies = parseBrowserCookiesSetting(settings.browserForCookies)
  const browserForCookiesValue = parsedBrowserCookies.browser
  const browserCookiesProfileValue = parsedBrowserCookies.profile
  const selectableBrowsers = useMemo(() => listSelectableCookieBrowsers(platform), [platform])
  const hasCookieConfig = hasConfiguredCookieSettings(
    settings.browserForCookies,
    settings.cookiesPath
  )
  const recommendation = useMemo(
    () => recommendCookieSetup({ installedBrowsers, platform }),
    [installedBrowsers, platform]
  )
  const recommendedCopy = recommendationCopy(recommendation, t)
  const currentBrowserUnsupported =
    platform === 'win32' && isWindowsBlockedCookieBrowser(browserForCookiesValue)
  const needsAttention =
    !hasCookieConfig ||
    currentBrowserUnsupported ||
    health.status === 'invalid' ||
    health.status === 'expired' ||
    health.status === 'empty'
  const showRecommended = needsAttention
  const cookiesPathValue = settings.cookiesPath ?? ''
  const hasBrowserProfileValue = browserCookiesProfileValue.trim().length > 0
  const selectedBrowserValue = selectableBrowsers.includes(
    browserForCookiesValue as CookieBrowserId
  )
    ? browserForCookiesValue
    : 'none'
  const showProfileField = selectedBrowserValue !== 'none'
  const showBrowserProfileWarning =
    hasBrowserProfileValue && !profileValidation.valid && profileValidation.reason !== 'empty'

  /**
   * Persist a single setting and surface save failures.
   *
   * @param key Settings key.
   * @param value Settings value.
   */
  const handleSettingChange = useCallback(
    async (key: 'browserForCookies' | 'cookiesPath', value: string): Promise<void> => {
      try {
        await saveSetting({ key, value })
      } catch (error) {
        logger.error('[CookiesSetup] Failed to change setting', { error, key, value })
        toast.error(t('settings.saveError') || 'Failed to save setting')
      }
    },
    [saveSetting, t]
  )

  /**
   * Re-read cookie health from the current settings.
   */
  const refreshHealth = useCallback(async (): Promise<CookieHealth> => {
    setHealthLoading(true)
    try {
      const next = await ipcServices.browserCookies.inspectCookieHealth({
        browser: parsedBrowserCookies.browser,
        cookiesPath: settings.cookiesPath ?? '',
        profile: parsedBrowserCookies.profile
      })
      setHealth(next)
      onHealthChange?.(next)
      return next
    } catch (error) {
      logger.error('[CookiesSetup] Failed to inspect cookie health:', error)
      const fallback = unconfiguredCookieHealth()
      setHealth(fallback)
      onHealthChange?.(fallback)
      return fallback
    } finally {
      setHealthLoading(false)
    }
  }, [
    onHealthChange,
    parsedBrowserCookies.browser,
    parsedBrowserCookies.profile,
    settings.cookiesPath
  ])

  useEffect(() => {
    if (platformProp) {
      setPlatform(platformProp)
      return
    }
    const fetchPlatform = async () => {
      try {
        setPlatform(await ipcServices.app.getPlatform())
      } catch (error) {
        logger.error('[CookiesSetup] Failed to get platform info:', error)
      }
    }
    void fetchPlatform()
  }, [platformProp])

  useEffect(() => {
    const loadInstalled = async () => {
      try {
        setInstalledBrowsers(await ipcServices.browserCookies.listInstalledBrowsers())
      } catch (error) {
        logger.error('[CookiesSetup] Failed to list installed browsers:', error)
      }
    }
    void loadInstalled()
  }, [])

  useEffect(() => {
    void refreshHealth()
  }, [refreshHealth])

  useEffect(() => {
    if (browserForCookiesValue === 'none' || browserCookiesProfileValue) {
      return
    }

    const detectProfilePath = async () => {
      try {
        const detectedPath =
          await ipcServices.browserCookies.getBrowserProfilePath(browserForCookiesValue)
        if (detectedPath) {
          await handleSettingChange(
            'browserForCookies',
            buildBrowserCookiesSetting(browserForCookiesValue, detectedPath)
          )
        }
      } catch (error) {
        logger.error('[CookiesSetup] Failed to detect browser profile path:', error)
      }
    }

    void detectProfilePath()
  }, [browserCookiesProfileValue, browserForCookiesValue, handleSettingChange])

  useEffect(() => {
    if (browserForCookiesValue === 'none' || !hasBrowserProfileValue) {
      setProfileValidation({ valid: false, reason: 'empty' })
      return
    }

    let isActive = true
    const validateProfilePath = async () => {
      try {
        const result = await ipcServices.browserCookies.validateBrowserProfilePath(
          browserForCookiesValue,
          browserCookiesProfileValue
        )
        if (isActive) {
          setProfileValidation(result)
        }
      } catch (error) {
        if (isActive) {
          setProfileValidation({ valid: false, reason: 'pathNotFound' })
        }
        logger.error('[CookiesSetup] Failed to validate browser profile path:', error)
      }
    }
    void validateProfilePath()
    return () => {
      isActive = false
    }
  }, [browserCookiesProfileValue, browserForCookiesValue, hasBrowserProfileValue])

  /**
   * Apply the recommended browser as the cookie source.
   *
   * @param browser Browser to read cookies from.
   */
  const applyBrowser = async (browser: CookieBrowserId): Promise<void> => {
    try {
      const profile = await ipcServices.browserCookies.getBrowserProfilePath(browser)
      await handleSettingChange('cookiesPath', '')
      await handleSettingChange('browserForCookies', buildBrowserCookiesSetting(browser, profile))
      toast.success(t('settings.cookiesSetup.applied'))
    } catch (error) {
      logger.error('[CookiesSetup] Failed to apply browser cookies:', error)
      toast.error(t('settings.saveError') || 'Failed to save setting')
    }
  }

  /**
   * Pick a Netscape cookies file and store its path.
   */
  const handleSelectCookiesFile = async (): Promise<void> => {
    try {
      const selectedPath = await ipcServices.fs.selectFile()
      if (!selectedPath) {
        return
      }
      const validation = await ipcServices.fs.validateCookiesFile(selectedPath)
      if (!validation.valid) {
        const messageKey =
          validation.reason === 'sqlite'
            ? 'settings.cookiesFileInvalidSqlite'
            : validation.reason === 'not-found'
              ? 'settings.cookiesFileInvalidNotFound'
              : 'settings.cookiesFileInvalidFormat'
        toast.error(t(messageKey))
        return
      }
      await handleSettingChange('browserForCookies', 'none')
      await handleSettingChange('cookiesPath', selectedPath)
      toast.success(t('settings.cookiesSetup.applied'))
    } catch (error) {
      logger.error('[CookiesSetup] Failed to select cookies file:', error)
      toast.error(t('settings.fileSelectError'))
    }
  }

  /**
   * Run the primary recommended action.
   */
  const handleRecommendedAction = async (): Promise<void> => {
    if (recommendation.method === 'browser' && recommendation.browser) {
      await applyBrowser(recommendation.browser)
      return
    }
    await handleSelectCookiesFile()
  }

  /**
   * Clear both cookie sources.
   */
  const handleClear = async (): Promise<void> => {
    await handleSettingChange('browserForCookies', 'none')
    await handleSettingChange('cookiesPath', '')
  }

  /**
   * Open the cookies guide or a cookies-export extension page.
   *
   * @param url Destination URL.
   */
  const handleOpenLink = async (url: string): Promise<void> => {
    try {
      await ipcServices.fs.openExternal(withDesktopUtm(url))
    } catch (error) {
      logger.error('[CookiesSetup] Failed to open link:', error)
      toast.error(t('settings.openLinkError'))
    }
  }

  /**
   * Open macOS Privacy → Files & Folders for browser cookie access.
   */
  const handleOpenFilesSettings = async (): Promise<void> => {
    try {
      const opened = await ipcServices.fs.openMacFilesAndFoldersSettings()
      if (!opened) {
        toast.error(t('settings.openLinkError'))
      }
    } catch (error) {
      logger.error('[CookiesSetup] Failed to open Files & Folders settings:', error)
      toast.error(t('settings.openLinkError'))
    }
  }

  /**
   * Warning copy for an invalid profile path.
   *
   * @param reason Validation reason from the main process.
   */
  const getBrowserProfileWarningMessage = (reason?: string): string => {
    switch (reason) {
      case 'pathNotFound':
        return t('settings.browserForCookiesProfileInvalidPath')
      case 'profileNotFound':
        return t('settings.browserForCookiesProfileInvalidProfile')
      case 'browserUnsupported':
        return t('settings.browserForCookiesProfileInvalidUnsupported')
      case 'empty':
        return t('settings.browserForCookiesProfileInvalidEmpty')
      case 'cookiesFileNotFound':
        return t('settings.cookiesSetup.profileMissingDb')
      default:
        return t('settings.browserForCookiesProfileInvalid')
    }
  }

  const statusTitle =
    health.source === 'browser' && health.browser
      ? t('settings.cookiesSetup.statusUsingBrowser', {
          browser: browserLabel(health.browser, t)
        })
      : health.source === 'file'
        ? t('settings.cookiesSetup.statusUsingFile')
        : t('settings.cookiesSetup.statusNotConfigured')

  return (
    <div className="space-y-4">
      <ItemGroup>
        <Item variant="muted">
          <ItemContent>
            <div className="flex flex-wrap items-center gap-2">
              <Cookie className="h-4 w-4 text-muted-foreground" />
              <ItemTitle>{statusTitle}</ItemTitle>
              <Badge variant={health.status === 'ok' ? 'secondary' : 'outline'}>
                {healthLoading ? t('settings.cookiesSetup.checking') : healthBadgeLabel(health, t)}
              </Badge>
            </div>
            <ItemDescription>{healthDescription(health, t)}</ItemDescription>
            {health.sites.length > 0 ? (
              <ItemDescription>
                {t('settings.cookiesSetup.sitesLabel', {
                  sites: health.sites.map((site) => site.label).join(', ')
                })}
              </ItemDescription>
            ) : null}
          </ItemContent>
          <ItemActions>
            <div className="flex flex-wrap gap-2">
              {health.reason === 'macos-files-permission' ? (
                <Button onClick={() => void handleOpenFilesSettings()} size="sm" variant="outline">
                  {t('download.cookiesSetupOpenFilesSettings')}
                </Button>
              ) : null}
              {hasCookieConfig ? (
                <Button onClick={() => void refreshHealth()} size="sm" variant="secondary">
                  {t('settings.cookiesSetup.checkStatus')}
                </Button>
              ) : null}
              {hasCookieConfig ? (
                <Button onClick={() => void handleClear()} size="sm" variant="secondary">
                  {t('settings.cookiesSetup.clearSetup')}
                </Button>
              ) : null}
            </div>
          </ItemActions>
        </Item>
      </ItemGroup>

      {currentBrowserUnsupported ? (
        <ItemGroup>
          <Item variant="muted">
            <ItemContent>
              <ItemTitle className="text-destructive">
                {t('settings.cookiesSetup.windowsUnsupportedCurrent', {
                  browser: browserLabel(browserForCookiesValue, t)
                })}
              </ItemTitle>
            </ItemContent>
          </Item>
        </ItemGroup>
      ) : null}

      {showRecommended ? (
        <ItemGroup>
          <Item variant="muted">
            <ItemContent>
              <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                {t('settings.cookiesSetup.recommendedTitle')}
              </p>
              <ItemTitle>{recommendedCopy.title}</ItemTitle>
              <ItemDescription>{recommendedCopy.hint}</ItemDescription>
              {recommendation.method === 'file' ? (
                <ul className="list-inside list-disc space-y-1 text-muted-foreground text-sm">
                  <li>{t('settings.cookiesSetup.fileExportStep1')}</li>
                  <li>{t('settings.cookiesSetup.fileExportStep2')}</li>
                  <li>{t('settings.cookiesSetup.fileExportStep3')}</li>
                </ul>
              ) : null}
            </ItemContent>
            <ItemActions>
              <Button onClick={() => void handleRecommendedAction()}>
                {recommendedCopy.action}
              </Button>
            </ItemActions>
          </Item>
        </ItemGroup>
      ) : null}

      <ItemGroup>
        <Item variant="muted">
          <ItemContent>
            <ItemTitle>{t('settings.browserForCookies')}</ItemTitle>
            <ItemDescription>{t('settings.browserForCookiesDescription')}</ItemDescription>
            {platform === 'win32' ? (
              <ItemDescription>{t('settings.browserForCookiesWindowsNote')}</ItemDescription>
            ) : null}
          </ItemContent>
          <ItemActions>
            <Select
              onValueChange={(value) => {
                if (value === 'none') {
                  void handleSettingChange('browserForCookies', 'none')
                  return
                }
                void applyBrowser(value as CookieBrowserId)
              }}
              value={selectedBrowserValue}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('settings.none')}</SelectItem>
                {selectableBrowsers.map((browser) => (
                  <SelectItem key={browser} value={browser}>
                    {browserLabel(browser, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ItemActions>
        </Item>

        {showProfileField ? (
          <>
            <ItemSeparator />
            <Item variant="muted">
              <ItemContent className="basis-full">
                <ItemTitle>{t('settings.browserForCookiesProfile')}</ItemTitle>
                <ItemDescription>
                  {t('settings.browserForCookiesProfileDescription')}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="basis-full">
                <div className="relative w-full">
                  <Input
                    className="w-full pr-10"
                    onChange={(event) => {
                      void handleSettingChange(
                        'browserForCookies',
                        buildBrowserCookiesSetting(browserForCookiesValue, event.target.value)
                      )
                    }}
                    placeholder={t('settings.browserForCookiesProfilePlaceholder')}
                    value={browserCookiesProfileValue}
                  />
                  {showBrowserProfileWarning ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="absolute top-1/2 right-3 inline-flex h-4 w-4 -translate-y-1/2 items-center justify-center text-amber-500">
                          <AlertTriangle aria-hidden className="h-4 w-4" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {getBrowserProfileWarningMessage(profileValidation.reason)}
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>
              </ItemActions>
            </Item>
          </>
        ) : null}
      </ItemGroup>

      <ItemGroup>
        <Item variant="muted">
          <ItemContent>
            <ItemTitle>{t('settings.cookiesFile')}</ItemTitle>
            <ItemDescription>
              {t('settings.cookiesSetup.recommendedImportFileHint')}
            </ItemDescription>
            <div className="flex flex-wrap gap-3 pt-1">
              <Button
                className="px-0"
                onClick={() => void handleOpenLink(COOKIES_CHROME_EXTENSION_URL)}
                variant="link"
              >
                {t('settings.cookiesSetup.fileExportExtension')}
              </Button>
              <Button
                className="px-0"
                onClick={() => void handleOpenLink(COOKIES_FIREFOX_EXTENSION_URL)}
                variant="link"
              >
                {t('settings.browserOptions.firefox')}
              </Button>
            </div>
          </ItemContent>
          <ItemActions>
            <div className="flex w-full max-w-md gap-2">
              <Input className="flex-1" readOnly value={cookiesPathValue} />
              <Button onClick={() => void handleSelectCookiesFile()}>
                {t('settings.selectPath')}
              </Button>
            </div>
          </ItemActions>
        </Item>
      </ItemGroup>

      <ItemGroup>
        <Item variant="muted">
          <ItemContent>
            <ItemTitle>{t('settings.cookiesGuideTitle')}</ItemTitle>
            <ItemDescription>{t('settings.cookiesGuideDescription')}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              className="px-0"
              onClick={() => void handleOpenLink(COOKIES_GUIDE_URL)}
              variant="link"
            >
              {t('settings.cookiesGuideLink')}
            </Button>
          </ItemActions>
        </Item>
      </ItemGroup>
    </div>
  )
}

/**
 * True when cookie health is good enough to retry an authenticated download.
 *
 * @param health Cookie health snapshot.
 */
export const isCookieHealthReady = (health: CookieHealth): boolean => health.status === 'ok'
