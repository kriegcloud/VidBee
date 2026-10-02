# Fansly profiles

Fansly profile URLs ending in `/posts` or `/media` open the shared profile mapper
on desktop and web. The **Posts** and **Media** controls select which site feed
to scan. **All**, **Photos**, and **Videos** filter the discovered items; either
feed can contain both photos and videos. Closing the dialog preserves the map.
Reopen it through **Saved profiles** or **Fansly · Map** in a download's context
menu.

## Login and browser ownership

**Open browser** launches an ordinary dedicated Chrome window, without automation
or debugging enabled, so Google sign-in can work. Sign in to Fansly there, then
close that dedicated window before choosing **Map**. The mapper reuses its saved
browser profile. The regular Chrome profile is never read or modified. A web/API
host needs Chrome and a graphical session; the window opens on that host.

Fansly authentication uses a browser session token in addition to cookies. A
Netscape cookie export alone does not provide that token. Tokens stay in the
browser; VidBee does not construct authenticated API requests or copy account
credentials to CDN downloads. The supplied workstation cookie file was imported
once into the dedicated browser during setup. Its values are not part of the
application, profile maps, or logs.

## Mapping and downloads

The mapper observes the normal site's responses for the selected creator's
`timelinenew`/`timeline` or media-offer location feed. It follows the page's scroll
container and joins media bundles to posts. A media location's `locationId` is a
timeline identifier; its `correlationId` is the original post identifier.
Unrelated recommendations and messages are not collected. Stop retains discovered
references and closes the mapping browser before a subsequent download reopens it.
A refresh starts at the top and merges by media ID. Saved maps do not contain
signed media URLs. A quiet page or time limit reports a partial map; completion
requires an explicit end marker or empty feed response.

Downloads revisit the original post in the browser to refresh expiring locations.
Available direct image/video files are streamed from validated Fansly CDN hosts
without account cookies. Images are not substituted for video files. Locked
previews are not substituted for accessible originals. If no supported direct
file is supplied, the item is shown as unavailable; HLS/DASH-only files, DRM,
messages, and purchases are not implemented. The feature does not unlock content.

## Verification

Live checks against `meduzza` on 2026-09-29 used isolated public sessions:

- Media: one page, 31 references; a 3,144,485-byte JPEG verified at 3024 × 4032.
- Posts: one page, 32 references; a 59,078,472-byte MP4 verified as H.264/AAC,
  1280 × 720, duration 664.532 seconds.
- Both scans were stopped deliberately and are partial, not full-profile scans.

The user's dedicated browser sign-in was shown in a screenshot. Authenticated
private-media access is not established by the public-session checks.

The packaged desktop app also completed the photo task in its normal queue.
URL entry, source controls, filters, Saved profiles, and the downloaded-item
context-menu map action were verified in an isolated instance. The installed
launcher points to the new AppImage for next launch; active user downloads were
left running in the previous build. A merged partial map retains 37 public
references discovered during these checks.
