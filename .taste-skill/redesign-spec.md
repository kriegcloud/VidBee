# VidBeep desktop redesign spec (true-black-flat, brand palette kept)

Read first: `/home/elpresidank/.claude/plugins/cache/taste-skill/taste-skill/2.1.5/skills/taste-skill/references/app-screens.md`
sections 2.2, 4, 5, 7, 9, 11, 13 (house rules). They are binding.

## Already done (do not redo)
- `packages/ui/src/theme.css`: tokens. Dark = TrustGraph workbench zinc (#09090b ground, #111113 card, #18181b nested, #27272a selected),
  light = parchment (#f3ead4 ground, #fbf6e8 card, #26261c ink). `--primary` is now near-white on dark / ink on light (inverted primary button).
  NEW tokens / Tailwind colours: `data` (brand green: #82b582 dark, #2d632d light), `data-track`, `meta` (third text grey).
  Use `bg-data`, `text-data`, `bg-data-track`, `text-meta`.
- Labelled 224px sidebar (`AppSidebar variant="labelled"`), and a per-screen `<h1>` in the top bar rendered by `app-layout.tsx`
  for Home, Subscriptions and About. Do NOT add another h1 on those screens.

## Colour law
- Brand green (`data`) ONLY on data: download progress fill, the currently playing item, completion/"new" status, the active transcript line.
- NEVER green on buttons, tabs, filter chips, nav, links or icons. Primary button = `bg-primary text-primary-foreground` (inverted), one per screen.
- Status pills: pale tint + dark ink of the same hue; never saturated fills with white text. Red only on a failing fact.
- Source brand marks (YouTube red, Spotify, RSS orange) may stay as the small 14-16px source glyph only.
- No gradients (the Chat composer fade is a FAIL: replace with a flat `bg-background` band), no glows, no shadows on resting cards,
  no icons in tinted/neutral boxes repeated down a list.

## Figures
- Sizes, durations, counts: `tabular-nums` (Tailwind `tabular-nums`), right-aligned when in a column.
- Dates: "Today 22:08", "Yesterday 21:23", else "Nov 2" (same year) or "2025-11-02". Use the app's i18n locale for formatting
  (Intl.DateTimeFormat with i18n.language). 24h vs 12h: follow the locale.
- A missing value is a grey em dash; a real zero is printed.

## i18n rule (IMPORTANT, two workers run in parallel)
- Do NOT edit any file under `packages/i18n/`. Reuse existing keys where they fit.
- If you need new strings, use `t('<new.key>', '<English default>')` with the defaultValue argument so it renders,
  and list every new key + English text in `.taste-skill/i18n-<lane>.md`. The orchestrator adds them to all locales.

## Verification you must run before finishing
- `cd apps/desktop && pnpm run typecheck:web` (zsh -ic if pnpm missing) must pass.
- `pnpm exec biome check <changed files>` scoped to your files only (never repo-wide `ultracite fix`).
- Do not commit. Leave the tree dirty. Write a short summary of what changed to `.taste-skill/report-<lane>.md`.
