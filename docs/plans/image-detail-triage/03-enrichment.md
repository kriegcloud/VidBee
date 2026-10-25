# Enrichment: the ComfyUI bridge and the rail

Covers decisions 13-21. Read `00-status.md` first; this is the architecture for
the amendment, not a second plan.

## Why not in-process inference

The workstation has two **AMD Radeon AI PRO R9700**, gfx1201 (RDNA4), 32 GB each
(`~/ai/docs/reference/workstation-specs.md`). Superseded decision 3 chose
`onnxruntime-node` (superseded by 13); the published package ships CPU, CUDA
and DirectML execution providers. There is no ROCm provider, so decision 3
would have run LaMa on the CPU while both cards idled.
`~/ai/lib/watermark_gpu_benchmark.py` already runs the same model on ROCm through
PyTorch, so a GPU path exists — just not inside Node.

## GPU safety: one card, not two

Not both cards. `~/ai/docs/howto/comfy/comfyui-rdna4.md` records that mixed
graphics and compute on the display card can trigger an amdgpu reset and blank
screens. `~/ai/bin/comfy-start` therefore pins `HIP_VISIBLE_DEVICES=1` — the
non-display R9700 at PCI `0000:23:00.0` — with `HSA_USE_SVM=0`, and asserts
through `/sys/class/kfd` topology that the pinned index has no live display
unless `COMFY_ALLOW_DISPLAY_GPU=1` is set. Dual-card is deliberate: two
instances on `:8188` and `:8189` with ComfyUI-MultiGPU nodes, under the headless
protocol.

**VidBee must not choose a device.** It talks to `:8188` and inherits whatever
pin the launcher applied. Any future dual-card work is a ComfyUI concern.

## Bridge contract

```
main process
  probe   GET  :8188/system_stats          300 ms budget, cached 10 s
  submit  POST :8188/prompt                { prompt_id, prompt: <graph> }
  await   WS   :8188/ws  (fall back to /history/<id> polling)
```

Graphs live in `resources/comfy-graphs/<profile>/`, pinned the way
`local_analysis.py` pins them, and the pin is checked before the first submit of
a session:

- `workflow.api.json` sha256 matches `manifest.json`
- every `class_type` in the graph is present in `/object_info`
- each required model resolves on disk at its expected byte size
- each custom-node executor file matches its recorded sha256

A failed check disables that profile with the specific reason rather than
submitting a graph that will fail halfway. The reason codes follow
`local_analysis.py`: `ANALYSIS_PROFILE_CHANGED`, `ANALYSIS_NODES_UNAVAILABLE`,
`ANALYSIS_MODEL_UNAVAILABLE`, `ANALYSIS_EXECUTOR_CHANGED`.

Profiles, in build order:

| Profile | Node / model | Feeds |
| --- | --- | --- |
| `tag` | `OmoideWDEva02LargeTaggerV3`, `wd-eva02-large-tagger-v3-v1.0` | Tag tab |
| `embed` | CLIP vision | Similar tab (visual neighbours) |
| `faces` | insightface `buffalo_l` (`~/ai/models/insightface`) | People tab, face-aware crop |
| `caption` | Qwen3.5 text encoder profile | Caption tab |
| `clean` | LaMa (`~/ai/ComfyUI/models/lama`) | Watermark clean |
| `matte` | RMBG / `rembg` / SAM | Background removal |

Submission is serialised through one queue in the main process. ComfyUI is a
shared resource the user may be driving themselves; VidBee queues one graph at a
time and surfaces depth rather than racing.

## Degraded mode

`probe` failing is the normal case, not an error. The rail renders every tab; the
GPU-backed ones show the profile they need, the command `~/ai/bin/comfy-start`,
and a recheck. EXIF, Quality and Info never consult the bridge, so Slice 1 ships
and stays useful with ComfyUI stopped.

## The rail

Seven tabs, decision 17. Only the first three are Slice 1.

| Tab | Source | Needs GPU |
| --- | --- | --- |
| Info | the record | no |
| EXIF | container tags | no |
| Quality | Laplacian variance, dimensions, bytes/pixel | no |
| Tag | `tag` profile | yes |
| Similar | phash (CPU) + `embed` profile | partly |
| People | `faces` profile | yes |
| Caption | `caption` profile | yes |

Quality's sharpness is the same signal Omoide's `blur` processor uses. Similar
answers exact (sha256), near (phash Hamming) and visual (cosine) separately,
because they license different actions: exact duplicates can be archived without
looking, visual neighbours need eyes.

## Storage

```sql
CREATE TABLE image_enrichment (
  path        TEXT NOT NULL,
  mtime_ms    INTEGER NOT NULL,
  size_bytes  INTEGER NOT NULL,
  tags        TEXT,     -- json [{tag, score, source}]
  caption     TEXT,
  sharpness   REAL,
  phash       TEXT,
  faces       TEXT,     -- json
  graph_rev   TEXT,     -- which pinned graph produced this
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (path, mtime_ms, size_bytes)
);
```

Same key as the verdicts table (decision 6 as amended by 20; `media_verdict` in
`02-architecture.md` uses it too), so a file edited outside VidBee
simply misses its row and is re-enriched rather than showing stale truth.
`graph_rev` is what lets a model upgrade invalidate exactly the rows it should.

## Writes

Decision 18. Two classes, and the boundary is whether pixels change.

**In place, lossless, journalled.** Orientation rewrites `EXIF:Orientation` and
nothing else — the compressed image stream is byte-identical, which is the whole
point of doing it this way instead of re-encoding a JPEG to rotate it. Strip
removes GPS and device identifiers on the same terms. Each write appends a
journal row carrying the prior tag values so it can be undone.

**Sibling or export.** Clean writes `<stem>_clean.<ext>` (decision 5). Matte
writes `<stem>_matte.png`. Crop, resize and convert exist only as export presets
(decision 10) — they never produce a sibling, because a crop is a decision about
an output, not a repair of an input.

## Edit mode

Decision 19. Konva `<Stage>`, our own tool strip, VidBee's own styling. Tools:
crop/aspect, orient, mask, matte, resize. Each carries `[this image]` and
`[haul ▸]`, which is the shape decision 2 asks for and the shape Filerobot has no
hook for.

The one idea worth lifting wholesale from Omoide is `getFaceCropSuggestions`: on
picking an aspect preset, propose a framing from the detected face boxes instead
of a centre crop. It needs the `faces` profile, so it arrives with Slice 3.
