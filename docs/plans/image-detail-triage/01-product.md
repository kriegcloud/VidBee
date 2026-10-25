# Product: Image detail — triage, clean, export

## Problem

A profile download lands hundreds of images at once: one OnlyFans creator is 589
separate download records holding one file each. VidBee can fetch them and can
list them, and then it stops. Judging the haul means opening files in an external
viewer; removing a creator's watermark means leaving for a Python script in
another checkout; preparing a consistent set means a third tool. The images are
in VidBee and every decision about them happens somewhere else.

The detail page that exists today compounds it: it is scoped to one download
record, so a 589-record profile would be 589 sessions.

## Who this is for

One person, on this workstation, working through hauls they pulled themselves,
usually with an end use in mind (a training set, a reference folder). They are
keyboard-driven, they will not babysit a progress bar, and they have been burned
by an irreversible bulk delete before.

## Success metric

A 589-image haul goes from downloaded to a clean, consistent, exported set in one
sitting without leaving VidBee, and without the user opening a file manager, an
image viewer, or a terminal at any point.

Supporting metrics:

- Every image in a haul reaches a verdict, and the pass can be interrupted and
  resumed days later with no lost state.
- A creator's watermark is taught once and never taught again for that creator.
- No original file is modified, and nothing is deleted without an explicit,
  itemised confirmation.

## The loop

1. Open any image in a profile group. The session is the whole group.
2. Move with the arrow keys. `X` rejects, `K` keeps. The header counts down.
3. On the first watermarked image, press `W` and box the watermark. VidBee
   matches that patch across the haul and shows what it found.
4. Uncheck the bad matches. Start the clean. Keep triaging while it runs; tiles
   flip to their cleaned rendition underneath you.
5. Apply: an itemised sheet lists what will be deleted. Confirm.
6. Export the keepers through a preset into a folder.

## What this is not

- Not a general image editor. There is no layers model, no painting, no text.
- Not a replacement for the transcript page. Audio and video keep that surface;
  a mixed haul shows video tiles that open it.
- Not a dataset manager. Export writes files into a folder; what happens to them
  afterwards is Omoide's job.

## Announcement — the blog post before the feature

**VidBee now finishes the job.**

Pull a creator's whole profile and VidBee drops you straight into it: one image
at a time, full size, arrow keys to move, one key to keep and one to drop. The
haul is the unit, not the post, so 589 downloads are one pass, and the pass
remembers where you were.

Watermarks you teach once. Draw a box around it on the first image; VidBee finds
the same mark on every other image in the haul, shows you what it found, and
repaints it out locally (LaMa through the ComfyUI bridge, decision 13) while you
carry on judging. The
original file is never touched — the repaired copy sits beside it and becomes the
one VidBee shows you, with a key to flip back and compare.

When the pass is done, one confirmation deletes what you rejected — itemised,
nothing before you have read it — and one preset exports the keepers at a single
aspect, a single long edge, a single format, with the metadata stripped.

Nothing leaves your machine. The model runs locally, and the images never move
except where you send them.

## Open questions for Gate 2

- ~~Which LaMa ONNX export do we trust, and do we convert `big-lama.pt` ourselves
  and host the artefact, or depend on a published one?~~ Superseded by decision
  13: no ONNX export and no hosted artefact; LaMa runs from
  `~/ai/ComfyUI/models/lama` through the ComfyUI bridge. Gate 2 revision pending.
- Does the clean queue share the download queue's concurrency budget or get its
  own, given downloads are usually running at the same time?
- Do verdicts belong to the file path or to the download record when both exist?
