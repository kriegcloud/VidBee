import { createContext, type ReactNode, useContext, useLayoutEffect } from 'react'

export interface DesktopChromeContextValue {
  appVersion: string
  onOpenAbout: () => void
  onOpenCookiesSettings: () => void
  onOpenSettings: () => void
  onOpenSupportedSites: () => void
  setTitleBar: (content: ReactNode) => void
}

export const DesktopChromeContext = createContext<DesktopChromeContextValue | null>(null)

/**
 * Replace the desktop title bar contents while the caller stays mounted.
 *
 * @param content Header nodes rendered inside the shared window drag region.
 */
export const useTitleBar = (content: ReactNode): void => {
  const chrome = useContext(DesktopChromeContext)

  useLayoutEffect(() => {
    if (!chrome) {
      return
    }
    chrome.setTitleBar(content)
    return () => {
      chrome.setTitleBar(null)
    }
  }, [chrome, content])
}
