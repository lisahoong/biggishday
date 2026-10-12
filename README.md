# Our Wedding Board

A shared inspiration board for us and our wedding planner: a photo gallery with tags and comments.

- **Live site:** https://lisahoong.github.io/biggishday/
- **Data:** Supabase project `wedding-board` (photos, tags, comments, private photo storage)

## Using it

1. Open the site and enter the board password.
2. Enter your name once per device. It's shown next to your comments and uploads.
3. Click a photo to view it large, add tags, or comment.
4. **Delete photo** moves a photo to the **Trash** (link in the top bar), where either of you can restore it.
   Photos are deleted for good 30 days after being trashed, the next time someone opens the board.
5. **Comments** (top bar) lists every comment on the board, newest first. Filter by person, and click one
   to open its photo.
6. Click a tag above the photos to filter them. If photos with that tag have comments, a panel slides in
   on the right listing them; the arrow button collapses it. Adding more tags keeps it open and adds their
   photos' comments.
7. The selected tags are kept in the page address (`?tag=floral&tag=centerpiece`), so you can copy the
   link to send someone the board filtered the same way.

Edits save immediately. The other person sees them after refreshing.

## How it works

- `index.html`, `style.css`, `js/` is a static app served by GitHub Pages; pushing to `main` deploys it.
- `js/config.js` holds the Supabase URL, the publishable key, and the shared board account's email.
  These are meant to be public. The board password is the secret, and row-level security in
  `supabase/schema.sql` blocks all data until someone signs in with it.
- Secrets (service key, database password, board password) live in `~/.wedding-board-secrets`
  on Lisa's laptop, never in this repo.

## Local development

```
python3 serve.py        # http://localhost:8765, talks to the same Supabase project
```

## Maintenance

- Change the board password: Supabase dashboard → Authentication → Users → `wedding-board@example.com`.
- Bulk-import a folder of photos: put them in `photos/` and run
  `set -a; . ~/.wedding-board-secrets; set +a; python3 scripts/import_photos.py` (skips already-imported files).
