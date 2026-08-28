import { join } from 'node:path'
import { type LanguageCode, normalizeLanguageCode } from '@vidbee/i18n/languages'
import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron'
import windowsTrayIcon from '../../build/icon.ico?asset'
import appIcon from '../../resources/icon.png?asset'
import trayIcon from '../../resources/tray-icon.png?asset'
import { settingsManager } from './settings'

let tray: Tray | null = null

/**
 * Get translated text based on current language setting
 */
function t(key: 'showHome' | 'openDevTools' | 'quit'): string {
  const language = normalizeLanguageCode(settingsManager.get('language'))

  const translations: Record<LanguageCode, Record<'showHome' | 'openDevTools' | 'quit', string>> = {
    en: {
      showHome: 'Show Home',
      openDevTools: 'Open DevTools',
      quit: 'Quit'
    },
    es: {
      showHome: 'Mostrar inicio',
      openDevTools: 'Abrir DevTools',
      quit: 'Salir'
    },
    ar: {
      showHome: 'إظهار الصفحة الرئيسية',
      openDevTools: 'فتح أدوات المطور',
      quit: 'إنهاء'
    },
    id: {
      showHome: 'Tampilkan Beranda',
      openDevTools: 'Buka DevTools',
      quit: 'Keluar'
    },
    pt: {
      showHome: 'Mostrar página inicial',
      openDevTools: 'Abrir DevTools',
      quit: 'Sair'
    },
    fr: {
      showHome: "Afficher l'accueil",
      openDevTools: 'Ouvrir les DevTools',
      quit: 'Quitter'
    },
    it: {
      showHome: 'Mostra Home',
      openDevTools: 'Apri DevTools',
      quit: 'Esci'
    },
    tr: {
      showHome: 'Ana Sayfayı Göster',
      openDevTools: "DevTools'u Aç",
      quit: 'Çıkış'
    },
    zh: {
      showHome: '显示主页',
      openDevTools: '打开开发者工具',
      quit: '退出应用'
    },
    'zh-TW': {
      showHome: '顯示主頁',
      openDevTools: '開啟開發者工具',
      quit: '退出應用程式'
    },
    ko: {
      showHome: '홈 표시',
      openDevTools: '개발자 도구 열기',
      quit: '종료'
    },
    ja: {
      showHome: 'ホームを表示',
      openDevTools: '開発者ツールを開く',
      quit: '終了'
    },
    ru: {
      showHome: 'Показать главную',
      openDevTools: 'Открыть DevTools',
      quit: 'Выход'
    },
    de: {
      showHome: 'Startseite anzeigen',
      openDevTools: 'DevTools öffnen',
      quit: 'Beenden'
    }
  }

  return translations[language][key]
}

/**
 * Find the main window
 */
function findMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows()
  return windows.find((window) => !window.isDestroyed()) || null
}

/**
 * Restore, show, and focus a window.
 */
function showAndFocusWindow(window: BrowserWindow): void {
  if (window.isMinimized()) {
    window.restore()
  }
  window.show()
  window.focus()
}

/**
 * Return the existing main window or create one when needed.
 */
async function ensureMainWindow(): Promise<BrowserWindow | null> {
  let mainWindow = findMainWindow()
  if (!mainWindow) {
    const { createWindow } = await import('./index')
    createWindow()
    mainWindow = findMainWindow()
  }
  return mainWindow
}

/**
 * Resolve a visible tray icon for the current platform and build mode.
 */
function resolveTrayIconPath(): string {
  if (process.platform === 'win32') {
    return windowsTrayIcon
  }
  if (app.isPackaged) {
    const fileName = process.platform === 'darwin' ? 'tray-icon.png' : 'icon.png'
    return join(process.resourcesPath, 'resources', fileName)
  }
  if (process.platform === 'darwin') {
    return trayIcon
  }
  return appIcon
}

/**
 * Create context menu for tray
 */
function createContextMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: t('showHome'),
      click: () => {
        const mainWindow = findMainWindow()
        if (mainWindow) {
          showAndFocusWindow(mainWindow)
        }
      }
    },
    {
      label: t('openDevTools'),
      click: async () => {
        const mainWindow = await ensureMainWindow()
        if (!mainWindow) {
          return
        }
        showAndFocusWindow(mainWindow)
        mainWindow.webContents.openDevTools()
      }
    },
    {
      type: 'separator'
    },
    {
      label: t('quit'),
      click: () => {
        app.quit()
      }
    }
  ])
}

/**
 * Create system tray icon
 */
export function createTray(): void {
  if (tray) {
    return
  }

  const trayIconImage = nativeImage.createFromPath(resolveTrayIconPath())

  // Let macOS tint the menu bar icon for light and dark appearances.
  if (process.platform === 'darwin') {
    trayIconImage.setTemplateImage(true)
  }

  tray = new Tray(trayIconImage)

  // Set tooltip
  tray.setToolTip('VidBee')

  // Set context menu
  tray.setContextMenu(createContextMenu())

  // On Windows/Linux: click to show/hide main window
  tray.on('click', async () => {
    const mainWindow = findMainWindow()
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        // If window is visible, hide it
        mainWindow.hide()
      } else {
        // If window is hidden or minimized, show it
        if (mainWindow.isMinimized()) {
          mainWindow.restore()
        }
        mainWindow.show()
        mainWindow.focus()
      }
    } else {
      // If no main window exists, create a new one
      const { createWindow } = await import('./index')
      createWindow()
    }
  })
}

/**
 * Update tray menu (call this when language changes)
 */
export function updateTrayMenu(): void {
  if (tray) {
    tray.setContextMenu(createContextMenu())
  }
}

/**
 * Destroy tray icon
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
