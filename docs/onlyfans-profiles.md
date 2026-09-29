# OnlyFans profiles

OnlyFans profile links open the same shared dialog on desktop and web. Choose
**Open browser** and sign in using the dedicated browser on the VidBee host.
This uses a persistent browser profile inside the host's OnlyFans storage
directory. It never imports the user's regular Chrome cookies or local storage.

Choose **Photos** or **Videos**, then **Map**. VidBee observes the normal site's
post responses while scrolling the selected profile. Counts update during
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
videos are shown but cannot be selected. Messages, purchased chat galleries,
and DRM recording are not implemented by this profile flow.

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
