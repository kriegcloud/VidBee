# Status: Image detail — triage, clean, export

- Gate 1 — Product: APPROVED 2026-10-24 (interview, twelve decisions below)
- Gate 1a — Product amendment: APPROVED 2026-10-24 (second interview; decisions 13-21, supersedes 3 and 12)
- Gate 2 — Architecture: drafted 2026-10-24, needs revision for 13-21
- Gate 3 — Program Design: not started
- Gate 4 — Slice plan: revised below, not yet approved

## Locked decisions (2026-10-24 interview)

| # | Decision | Chosen |
| --- | --- | --- |
| 1 | Starting point | `feat/media-aware-detail` is a parts bin, not the base. Keep the main-process inventory/thumbnails, the `image-edit.ts` replay model and `ZoomPanImage`; redesign the page, viewer chrome and tool model. |
| 2 | Primary job | Triage a haul and clean it in bulk. Single-image editing is the exception. |
| 3 | ~~Clean engine~~ | ~~LaMa through `onnxruntime-node`~~ — **superseded by 13.** The npm `onnxruntime-node` ships CPU, CUDA and DirectML providers only; there is no ROCm build, so on this workstation it meant CPU-only while two R9700s sat idle. The mask detector ported from `~/ai/lib/watermark_clean.py` still stands. |
| 4 | Mask authoring | Teach once: box the watermark on one image, match the patch across the haul, review the matches, save the template against the profile. |
| 5 | Output of a clean | Sibling `<stem>_clean.<ext>`; original untouched; the clean rendition becomes the face everywhere, with a before/after toggle. |
| 6 | Verdicts | Persisted in sqlite keyed by ~~path + mtime~~ path + mtime + size — **key amended by 20**, so verdicts and `image_enrichment` share one key and a file edited outside VidBee misses its row. Nothing moves on disk until an explicit apply. |
| 7 | Session scope | The profile group, not the download record. |
| 8 | Default surface | One-up image with a filmstrip; `G` switches to the grid. |
| 9 | Batch operations | Watermark clean, crop to aspect, resize/cap long edge, convert format + strip metadata — all four. |
| 10 | Terminal action | Repair in place, reshape on export. Export renders to a chosen folder through a named preset. |
| 11 | Clean execution | Background queue; triage continues while it runs; survives leaving the page. |
| 12 | ~~Build order~~ | **Superseded by 21** — same shape, different spike. |

## Amendment, 2026-10-24 (second interview)

Prompted by: images open the video player and the Whisper transcript, because
`pages/Transcript.tsx` has no media-kind branch anywhere in its 1123 lines.

| # | Decision | Chosen |
| --- | --- | --- |
| 13 | Inference engine | A **ComfyUI bridge**. VidBee posts digest-pinned graphs to `http://127.0.0.1:8188/prompt`, exactly as `~/ai/lib/vault/library/local_analysis.py` already does. Reuses every model already on disk (`lama`, `rembg`/`RMBG`, `sam2`/`sam3`, `yolo`/`ultralytics`, `upscale_models`, and the pinned `OmoideWDEva02LargeTaggerV3` node); VidBee ships no weights. |
| 14 | ComfyUI lifecycle | **Detect, never start.** Probe `/system_stats` on open. Down: the GPU tabs show a quiet state naming `~/ai/bin/comfy-start` with a recheck; everything CPU-backed keeps working. VidBee never spawns, kills, or competes for VRAM. |
| 15 | Surface | One component, two doors. New route `/downloads/$id/image` mounts the Gate 1 profile-scoped viewer with the haul loaded and that image focused. Videos keep `/downloads/$id/transcript` unchanged. No rival second image surface. |
| 16 | Tabs vs tools | **Rail reads, mode edits.** The right rail holds what describes an image and informs a verdict. `E` enters a full-bleed edit mode with a tool strip; every tool has a batch twin over the haul. |
| 17 | Rail tabs | Tag · EXIF · Quality · Similar · People · Caption · Info. |
| 18 | Write policy | **In place only for lossless tag writes** — EXIF orientation and metadata strip rewrite container tags, leaving the image stream byte-identical, journalled for undo. Anything that changes pixels writes a sibling or an export. |
| 19 | Editor | **Konva directly, no Filerobot.** Konva is the engine under Filerobot anyway; taking the primitive avoids `@scaleflex/ui`, `@scaleflex/icons` and `styled-components` landing in a Tailwind/Radix app, and fits the batch model Filerobot has no hook for. `ZoomPanImage` is still the viewer, per decision 1. |
| 20 | Enrichment storage | VidBee sqlite, one `image_enrichment` table keyed by path + mtime + size; decision 6's verdicts table takes the same key (amended above). Export presets may bake tags into XMP; the original is never written for a tag change. |
| 21 | Build order | CPU rail first, bridge spike beside it. Same shape as decision 12, new spike. |

## Slices (revised 2026-10-24)

- [ ] Spike — POST the pinned WD-EVA02 graph to `:8188`, tag ten real images, report s/image, VRAM headroom and cold-start cost. Gates every GPU tab.
- [ ] Slice 1 — `/downloads/$id/image`: profile-scoped viewer (one-up, filmstrip, `G` grid, zoom/pan, keyboard map) and the three CPU rail tabs, EXIF · Quality · Info, plus lossless orient and strip. **Ships without ComfyUI.**
- [ ] Slice 2 — verdicts: mark, resume, apply
- [ ] Slice 3 — ComfyUI bridge + Tag tab, then Similar, People, Caption
- [ ] Slice 4 — teach-once mask, match review, batch clean through the queue
- [ ] Slice 5 — export presets: crop to aspect, resize, convert, strip metadata
- [ ] Slice 6 — per-image overrides of the haul recipe

## Notes for a fresh session

- The unmerged branch is checked out at `~/YeeBois/workstation-apps/VidBee-media-detail`; `git merge-tree` reports no textual conflicts with `main` as of 2026-10-24, but it is a parts bin by decision, not a merge candidate.
- The reference watermark remover is `~/ai/lib/watermark_clean.py` with profiles in `~/ai/manifests/watermark-*.json` and `big-lama.pt` (torchscript, 205 MB) at `~/ai/ComfyUI/models/lama/`. It is the behavioural spec for mask detection.
- Omoide holds the prior art for the editor dialog, `BatchCropDialog`, `BeforeAfterCompare` and the library survey at `docs/workstation-ux/grok-editor-research.md`; its ComfyUI repair bridge is designed, not built.
- No model downloads (decision 13): VidBee ships no weights. GPU models such as LaMa stay in `~/ai/ComfyUI/models` and are reached only through the ComfyUI bridge. The transcription model-download flow in `~/.config/vidbee/models/` is not a template for this feature.
