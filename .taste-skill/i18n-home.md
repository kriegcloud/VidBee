# Home strings

No files under `packages/i18n` were edited. New keys render with English defaults pending orchestrator translation.

| Key | English default | Variables |
| --- | --- | --- |
| `download.addUrlAction` | Add URL | — |
| `download.dateToday` | Today | — |
| `download.dateYesterday` | Yesterday | — |
| `download.etaValue` | ETA {{eta}} | `eta`: reported ETA, or em dash |
| `download.agentTasks.sentenceCount` | {{count}} agent tasks | `count`: task count; add appropriate locale plural forms |

Existing keys reused: `download.localSource`, `download.otherSource`, `download.createdByAgent` (AI-created), subscription provenance, status labels and playlist count labels. Calendar month/day and clock formatting use `i18n.language`; older-year dates use YYYY-MM-DD.
