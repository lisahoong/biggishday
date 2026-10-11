export const state = {
  me: null,
  photos: [],
  // Photos in the trash, most recently trashed first.
  trash: [],
  comments: new Map(),
  markings: new Map(),
  // The board opens filtered to this tag; dropped automatically if no photo has it.
  filterTags: new Set(['inspiration']),
  search: '',
  sort: 'newest',
  // Bumped on every local edit so a slower background refresh can't overwrite it.
  version: 0,
};

export const TRASH_DAYS = 30;

export function trashExpiry(photo) {
  return Date.parse(photo.deleted_at) + TRASH_DAYS * 86400000;
}

export function listFor(map, photoId) {
  if (!map.has(photoId)) map.set(photoId, []);
  return map.get(photoId);
}

export function allTags() {
  const counts = new Map();
  for (const p of state.photos) for (const t of p.tags) counts.set(t, (counts.get(t) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
