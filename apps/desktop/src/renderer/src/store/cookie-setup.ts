import type { CookieSetupFailureKind } from '@vidbee/downloader-core/cookie-setup'
import { atom } from 'jotai'

export interface CookieSetupRequest {
  downloadId?: string
  failureKind: CookieSetupFailureKind
}

export const cookieSetupRequestAtom = atom<CookieSetupRequest | null>(null)

export const cookieSetupAutoPromptedAtom = atom(false)
