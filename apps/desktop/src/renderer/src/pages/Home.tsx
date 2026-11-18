import { UnifiedDownloadHistory } from '../components/download/UnifiedDownloadHistory'

interface HomeProps {
  onOpenSupportedSites?: () => void
  onOpenSettings?: () => void
  onOpenCookiesSettings?: () => void
}

export function Home({ onOpenSupportedSites, onOpenSettings, onOpenCookiesSettings }: HomeProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <UnifiedDownloadHistory
          onOpenCookiesSettings={onOpenCookiesSettings}
          onOpenSettings={onOpenSettings}
          onOpenSupportedSites={onOpenSupportedSites}
        />
      </div>
    </div>
  )
}
