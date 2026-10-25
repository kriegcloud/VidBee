# OnlyFans profiles

OnlyFans profile links open the same shared dialog on desktop and web. Choose
**Open browser** and sign in using the dedicated browser on the VidBee host.
This uses a persistent browser profile inside the host's OnlyFans storage
directory. It never imports the user's regular Chrome cookies or local storage.

Choose **Map** to scan the combined **Media** feed. **All**, **Photos**, and
**Videos** filter the saved results without restricting the scan. VidBee observes the normal site's
post responses while scrolling the selected profile. Reopen a map using **Saved profiles** or the
**OnlyFans · Map** action in a downloaded item’s context menu. Counts update during
mapping. **Stop mapping** retains discovered references, and the profile appears
in **Saved profiles**. Reopening or refreshing merges media by ID. A refresh
starts at the top of the current site feed; it does not replay an API cursor.

Mapping reports complete only when the site explicitly returns no more pages.
Eight minutes without a matching feed response, or the two-hour scan deadline,
produces a partial map, not a claim that every post was found. Closing the dialog leaves mapping running; the stop
button or exiting VidBee stops it.

Select available originals and choose **Download selected**. Downloads appear
in the normal task queue. Each download refreshes the original media URL by
opening its post in the dedicated browser. The CDN transfer sends no account
cookies; partial transfers are not marked complete. Locked items and DRM-only
videos are shown but cannot be selected. DRM recording is not implemented.

Chat links (`/my/chats/chat/<id>`) also open the dedicated map dialog. Chat maps
are saved independently of creator profiles, with All/Photos/Videos filters.
Mapping observes the selected conversation's message responses and scrolls upward
through older messages. Downloads revisit the attachment's message using its
`firstId` link to refresh access before transferring an available original.
Gallery routes revisit `/media/<id>` instead. Locked messages remain
unselectable; the mapper does not purchase or unlock them.
Message text is not saved. Saved profiles and downloaded-item context menus reopen
chat maps as well as profile maps. Opening a conversation may mark messages read
through the site's normal behavior.

### Chat gallery targets

The dialog lists six source routes for a chat. Each route has its own saved map,
so a partial scan or an empty filter does not overwrite another route's items.
The All, Photos, and Videos controls below them filter the current map by file
kind. Opened and Purchased are access views chosen by the site page, not file
kinds; they can contain either photos or videos.

The mapper does not check the site's query string. Any
`/api2/v2/chats/<id>/media` response for the selected chat counts for every
gallery route, so a change to the site's filter parameters does not break
matching. The page itself decides what Opened and Purchased load. Photos and
Videos also drop any item whose category differs from the route.

| Source | Page suffix | Observed API feed | Items kept |
| --- | --- | --- | --- |
| Messages | none | `/messages` | every attachment |
| Gallery | `/gallery` | `/media` | every item |
| Opened | `/gallery/opened` | `/media` | every item the page loads |
| Purchased | `/gallery/purchased` | `/media` | every item the page loads |
| Photos | `/gallery/photos` | `/media` | photos only, filtered by VidBee |
| Videos | `/gallery/videos` | `/media` | videos only, filtered by VidBee |

`onlyFansChatTargets` (downloader-core) defines each route's page suffix and
feed. The browser mapper's `collect()` applies the photo/video category check.
`BrowserProfileAdapter` supplies each site's feed matcher, completion rule,
scroll direction, queue URL, and authenticated refresh route. The shared
browser mapper uses those functions for OnlyFans and Fansly; it does not copy
credentials to the download worker. `resolveDownloadWorkflow` is the shared
Add URL decision table: OnlyFans and Fansly profiles use the dedicated browser
mapper, Instagram profiles use the native Instagram mapper, and general single
items and playlists continue through their registered downloaders, including
yt-dlp. Desktop and web use the same resolver and dialog.
Adding a route means defining its URL and feed and then testing both the
shared dialog and the provider adapter. Adding another site means supplying a
URL resolver and the appropriate mapper or downloader for its authentication
and media capabilities.

