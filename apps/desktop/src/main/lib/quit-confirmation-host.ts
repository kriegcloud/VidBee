import { type TranslationDictionary, translationResources } from '@vidbee/i18n'
import { normalizeLanguageCode } from '@vidbee/i18n/languages'
import { app, BrowserWindow, dialog } from 'electron'
import { settingsManager } from '../settings'
import { peekDesktopTaskQueueRef } from './queue-ref'
import {
  buildQuitConfirmCopy,
  countInProgressTasks,
  createQuitConfirmationController,
  type QuitConfirmStrings
} from './quit-confirmation'

const FALLBACK_COPY: QuitConfirmStrings = {
  title: 'Quit VidBee?',
  message: '{{count}} task is still in progress. Quitting will interrupt it.',
  messagePlural: '{{count}} tasks are still in progress. Quitting will interrupt them.',
  quit: 'Quit',
  cancel: 'Cancel'
}

/**
 * Read localized quit-confirm strings, falling back to English.
 */
const loadQuitConfirmStrings = (): QuitConfirmStrings => {
  const language = normalizeLanguageCode(settingsManager.get('language'))
  const bundle = translationResources[language] ?? translationResources.en
  const translation = (bundle as { translation?: TranslationDictionary } | undefined)?.translation
  const strings = translation?.app.quitConfirm

  return {
    title: strings?.title ?? FALLBACK_COPY.title,
    message: strings?.message ?? FALLBACK_COPY.message,
    messagePlural: strings?.messagePlural ?? FALLBACK_COPY.messagePlural,
    quit: strings?.quit ?? FALLBACK_COPY.quit,
    cancel: strings?.cancel ?? FALLBACK_COPY.cancel
  }
}

/**
 * Count in-progress queue tasks, or 0 when the queue is not ready.
 */
const readInProgressTaskCount = (): number => {
  const queue = peekDesktopTaskQueueRef()
  if (!queue) {
    return 0
  }
  return countInProgressTasks(queue.stats().byStatus)
}

/**
 * Ask the user whether to quit while tasks are still running.
 */
const confirmQuitWithDialog = async (count: number): Promise<boolean> => {
  const copy = buildQuitConfirmCopy(loadQuitConfirmStrings(), count)
  const parent = BrowserWindow.getAllWindows().find(
    (window) => !window.isDestroyed() && window.isVisible()
  )
  const options: Electron.MessageBoxOptions = {
    type: 'warning',
    buttons: [copy.cancel, copy.quit],
    defaultId: 0,
    cancelId: 0,
    title: copy.title,
    message: copy.title,
    detail: copy.message,
    noLink: true
  }
  const result = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options)
  return result.response === 1
}

const controller = createQuitConfirmationController({
  getInProgressCount: readInProgressTaskCount,
  confirmQuit: confirmQuitWithDialog,
  quit: () => {
    app.quit()
  }
})

/**
 * Allow the next quit (updates) to skip the in-progress confirmation.
 */
export const allowAppQuit = (): void => {
  controller.allow()
}

/**
 * Intercept a quit attempt when tasks are in progress.
 * Returns true when the caller should preventDefault and wait.
 */
export const deferAppQuitIfNeeded = (): boolean => controller.handleQuitAttempt() === 'defer'
