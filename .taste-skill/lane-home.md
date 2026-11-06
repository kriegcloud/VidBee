Lane: home. Read `.taste-skill/redesign-spec.md` first; it is binding. Scope: `apps/desktop/src/renderer/src/pages/Home.tsx`
and `apps/desktop/src/renderer/src/components/download/**` (plus `components/playlist/**` if the playlist group row lives there).
Do not touch other screens, packages/ui (except nothing), or packages/i18n.

Home answers "What's downloading, and what did I get?". Make the download list read like a tool:
1. Title fallback: a row must never show a raw URL as its title. Order: record title -> metadata/episode title -> output file
   basename without extension -> "<Source name> · <short host/path tail>". The URL may appear only in the secondary line or a tooltip.
   Apply the same fallback wherever the playback bar/now-playing shows the item title if that code reads from the download record
   via a shared helper (put the helper in a lib file the playback bar can import; do not edit the playback bar beyond the import).
2. Thumbnails: one fixed 16:9 media slot (96x54) with 6px radius on every row; an item without a picture shows a flat
   `bg-muted` slot with the 16px source glyph centred in `text-meta` (no icon-in-box tile, no border).
3. Meta line: 13px `text-muted-foreground`, `tabular-nums`, separators " · ". Dates per the spec ("Today 22:08").
   Sizes with one decimal and a thin grey unit ("48.5 MB"). Keep "N agent tasks" and the AI-created mark but sentence case and grey.
4. Progress: any in-progress download shows a 4px rounded bar, `bg-data` fill on `bg-data-track`, the true ratio, with
   percent, speed and ETA in tabular grey at the row's right edge. The playlist group row ("Sutton - Videos 42 / 42 completed")
   uses the same bar instead of the full-width underline; completed groups show the count in grey, no bar.
5. Filter row: the source chips (All, YouTube 47, Spotify 2, RSS 1) are neutral: inactive `text-muted-foreground`,
   hover `bg-[color:var(--hover)]`, active `bg-[color:var(--active)] text-foreground`; counts in `text-meta tabular-nums`.
   No coloured fills, no borders on chips. "Add URL" is the screen's one primary (inverted `bg-primary`), "Saved profiles" a quiet
   secondary (ghost/outline). Controls in that row share one height (32px).
6. Group the list under day subheaders ("Today", "Yesterday", "Nov 1", ...) in 12px `text-meta` sentence case, IF the virtual list
   supports it without breaking virtualization; otherwise skip and say why in the report.
7. Row hover: `bg-[color:var(--hover)]`, radius 8; selected uses `bg-[color:var(--active)]`. Row actions (play, kebab) stay grey,
   brighten on hover. The currently-playing row's title gets `text-data` (green is data: "playing").
8. Remove any remaining hard-coded green/blue/red utility classes (`text-primary` used as green link colour, `bg-red-500` dots,
   `text-green-*`, `bg-blue-*`) in this scope: map to `text-data` (data meaning), `text-destructive` (real errors) or neutrals.
Report in `.taste-skill/report-home.md`, new strings in `.taste-skill/i18n-home.md`.
