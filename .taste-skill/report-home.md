# Home lane report

Home answers: “What's downloading, and what did I get?” The media list remains the main surface; Add URL is the primary action. Existing shell/theme and other workers' changes were preserved. No commits were created, and no packages/ui or packages/i18n files were edited by this lane.

## Changes

- Added `lib/download-display-title.ts`: non-URL record title → metadata/transcript episode title → saved output basename without extension → source name plus a short host/path tail. Row accessible names, image alt text, logs title, playlist group names and contextual source rows use the fallback. The raw URL is available as a title tooltip.
- Updated the existing `lib/transcript-playback-source.ts` builder to use the same helper so new and restored now-playing inputs share the title rule. This is the requested shared-helper exception to the component scope; the playback bar itself was not edited.
- Download rows use a fixed 96×54 media slot with 6px radius and no border. Missing/loading images use the flat muted slot with a 16px desaturated source glyph.
- Metadata uses 13px muted tabular text and middle-dot separators. Dates use the app locale and Today/Yesterday plus local clock, month/day within the year, and YYYY-MM-DD for older years. Sizes retain real zero, render missing values as an em dash, and use one decimal with a lighter unit. Agent counts are sentence case; AI-created provenance remains grey.
- All pending/downloading/processing rows have a rounded 4px data/track progress bar. Known percent uses the reported ratio (bounded to 0–100); an unknown ratio has an empty track and an em dash. Percent, reported speed and ETA sit in a right-aligned grey tabular block; missing figures use em dashes.
- Playlist groups retain their live aggregate calculation, use the same 4px bar while active, and remove the full-width underline. Completed groups retain muted counts with no bar.
- Added a Home-local filter bar, preserving source filtering and counts without editing packages/ui. Chips have neutral active/hover fills, no borders, grey tabular counts and 32px height. On narrow windows the source cluster scrolls horizontally. Saved profiles remains outline; Add URL uses the existing inverted primary, with all toolbar buttons set to 32px.
- Rows use an 8px hover/selected surface; selected rows keep the active fill on hover. Actions stay grey. Currently playing titles use text-data. Removed the remaining text-primary spinner/task styles from the download scope; true failures retain text-destructive. No hard-coded green/blue/red utility classes remain in the scoped download/playlist files.

## Day subheaders

Skipped under the explicitly permitted virtualization exception. The virtual tree's model indexes are shared by row selection, geometry/scroll offsets, focus restoration and download-transfer targeting in lib/download-list-*. Inserting day records safely requires changing that shared model and its index consumers beyond this lane. Adding headers inside rows would also repeat headings within expanded groups and interfere with measured row targeting. Locale-aware per-row dates provide the day information without changing the tree or selection behavior.

## Verification

- PASS: scoped `pnpm exec biome check` on all 11 changed/new TypeScript files (no fixes remaining).
- PASS: `git diff --check`.
- PASS: five runtime assertions for title precedence, metadata title, saved basename, source/host fallback and malformed URL handling, using `node --import tsx` from apps/desktop. The tsx CLI's IPC socket was sandbox-blocked; the Node loader ran successfully.
- PASS: one Impeccable mechanical detector pass over the Home UI targets returned `[]`.
- BLOCKED outside Home scope: required `cd apps/desktop && pnpm run typecheck:web`. First run reported unused ContextMenuSeparator in Subscriptions.tsx. On the second run that error was gone and the check reported `components/kernel/DownloadEngineRow.tsx(51,12): TS2367` (YtDlpKernelState compared with "ready"). No Home file errors were reported.
- BLOCKED outside Home scope: required root `pnpm run check` stopped at Ultracite with eight errors in concurrently edited AgentChat/ChatSuggestions/Subscriptions files and one existing TranscriptCaptionsPane hook-dependency warning; downstream i18n/typecheck commands were therefore not reached by that script.
- pnpm initially attempted dependency verification against an unwritable SQLite store. Validation used `--config.verifyDepsBeforeRun=false` to run installed tools without dependency installation or store mutation.
- No live rendered-app/screenshot verification was performed. Visual behavior, narrow-window layout and interactions still need the combined redesign's runtime review. Static checks do not establish visual acceptance.

New strings are listed in `.taste-skill/i18n-home.md` for the orchestrator.
