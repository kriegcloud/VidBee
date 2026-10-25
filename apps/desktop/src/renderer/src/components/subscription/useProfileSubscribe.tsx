import { createSubscriptionAtom, subscriptionsAtom } from '@renderer/store/subscriptions'
import { useAtomValue, useSetAtom } from 'jotai'
import { type ReactNode, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { logger } from '../../lib/logger'
import { SubscriptionFormDialog } from './SubscriptionFormDialog'

interface ProfileSubscribe {
  /** True when this account already has a profile subscription. */
  isSubscribed: (platform: string | undefined, owner: string | undefined) => boolean
  /** Open the add-subscription form prefilled with a profile URL. */
  openSubscribe: (profileUrl: string) => void
  dialog: ReactNode
}

/** Let profile mappers start a subscription for the account they show. */
export function useProfileSubscribe(): ProfileSubscribe {
  const { t } = useTranslation()
  const subscriptions = useAtomValue(subscriptionsAtom)
  const createSubscription = useSetAtom(createSubscriptionAtom)
  const [profileUrl, setProfileUrl] = useState<string | null>(null)

  const isSubscribed = useCallback(
    (platform: string | undefined, owner: string | undefined) =>
      Boolean(platform && owner) &&
      subscriptions.some(
        (subscription) =>
          subscription.sourceKind === 'profile' &&
          subscription.platform === platform &&
          subscription.profileOwner?.toLowerCase() === owner?.toLowerCase()
      ),
    [subscriptions]
  )

  const dialog = profileUrl ? (
    <SubscriptionFormDialog
      initialUrl={profileUrl}
      mode="add"
      onClose={() => setProfileUrl(null)}
      onSave={async (data) => {
        try {
          await createSubscription({
            url: data.url ?? profileUrl,
            tags: data.tags?.join(', '),
            autoDownload: data.autoDownload,
            downloadDirectory: data.downloadDirectory,
            categories: data.categories,
            checkIntervalMs: data.checkIntervalMs ?? undefined
          })
          toast.success(t('subscriptions.notifications.created'))
          setProfileUrl(null)
        } catch (error) {
          logger.error('Failed to create profile subscription:', error)
          toast.error(
            String(error).includes('SUBSCRIPTION_DUPLICATE_FEED_URL')
              ? t('subscriptions.notifications.duplicateUrl')
              : t('subscriptions.notifications.createError')
          )
        }
      }}
      open
    />
  ) : null

  return { isSubscribed, openSubscribe: setProfileUrl, dialog }
}
