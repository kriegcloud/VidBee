# Product: VSCO Gallery Download

## Problem

Saving a complete VSCO profile gallery currently means repeatedly loading more posts, opening the final image, moving backward through the lightbox, and manually saving each image. The process is slow, easy to interrupt, and can accidentally save a smaller display copy instead of the best image available. A VidBee user should be able to provide a VSCO gallery link, use their existing signed-in access when needed, and receive the complete gallery without babysitting the browser.

## Success metric

For each acceptance-test gallery, VidBee saves exactly one highest-available-resolution image or available video for 100% of the gallery assets visible to the authenticated user, with zero manual scrolling, lightbox navigation, or per-item save actions after the download begins.

## Announcement — the blog post before the feature

VidBee can now download complete VSCO profile galleries. Paste a VSCO gallery link, choose your existing browser-cookie file when the gallery requires your signed-in access, and start the download just as you already do for Instagram. VidBee finds every available photo and video, saving native-resolution images even when VSCO initially shows only part of the gallery. Progress and failures remain visible in the familiar download queue, so large galleries no longer require repetitive browser work.

## Screens

- `mockups/download-vsco-gallery.html` — the existing VidBee download screen recognizing a VSCO gallery URL and explaining the complete-gallery result before the user starts it.

## Product boundaries

- The first release covers photos and videos in VSCO profile gallery pages.
- It downloads only posts that the user can legitimately view with the access they provide.
- One saved file represents one gallery asset; duplicate discovery must not create duplicate files.
- The best image resolution available to VidBee is preferred over thumbnails or viewport-sized copies.
- Interrupted or individual failed items must be reported rather than silently omitted.
- Journals, collections, reposts, and bulk downloads across multiple profiles are outside the first release unless they are already handled automatically by the existing download experience.
