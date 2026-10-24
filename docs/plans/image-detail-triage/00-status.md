# Status: Image detail — triage, clean, export

- Gate 1 — Product: APPROVED 2026-10-24 (interview, ten locked decisions below)
- Gate 2 — Architecture: drafted 2026-10-24, not yet approved
- Gate 3 — Program Design: not started
- Gate 4 — Slice plan: drafted below, not yet approved

## Locked decisions (2026-10-24 interview)

| # | Decision | Chosen |
| --- | --- | --- |
| 1 | Starting point | `feat/media-aware-detail` is a parts bin, not the base. Keep the main-process inventory/thumbnails, the `image-edit.ts` replay model and `ZoomPanImage`; redesign the page, viewer chrome and tool model. |
| 2 | Primary job | Triage a haul and clean it in bulk. Single-image editing is the exception. |
| 3 | Clean engine | LaMa through `onnxruntime-node`, model lazily downloaded to `~/.config/vidbee/models/inpaint`, mask detector ported from `~/ai/lib/watermark_clean.py`. |
| 4 | Mask authoring | Teach once: box the watermark on one image, match the patch across the haul, review the matches, save the template against the profile. |
| 5 | Output of a clean | Sibling `<stem>_clean.<ext>`; original untouched; the clean rendition becomes the face everywhere, with a before/after toggle. |
| 6 | Verdicts | Persisted in sqlite keyed by path + mtime. Nothing moves on disk until an explicit apply. |
| 7 | Session scope | The profile group, not the download record. |
| 8 | Default surface | One-up image with a filmstrip; `G` switches to the grid. |
| 9 | Batch operations | Watermark clean, crop to aspect, resize/cap long edge, convert format + strip metadata — all four. |
| 10 | Terminal action | Repair in place, reshape on export. Export renders to a chosen folder through a named preset. |
| 11 | Clean execution | Background queue; triage continues while it runs; survives leaving the page. |
| 12 | Build order | Viewer + triage first, with a headless LaMa spike running beside it. |

## Slices

- [ ] Spike — `onnxruntime-node` + a LaMa ONNX in the main process; time ten real images; report ms/image on CPU
- [ ] Slice 1 — profile-scoped viewer: one-up, filmstrip, grid, zoom/pan, keyboard map
- [ ] Slice 2 — verdicts: mark, resume, apply
- [ ] Slice 3 — teach-once mask, match review, batch clean through the queue
- [ ] Slice 4 — export presets: crop to aspect, resize, convert, strip metadata
- [ ] Slice 5 — per-image overrides of the haul recipe

## Notes for a fresh session

- The unmerged branch is checked out at `~/YeeBois/workstation-apps/VidBee-media-detail`; `git merge-tree` reports no textual conflicts with `main` as of 2026-10-24, but it is a parts bin by decision, not a merge candidate.
- The reference watermark remover is `~/ai/lib/watermark_clean.py` with profiles in `~/ai/manifests/watermark-*.json` and `big-lama.pt` (torchscript, 205 MB) at `~/ai/ComfyUI/models/lama/`. It is the behavioural spec for mask detection.
- Omoide holds the prior art for the editor dialog, `BatchCropDialog`, `BeforeAfterCompare` and the library survey at `docs/workstation-ux/grok-editor-research.md`; its ComfyUI repair bridge is designed, not built.
- Transcription already downloads 390 MB of models into `~/.config/vidbee/models/`; copy that flow for the inpainting model rather than inventing one.
