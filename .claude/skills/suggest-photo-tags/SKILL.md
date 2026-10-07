---
name: suggest-photo-tags
description: Generate AI-suggested tags for the wedding photos in photos/, written into metadata.json under a "suggestedTags" field kept separate from the user's own "tags". Use when new photos have been added to the photos folder and need suggestions, or when asked to refresh/re-run suggested tags.
---

Generates `suggestedTags` for photos in `/Users/lhoong/Documents/wedding/photos/`, the folder used by the wedding planner app ([index.html](../../index.html), served via `python3 serve.py`). The user browses/filters photos on its Inspiration tab to narrow down a wedding theme and compare design options for a specific area or function of the wedding. These tags also feed vendor style-matching, so style/mood words carry real weight beyond the photo grid.

## Data model

`photos/metadata.json` is a JSON array, one object per photo:

```json
{
  "filename": "...",
  "tags": [...],
  "source": "...",
  "originalName": "...",
  "addedAt": "ISO date string",
  "suggestedTags": [...]
}
```

- `tags` is filled in manually by the user via the app. **Never read this as a signal for what to write, and never modify, reorder, or remove it.**
- `suggestedTags` is what this skill produces. It's fine — expected, even — for it to overlap with `tags`, but it must never be treated as a source of truth about what's already there for the purposes of skipping work; only use it to decide which photos still need processing (see below).
- `source`, `originalName`, `addedAt` are also user/app-owned. Preserve them untouched on existing entries; only fill sensible defaults (`source: "local file"`, `originalName: <filename>`, `addedAt: <now, ISO>`) when creating a brand-new entry for a file that has none.

## What to do when invoked

1. `cd /Users/lhoong/Documents/wedding/photos`. Enumerate image files (extensions: jpg, jpeg, png, gif, webp, heic, heif, avif, bmp, tiff, tif, svg). Skip `metadata.json` itself and anything inside a `trash/` subfolder (the app's soft-delete area).
2. Load `metadata.json` and diff it against the files on disk:
   - Files with no entry at all → need a new entry + suggestedTags.
   - Files with an entry but an empty/missing `suggestedTags` → need suggestedTags filled in.
   - Files that already have a non-empty `suggestedTags` → **skip**, unless the user explicitly asked for a full refresh/re-run of everything, in which case regenerate all of them.
3. For every photo that needs processing, view it with the Read tool and come up with 3–6 short tags per photo, mixing:
   - **Functional/area category** — what part or function of the wedding it depicts, e.g. `invitation`, `ceremony`, `reception`, `cocktail hour`, `center piece`, `bouquet`, `table setting`, `bar`, `cake`, `favors`, `seating chart`, `welcome area`, `dance floor`, `backdrop`, `ceiling fixture`, `signage`, `attire`, `entrance`.
   - **Theme/style/mood/color descriptors** — e.g. `romantic`, `moody`, `maximalist`, `minimalist`, `boho`, `glam`, `rustic`, `modern`, `jewel tone`, `pastel`, `monochrome`, `asian`, `garden party`, `black tie`, `colorful`, `elegant`, `whimsical`, `vintage`, `disco`, `tropical`.

   These are independent, creative judgments — don't feel constrained to the user's existing `tags` vocabulary, though before starting it's worth reading what vocabulary already exists across `tags` in metadata.json (run something like `python3 -c "import json; ..."` to list unique tags with counts) so your functional-category words stay reasonably consistent with how the user already talks about their own wedding (their real venue photos are tagged `fairmont`, most other photos are Carats & Cake-style inspiration pulls). Reuse existing words where accurate; invent new ones freely where nothing fits.

   Use lowercase, space-separated phrasing (not hyphenated) to match the existing style.

4. If a file fails to render via Read (this has happened with `.avif`), try converting it locally first, e.g. `sips -s format jpeg src.avif --out /tmp/preview.jpg`, then view the converted copy. Only fall back to `suggestedTags: []` if that also fails, and call it out in your summary.
5. Save incrementally, not all at once at the end: after each batch of ~5-8 photos, read metadata.json, merge in that batch's suggestedTags (and any brand-new entries), write back with `json.dump(..., indent=2)` / UTF-8, keeping it valid JSON throughout (the app reads this file live). Do this via a small Python script through Bash rather than hand-editing JSON text.
6. If there are more than ~15-20 photos to process, do this work via a background `Agent` (subagent_type `general-purpose`) rather than burning the main conversation's context on dozens of inline image reads — pass it this same process. Give it any photos you've already viewed/decided on tags for directly in the prompt so it doesn't redo that work. Report back to the user once it completes rather than blocking on it.
7. When finished, give the user a short summary: how many entries got new suggestedTags, how many brand-new metadata entries were created, and anything that failed to preview. No need to list every photo's tags individually — the catalog app already displays them.
