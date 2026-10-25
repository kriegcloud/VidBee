# Architecture: Image detail — triage, clean, export

## Shape of the screen

```
+----------------------------------------------------------------------+
| <  @160988745  [OnlyFans]   412 keep · 43 drop · 134 left             |
|                             [cleaning 180/412 ⏸ ✕]   [Apply] [Export] |
+----------------------------------------------------------------------+
|                                                          | info       |
|                                                          | 3024x4032  |
|                      the image                           | 2.4 MB     |
|                   (zoom / pan / fit)                     | jpg        |
|                                                          | cleaned ✓  |
|                                                          | 10/24 7:03 |
+----------------------------------------------------------+------------+
| [][][][][][][][][][][][][][][][][][][][][][][][][][][][][][][][][]    |
+----------------------------------------------------------------------+
  ← →  move      X drop    K keep    Z undo     G grid
  W watermark    E edit    C compare  I info    Esc back
```

The header is the session, not the image: whose haul it is, how far through, what
is running, and the two terminal actions. The filmstrip is position awareness —
at 589 images you need to know where you are. The info panel is a toggle, off by
default, because the pixels are the point.

`G` swaps the stage for a dense grid of the same session with the same verdict
keys and multi-select; `Enter` returns to one-up on the focused tile. Grid is a
tool for sweeps and selections, not the default.

## Session scope

A session is a **profile group** — the same grouping key the download list now
uses for its accordions (`creator-profile:<site>:<owner>`, a social saved-profile
group, or a batch id). Entering from any row resolves that row's group and the
session is every image asset under it, ordered as the list orders them.

This is the one place the existing branch has to change structurally: its
inventory is per download record with an opt-in folder scope. The new entry point
is `listGroupAssets(groupId)` in the main process, built on the same
`media-inventory` scanner, fanning over the group's records.

Mixed hauls keep their video tiles in the filmstrip and the grid; activating one
routes to the transcript page. A group with no images never opens this surface.

## Data

Two new tables. Verdicts are keyed by path, mtime **and** size, so an edited or
replaced file loses its verdict rather than inheriting a stale one. This is the
same key as `image_enrichment` (decision 20, `03-enrichment.md`); decision 6
was amended to match.

```
media_verdict(path TEXT NOT NULL, mtime_ms INTEGER NOT NULL,
              size_bytes INTEGER NOT NULL, verdict TEXT,
              group_id TEXT, decided_at INTEGER,
              PRIMARY KEY (path, mtime_ms, size_bytes))
            -- verdict: 'keep' | 'drop'   (absent row = undecided)

watermark_template(group_id TEXT PRIMARY KEY, patch BLOB, patch_w, patch_h,
                   region_x, region_y, region_w, region_h,   -- normalized 0..1
                   scale_min REAL, scale_tolerance REAL, min_score REAL,
                   dilate_px INTEGER, taught_at INTEGER)
```

Nothing else persists. Renditions are discovered on disk (`<stem>_clean.<ext>`
beside the original), so a clean survives a database reset and a database reset
never orphans pixels.

## Clean pipeline

> **Superseded in part by decisions 13 and 20 — Gate 2 revision pending.** The
> repair stage, the in-app model download and the CPU spike below describe the
> withdrawn decision 3 (LaMa through `onnxruntime-node`). Repair now runs LaMa
> through the ComfyUI bridge on models already in `~/ai/ComfyUI/models`; VidBee
> ships and downloads no weights. See `03-enrichment.md`. Match and mask still
> stand.

Ported from `~/ai/lib/watermark_clean.py`, which stays the behavioural spec.
Three stages, all in the main process:

1. **Match.** The taught patch is correlated against a high-pass of the search
   region at a range of scales — the same idea as `anchored_mask`/`detect_mask`,
   but matching the lifted patch instead of re-rendering text in a font, so no
   font or string has to be known. Output: a score and a placement, or nothing.
2. **Mask.** Placement → binary mask, dilated by `dilate_px`, feathered.
3. **Repair.** ~~LaMa through `onnxruntime-node`~~ (superseded by 13: LaMa via the ComfyUI bridge); the result is composited back
   **only inside the mask**, so untouched pixels stay byte-identical to the
   source. Encode beside the original as `<stem>_clean.<ext>`.

~~The model lives at `~/.config/vidbee/models/inpaint/`, downloaded on first use
through the same status/progress flow the transcription models already use.~~
(Superseded by 13: no download; the model stays in ComfyUI.) No reachable
ComfyUI, no watermark tool — the rest of the page works (decision 14).

Jobs run through the existing task queue (`groupKey: 'image-repair'`, low
concurrency so downloads keep moving), which gives cancellation, resumability and
survival across navigation for free.

~~**The spike must answer this before Slice 3 starts:** ms per 3000px image on CPU
for a real file from the haul. If it is minutes rather than seconds, the engine
decision reopens (ComfyUI bridge, or shelling out to the Python tool).~~
(Superseded by 13 and 21: the engine is the ComfyUI bridge; the spike now
measures the pinned WD-EVA02 graph on `:8188`, see `00-status.md`.)

## Edits as a recipe

`image-edit.ts` already models an edit as data replayed in a fixed order
(orient → filter → crop → resize) with the crop stored normalized. That model is
kept and extended at both ends:

```
repair (mask inpaint)  →  orient  →  filter  →  crop  →  resize  →  encode
```

A **haul recipe** is one of these applied to a selection; a per-image edit is the
same structure overriding the haul's for one asset. Batch crop, batch resize and
batch convert are therefore not three features — they are one recipe applied to
many, which is why all four batch operations landed in the same bucket.

Export renders the recipe from the **clean** rendition into a target folder under
a named preset (`LoRA 1024 1:1 jpg q92`). Presets persist in settings. Export
never writes into the library; repair never writes outside it.

## Deletion

The apply step is the only path that removes anything. It reuses the list's
existing delete-with-files machinery, behind a sheet that itemises every file by
name and count. Verdicts survive until applied, so the destructive act is always
a deliberate second action, never a keystroke.

## What gets reused

| From | Taken |
| --- | --- |
| `feat/media-aware-detail` | `media-inventory`, `media-thumbnails`, `media-files` (main), `image-edit.ts`, `ZoomPanImage`, the local-file CSP + mtime-versioned URL trick |
| `main` today | task queue, ~~model download/status flow~~ (superseded by 13), profile grouping keys, delete-with-files, `DownloadPlatformIcon` |
| `~/ai` | the mask-detection algorithm, the profile manifest fields, the composite-inside-the-mask rule |
| Omoide | interaction prior art: batch crop review, before/after compare |