The six route fixtures and response matchers are covered by offline tests. They
do not prove the current site returns those responses for a signed-in account.
Live acceptance requires opening each example route in the dedicated session,
mapping it, checking that the selected route contains the expected items, and
downloading one available item from a gallery route. Do not mark an empty or
partial map as complete without the site's end marker.

### Chat and creator links

When a chat map opens or maps, VidBee reads the creator link in the chat page
header. If it finds one, every saved route for that chat records the creator's
username (`creatorUsername`), and the creator's saved profile records the chat
(`linkedChatId`). After that the dialog shows the creator's **Posts** as an extra
source before the chat routes, and the creator's profile dialog lists the chat
routes too. The dialog title shows `@creator`, not the numeric chat id. Queued
chat downloads are titled with the creator's handle.

Download history groups OnlyFans and Fansly tasks by creator, reading the creator
from each task's queued URL, because these tasks have no batch id. Chat tasks
join the linked creator's group. A chat with no recorded link stays in its own
group, keyed by chat id.

### Purchased collections

Purchased collection links
(`/my/collections/user-lists/purchased/posts/<userId>`) open the same dialog.
There are five sources, and each has its own saved map:

| Source | Query |
| --- | --- |
| All | none |
| Photos | `?postType=photos` |
| Videos | `?postType=videos` |
| Posts | `?entityType=posts` |
| Messages | `?entityType=messages` |

Any other query is rejected. Mapping watches `/api2/v2/posts/paid` responses whose
`userId` (or `user_id` / `user`) matches the collection, and scrolls the page's
inner pane. Photos and Videos also keep only items of that category. Downloads
reopen the collection page to refresh access; no post permalink is used.

### Refreshing covered media

Before a download, the mapper reopens the item's post, message, or collection
page and waits for a response that contains the item's original URL. If that
response has no URL, the media may still be behind the site's **Click to open**
cover. When exactly one such cover is visible in the viewport, VidBee clicks it
and waits up to 15 seconds for a response carrying that item's original. If no
cover, or more than one, is visible, it does not click and the normal retry and
lock handling apply. VidBee never opens a cover it cannot attribute to a single
item.

Desktop and web share the schemas, mapping service, executor and UI. A web/API
host needs an installed Chrome-family browser and a graphical session accessible
to the user. The browser opens on that host, not on a remote web client's device.

Legacy OnlyFans yt-dlp previews/downloads are rejected before cookie extraction.
Old queued OnlyFans entries are intercepted before the yt-dlp/DRM-fallback route.
This prevents retries from replaying the Chrome session implicated in the
reported "Wrong user" logout. It does not restore a session already revoked by
the site; sign in again in the dedicated browser.

Tests:

- pnpm --filter @vidbee/browser-capture exec vitest run test/onlyfans-profile.test.ts
- pnpm --filter @vidbee/downloader-core exec vitest run test/yt-dlp-args.test.ts
- pnpm run check

Live acceptance additionally requires a user sign-in, mapping an accessible
profile, downloading an available original, and confirming the user's regular
Chrome session survives. Offline fixtures cannot establish this live result.

## Workstation verification (2026-09-28)

The installed AppImage was tested with a user-signed-in dedicated browser.
The photo scan reached the site's end marker with 484 photo references and two
video references from those responses. A subsequent video scan saved three more
video references and correctly reported a partial map. Saved profiles reopened
through the installed UI and survived restart.

An original JPEG completed through the normal task queue (2,967,890 bytes,
3840 × 5760). The dedicated session survived the restart and subsequent download.
Photo tasks include the collection manifest required by the queue's completion
guard; a regression test covers that guard. The user's regular Chrome login
status still requires their confirmation. The exported cookie file was not
replayed in this test.

## Chat verification (2026-09-29)

The installed AppImage routed a `/my/chats/chat/<id>/` URL from Add URL into the
chat dialog. The existing dedicated session mapped three attachments (one
available, two locked) and reached the site's end marker. The available JPEG
completed through the task queue (1,123,270 bytes), refreshing its message via
`firstId`. Saved profiles reopened the same chat map with the download marked
complete. No cookies were imported. Database integrity checks passed.
