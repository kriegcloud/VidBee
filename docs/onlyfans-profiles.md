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
A quiet page or the ten-minute scan limit produces a partial map, not a claim
that every post was found. Closing the dialog leaves mapping running; the stop
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
Locked messages remain unselectable; the mapper does not purchase or unlock them.
Message text is not saved. Saved profiles and downloaded-item context menus reopen
chat maps as well as profile maps. Opening a conversation may mark messages read
through the site's normal behavior.

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
