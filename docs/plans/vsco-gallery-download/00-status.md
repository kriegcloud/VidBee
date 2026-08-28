# Status: VSCO Gallery Download

- Gate 1 — Product: APPROVED 2026-08-27
- Gate 2 — Architecture: awaiting approval
- Gate 3 — Program Design: pending
- Gate 4 — Slice plan: pending

## Slices

- [ ] Slice 1 — tracer bullet: pending Gate 4

## Notes for a fresh session

- Work on the existing `vendor-yt-dlp` branch; do not switch branches.
- Preserve the unrelated dirty vendored yt-dlp, workflow, Docker, ignore-file, and desktop-resource changes already present.
- The user wants VidBee's existing Instagram-style authenticated download experience extended to VSCO profile gallery URLs.
- The target example is `https://vsco.co/allybari/gallery`.
- A successful gallery download discovers every post available to the signed-in user and saves the highest-resolution image for each post without manual scrolling or lightbox navigation.
- Authentication should reuse VidBee's existing Netscape cookie-file experience rather than requesting raw credentials.
