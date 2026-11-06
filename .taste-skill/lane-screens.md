Lane: screens. Read `.taste-skill/redesign-spec.md` first; it is binding. Scope:
`apps/desktop/src/renderer/src/pages/Subscriptions.tsx`, `components/subscription/**`, `pages/Chat.tsx`,
the agent chat empty-state component(s) under `components/agent/**` that render the "Your best audio and video processing
assistant" welcome, and `pages/About.tsx` (+ components it alone uses). Do not touch Home/download components, packages/ui, packages/i18n.

Subscriptions ("What's new from what I follow?"):
- Remove the "All" icon tile and the dashed-circle "Add sub…" control. Header row under the top bar: neutral text filter chips
  (All, plus one per platform present, with tabular counts in `text-meta`) on the left; a full-label primary "Add subscription"
  (inverted `bg-primary`, 32px) on the right. Never truncated.
- Empty state keeps the list frame: one `bg-card` panel (radius 12, 24px padding, no border) at the top of the list area with a 16/600
  "No subscriptions yet", one 14px sentence ("Follow a channel, playlist or feed and VidBeep downloads new items for you."),
  the primary "Add subscription" button, and a quiet text link "Use RSSHub feeds" that opens the RSSHub docs. Delete the separate
  RSSHub promo card. No big blank band: the panel sits directly under the header row.
- Populated rows (keep existing data/behaviour): 40px avatar/cover (circle for channels), name 14/500, source glyph, secondary line
  "<N> new since <date>" (the N in `text-data` only when N>0, else "Up to date" grey), last checked "12 min ago" tabular grey on the right,
  auto-download state as a pale pill. One kebab per row.
Chat ("What do I want done to my media?"):
- Replace the marketing headline with a calm empty state aligned to the composer's column: 20/600 "What should VidBeep do?" and one
  14px grey line naming what it can act on ("Works on your downloads, transcripts and subscriptions."). Keep the suggestion chips
  (neutral, 32px, no fills). The three top-right icon buttons need tooltips + aria-labels if they lack them.
- Remove the gradient overlay above the composer (`div.pointer-events-none.absolute` with linear-gradient) -> flat `bg-background` band
  or nothing. The send button is neutral until there is text, then inverted primary; the model picker stays grey.
About ("Am I up to date?"):
- First block: app mark (48px), "VidBeep" 20/600, version as plain grey text (not a pill), one-line description; right side
  "Check for updates" as the screen's one primary (inverted) plus a GitHub ghost icon button with aria-label.
  Then rows in the same panel: Auto updates (switch), Download engine ("yt-dlp 2026.10.21 · Node 22.23.4" tabular, "Up to date" pale pill,
  "Release notes" ghost button).
- Second panel "Help and feedback": Feedback & issues, Email support, Official website as rows: title 14/500, grey description,
  actions right. NO icons in boxes (drop the circle/box icon tiles; at most a plain 16px grey icon before the title, or none).
- Last, quiet: "More from the developer" as two compact rows (LMSpeed, Clipii: name, one line, "Visit" ghost link with external icon),
  and "Share VidBeep" row with the share buttons as ghost buttons. These stay below the fold-worthy content and never above it.
Report in `.taste-skill/report-screens.md`, new strings in `.taste-skill/i18n-screens.md`.
