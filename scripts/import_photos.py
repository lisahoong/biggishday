#!/usr/bin/env python3
"""One-time import of photos/ (and tags from photos/metadata.json) into Supabase.

Usage:
  SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SECRET_KEY=... python3 scripts/import_photos.py

SUPABASE_SECRET_KEY is the service_role / secret key. It bypasses row-level security, so keep it
out of the repo and out of js/config.js. Re-running skips photos already imported.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

PHOTOS_DIR = Path(__file__).resolve().parent.parent / 'photos'
CONTENT_TYPES = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
    '.webp': 'image/webp', '.avif': 'image/avif',
}


def env(name, *fallbacks):
    for key in (name, *fallbacks):
        if os.environ.get(key):
            return os.environ[key]
    sys.exit(f'Missing environment variable {name}')


BASE = env('SUPABASE_URL').rstrip('/')
KEY = env('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY')


def request(method, path, body=None, headers=None):
    h = {'apikey': KEY}
    # Legacy keys are JWTs and go in Authorization too; new sb_secret_ keys must not.
    if KEY.startswith('eyJ'):
        h['Authorization'] = f'Bearer {KEY}'
    h.update(headers or {})
    req = urllib.request.Request(BASE + path, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(req) as res:
            text = res.read().decode()
            return json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        sys.exit(f'{method} {path} failed: {e.code} {e.read().decode()}')


def main():
    metadata = {}
    meta_file = PHOTOS_DIR / 'metadata.json'
    if meta_file.exists():
        for entry in json.loads(meta_file.read_text()):
            metadata[entry['filename']] = entry

    existing = {row['original_name'] for row in request('GET', '/rest/v1/photos?select=original_name')}
    files = sorted(p for p in PHOTOS_DIR.iterdir() if p.is_file() and p.suffix.lower() in CONTENT_TYPES)
    todo = [p for p in files if p.name not in existing]
    print(f'{len(files)} photos found, {len(files) - len(todo)} already imported, {len(todo)} to import.')

    for i, path in enumerate(todo, 1):
        meta = metadata.get(path.name, {})
        storage_path = f'{uuid.uuid4()}{path.suffix.lower()}'
        request('POST', f'/storage/v1/object/photos/{urllib.parse.quote(storage_path)}', path.read_bytes(),
                {'Content-Type': CONTENT_TYPES[path.suffix.lower()]})
        row = {
            'storage_path': storage_path,
            'original_name': path.name,
            'tags': sorted({t.strip().lower() for t in meta.get('tags', []) if t.strip()}),
        }
        if meta.get('addedAt'):
            row['created_at'] = meta['addedAt']
        request('POST', '/rest/v1/photos', json.dumps(row).encode(),
                {'Content-Type': 'application/json', 'Prefer': 'return=minimal'})
        print(f'  [{i}/{len(todo)}] {path.name}')

    print('Done.')


if __name__ == '__main__':
    main()
