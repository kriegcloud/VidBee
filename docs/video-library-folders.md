# Video folders and automatic AI notes

Completed videos in the configured VidBee download library are grouped into a
folder matching the media filename without its extension. Existing channel,
playlist, and custom subfolders inside the library are retained:

```text
~/Downloads/VidBee/<channel>/<video filename>/
  <video filename>.mp4
  <video filename>.en.vtt
  overview.md
  generate-faq.md
  create-mindmap.md
  create-mindmap-custom.md
  .vidbee-ai-results.json
```

The desktop groups existing completed downloads at startup, and new downloads
when their completed-task event arrives. Active task/dependent-task checks and
active agent runs defer grouping. Transcription completion and later startup
retry it. Files outside the configured download library are left in place.

Media and exact-stem caption/thumbnail/metadata/Markdown companions move together.
The application creates hard links before updating task and transcript paths,
then removes the original names only after those references are saved. Existing
files are never overwritten by grouping. Destination collisions, symlinks,
active dependencies, and filesystem/persistence failures leave originals intact
or retain both copies if rollback itself cannot finish.

Successful root skill answers are automatically exported after an Agent run
settles. Startup also backfills existing successful Agent and legacy prompt
answers without inference. Failed, interrupted, cancelled, empty results and
follow-up chat replies do not replace a skill document. Completed ordinary chat
threads do not produce automatic notes.

Files contain the final answer, including Mermaid source, and frontmatter with
the title, skill, model when known, generation time, source URL, and relative
media filename. Owned screenshot references are embedded using the existing
Markdown exporter. Thinking and tool arguments are excluded.

The hidden `.vidbee-ai-results.json` file records hashes and generation times.
A newer successful run atomically replaces an unchanged generated document.
An externally edited or pre-existing unowned Markdown file is preserved; the
new answer is written as `<skill>.generated-<run-id>.md`. Repeated backfills are
idempotent. Unavailable folders and write failures are logged and retried during
the next startup; answers remain saved in VidBee's database.

Regression coverage:

```sh
pnpm exec tsx --test apps/desktop/test/video-library-files.test.ts
pnpm run check
pnpm run test:audit
```
