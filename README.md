# Wedding Planner

A private decision-support app for our wedding — inspiration, colour, budget trade-offs, and vendor options in one place. Deliberately *not* a project-management tool: logistics, contracts, and the day-of timeline belong to the wedding planner.

## Running it

Double-click **Wedding Planner.app**. It opens in your browser with everything loaded.

Don't open `index.html` directly — browsers treat `file://` pages as unique origins and block them from reading or writing local files, so photos and data won't load. The `.app` just serves this folder on `localhost`, which is a real origin. Quit the app (or close its window) to stop it.

To save changes back to disk, click **Connect Folder** once and pick this `wedding` folder. Until then edits are kept in the browser and written out the moment you connect. Chrome remembers the grant.

## Tabs

| Tab | What it does |
|---|---|
| **Overview** | Budget rollup, decision progress per category, and gaps worth a second look |
| **Inspiration** | Your tagged photos, filterable by tag; group them into boards |
| **Palettes** | Build colour combinations, including sampling straight off a photo |
| **Budget** | Costs by category, with a trade-off view and a what-if control |
| **Vendors** | Options side by side, with style overlap against the inspiration board |

## How it hangs together

The point of one app rather than several is that decisions cross-link:

- **Categories are shared** between Budget and Vendors — one list, one set of IDs. Adding a category in either place makes it available in both.
- **Booking a vendor writes to the budget**: status flips to `booked`, a locked-in cost appears in the matching category at the agreed price, and rival options in that category are marked `passed`.
- **Style matching is real, not fuzzy**: vendor style tags are drawn from the same vocabulary as your photo tags, so "matches your board on 3 tags" is a set intersection over your actual photos.
- **Locked vs flexible** is the spine of the budget. Only `booked` counts as locked; everything else stays in the flexible pool, which is what the trade-off view ranks when you need to find room.

## Data

Two files, both plain JSON you can read, diff, and back up:

- `wedding-data.json` — settings, categories, budget items, vendor options, palettes, boards.
- `photos/metadata.json` — one entry per photo. `tags` are yours; `suggestedTags` are written by the `/suggest-photo-tags` skill and kept strictly separate.

Drop new images into `photos/` and they're picked up next time you open the app (or hit **Reload photos**). Run `/suggest-photo-tags` to have Claude look at the new ones and propose tags.

## Code layout

Plain HTML/CSS/JS loaded as classic scripts — deliberately *not* ES modules, since browsers block those over `file://`. Load order is set in `index.html`.

- `js/ui.js` — shared render helpers (`el`, modal, toast, form fields)
- `js/calc.js` — budget maths, pure functions, no DOM
- `js/store.js` — reads/writes the folder via the File System Access API
- `js/tab-*.js` — one per tab, each exposing `render(root, ctx)`
- `js/app.js` — tab routing and folder connection
