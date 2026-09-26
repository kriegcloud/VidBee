import { FolderOpen, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from './dropdown-menu'

interface SavedProfile {
  mapping?: { state: 'queued' | 'running' }
  inspectionId: string
  profile: { username: string; profileUrl: string }
  totalAssetCount: number
}

export function SavedInstagramProfiles({
  loadProfiles,
  onSelect
}: {
  loadProfiles: () => Promise<SavedProfile[]>
  onSelect: (url: string) => void
}) {
  const { t } = useTranslation()
  const [profiles, setProfiles] = useState<SavedProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setProfiles(await loadProfiles())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('instagramProfile.scanFailed'))
    } finally {
      setLoading(false)
    }
  }
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) {
          void load()
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <FolderOpen aria-hidden className="size-4" />
          {t('instagramResume.savedProfiles')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-80 overflow-y-auto">
        {loading ? (
          <div aria-label={t('download.loading')} className="flex justify-center p-4" role="status">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : error ? (
          <p className="p-3 text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : profiles.length === 0 ? (
          <p className="p-3 text-muted-foreground text-sm">
            {t('instagramResume.noSavedProfiles')}
          </p>
        ) : (
          profiles.map((profile) => (
            <DropdownMenuItem
              key={profile.inspectionId}
              onSelect={() => onSelect(profile.profile.profileUrl)}
            >
              <span className="min-w-0 flex-1 truncate">@{profile.profile.username}</span>
              <span className="text-muted-foreground text-xs">
                {profile.mapping
                  ? t(
                      profile.mapping.state === 'queued'
                        ? 'instagramResume.queued'
                        : 'instagramProfile.scanning'
                    )
                  : t('instagramProfile.assetTotal', { count: profile.totalAssetCount })}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
