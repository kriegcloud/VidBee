# Profile subscriptions

Subscribe now accepts social accounts as well as RSS feeds. A profile
subscription follows chosen categories of one account and auto-downloads
anything new. VidBee Desktop runs the checks; the web app lists profile
subscriptions read-only and refuses to create them
(`SUBSCRIPTION_PROFILE_DESKTOP_ONLY`).

| Platform | Categories | Mapper |
| --- | --- | --- |
| Instagram | stories, highlights, posts, reels, tagged | Instagram inspector (`instagram_web.py`) |
| TikTok | stories, posts | `social_media.py`, dedicated session |
| X | posts-with-media (the Posts tab), media | `social_media.py`, dedicated session |
| Threads | media | `threads_web.py`, Settings cookies |
| Snapchat | stories (current story + saved highlights), spotlight | `snapchat_web.py`, no login |

The catalog lives in `PROFILE_SUBSCRIPTION_CATEGORIES`
(`packages/subscriptions-core/src/types.ts`). The resolver, the form dialog,
input validation and the desktop fetcher all read it.

## How a check works

1. The scheduler wakes every 5 minutes and checks subscriptions that are due.
   A subscription is due at `nextCheckAt`, or `lastCheckedAt + checkIntervalMs`
   (default 3 h) when there is no `nextCheckAt` (`isSubscriptionDue`). RSS
   feeds still need the leader lease; profile checks run on the host that has
   a profile fetcher, which is Desktop.
2. `ProfileSourceFetcher` (`apps/desktop/src/main/lib/profile-subscriptions.ts`)
   maps each followed category through the same mappers the profile dialogs
   use. Saved profiles and subscriptions therefore share one map.
   - X, TikTok and Threads refresh incrementally. Once a category has completed
     one full map, a check stops after 12 consecutive already-saved posts.
   - Instagram uses its inspector's own incremental cursor.
3. `decideProfileDownloads` (`profile-policy.ts`) merges the mapped items into
   `subscription_items` with ids `<category>:<platform id>`. It queues every
   id it has not seen before, once per URL.
   - The first check queues the whole backlog.
   - The history dedupe skips posts that are already downloaded.
   - Rows are merged, never replaced, so an expired story or a category that
     failed this time stays in the seen history.
4. The next check is `retryAfter` when a platform rate-limited the check.
   Otherwise it is the interval with ±10% jitter. The status becomes
   `rate-limited`, `auth-required` or `failed` when the worst followed
   category failed that way.

## Downloads

- **Instagram:** queues `instagram-profile-category` tasks into
  `<dir>/Instagram/<user>/<Category>`, one at a time.
- **X and TikTok:** queue `social-media` tasks in their per-site groups.
- **Threads and Snapchat:** queue under the subscription's group, one task at
  a time.
  - Snapchat story snaps download through
    `https://www.snapchat.com/@user/stories?vidbee_snap=<file id>`; the module
    narrows the page to that one snap.
  - Spotlight posts download through gallery-dl's own `/@user/spotlight/<id>`.
  - Files land in `<dir>/Snapchat/<user>/{Stories,Spotlight}/<date>_<file id>`.

Removing a subscription cancels its active tasks. It cancels by group and also
by each item's linked task id, because Instagram and X/TikTok items queue
outside the subscription's group.

## Snapchat limits

The logged-out profile page embeds all public data in `__NEXT_DATA__`: the
current story, saved highlights, and roughly the newest 16 Spotlight posts.
This was checked on 2026-10-24 by scrolling the Spotlight tab of a large
account: the web client never requested another page. The newest items always
appear, so new posts are caught. An account's older Spotlight backlog beyond
that first page cannot be reached without signing in. Empty `storyType: 0`
entries are removed posts and are skipped.

Stories expire after 24 hours. Use an interval of 12 hours or less for
accounts whose stories matter.
