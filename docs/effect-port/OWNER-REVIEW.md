# Owner review

Choices the port made in the owner's place (see "Amendments" in [PLAN.md](PLAN.md)), bugs found and
not fixed (assumption A2), and dependencies held back. One entry each, newest phase last.

| # | Phase | Kind | Entry | Reason |
| --- | --- | --- | --- | --- |
| 1 | 0b | held back | `electron` stays at 43.8.10 (latest 45.3.3) | Electron 44 replaced the clipboard module; copying a file to the clipboard would need a rewrite that cannot be verified on three platforms. |
| 2 | 0b | held back | pi packages (`pi-ai`, `pi-agent-core`, `pi-durable`, `pi-tui`, `chord`) stay at 1.4.0, `typebox` at 1.3.27 | pi 1.5 removed `watchEvents()` and the event stream the chat session is built on. |
| 3 | 0b | held back | `electron-ipc-decorator` stays at ^0.2.0 | 1.0 breaks about 200 renderer call sites and the port removes the library. |
| 4 | 0b | held back | `lucide-react` goes to ^0.577.0, not 1.x | 1.0 removed the brand icons five files use; replacing them changes the look. |
| 5 | 0b | held back | `@biomejs/biome` 2.5.15 and `ultracite` 8.0.2 | 1,116 new lint errors; phase 1a replaces both. |
| 6 | 0b | bug | Fresh profile logs `no such table: transcript_prompt_runs` from the video library backfill | `video-library-host.ts` reads the table before `ai-prompt-store.ts` creates it. Warning only. |
| 7 | 1a | choice | The rule set has 150 diagnostics (145 `error`, 5 `off`), not the plan's 187 all-`error` | `tsconfig.base.json` is copied from beep-effect unchanged, as the plan requires; the plan's count was stale. The five `off` rules are off in the reference. |
| 8 | 1a | choice | `port:check` also rejects suppression comments, `new Map`/`new Set`, `node:http` and `zod` imports in ported units | The plan asks for greps on checklist items 2 and 3 only; these add the standing rules so they are enforced mechanically. |
| 9 | 1a | choice | `@biomejs/biome` pinned to 2.5.6 (was 2.5.15) | D26: pin what beep-effect pins. |
| 10 | 1a | choice | ultracite's two presets are vendored under `standards/biome-legacy/` until phase 10 | Unported code keeps today's lint and formatting without the dependency. |
| 11 | 1a | choice | `@vidbee/schema` replaces `@beep/utils` and `@beep/identity` with public Effect modules instead of copying helpers | Nothing beyond `LiteralKit` needed copying. |
