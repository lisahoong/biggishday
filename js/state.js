export const state = {
  me: null,
  photos: [],
  comments: new Map(),
  markings: new Map(),
  filterTags: new Set(),
  search: '',
  // Bumped on every local edit so a slower background refresh can't overwrite it.
  version: 0,
};

export function listFor(map, photoId) {
  if (!map.has(photoId)) map.set(photoId, []);
  return map.get(photoId);
}

export function allTags() {
  const counts = new Map();
  for (const p of state.photos) for (const t of p.tags) counts.set(t, (counts.get(t) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
