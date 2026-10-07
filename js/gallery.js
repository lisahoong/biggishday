import * as api from './api.js';
import { state, listFor, allTags } from './state.js';
import { openDetail } from './detail.js';
import { h, icon, toast, errorMessage } from './ui.js';

const MAX_EDGE = 2400;

let filtersEl, gridEl, countEl;

export function renderGallery(root, { onSignOut, onChangeName }) {
  const search = h('input', {
    type: 'search', class: 'search', placeholder: 'Search tags and comments', 'aria-label': 'Search tags and comments',
    value: state.search,
  });
  search.addEventListener('input', () => { state.search = search.value; refreshGallery(); });

  const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  fileInput.addEventListener('change', () => {
    const files = [...fileInput.files];
    fileInput.value = '';
    uploadFiles(files);
  });

  filtersEl = h('div', { class: 'filters', role: 'group', 'aria-label': 'Filter by tag' });
  countEl = h('p', { class: 'count muted' });
  gridEl = h('main', { class: 'masonry' });

  root.replaceChildren(
    h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, 'Our Wedding Board'),
      search,
      h('button', { class: 'btn btn-primary', onClick: () => fileInput.click() }, icon('upload'), 'Add photos'),
      fileInput,
      h('div', { class: 'me' },
        h('button', { class: 'link-btn me-name', title: 'Change your name', onClick: onChangeName }, state.me.name),
        h('button', { class: 'link-btn', onClick: onSignOut }, 'Sign out'))),
    filtersEl,
    countEl,
    gridEl,
  );
  refreshGallery();
}

function visiblePhotos() {
  const q = state.search.trim().toLowerCase();
  return state.photos.filter((p) => {
    for (const t of state.filterTags) if (!p.tags.includes(t)) return false;
    if (!q) return true;
    return p.tags.some((t) => t.includes(q))
      || listFor(state.comments, p.id).some((c) => c.body.toLowerCase().includes(q));
  });
}

export function refreshGallery() {
  if (!gridEl) return;
  const tags = allTags();
  for (const t of [...state.filterTags]) if (!tags.some(([x]) => x === t)) state.filterTags.delete(t);

  filtersEl.replaceChildren(
    h('button', {
      class: `chip chip-filter ${state.filterTags.size ? '' : 'is-active'}`,
      onClick: () => { state.filterTags.clear(); refreshGallery(); },
    }, 'All'),
    ...tags.map(([t, n]) => h('button', {
      class: `chip chip-filter ${state.filterTags.has(t) ? 'is-active' : ''}`,
      'aria-pressed': String(state.filterTags.has(t)),
      onClick: () => {
        if (state.filterTags.has(t)) state.filterTags.delete(t);
        else state.filterTags.add(t);
        refreshGallery();
      },
    }, t, h('span', { class: 'chip-count' }, n))),
  );

  const photos = visiblePhotos();
  const ids = photos.map((p) => p.id);
  countEl.textContent = photos.length === state.photos.length
    ? `${photos.length} photo${photos.length === 1 ? '' : 's'}`
    : `Showing ${photos.length} of ${state.photos.length}`;

  if (!state.photos.length) {
    gridEl.replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'No photos yet.'), h('p', { class: 'muted' }, 'Use “Add photos” to start the board.')));
    return;
  }
  if (!photos.length) {
    gridEl.replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'Nothing matches those filters.')));
    return;
  }

  gridEl.replaceChildren(...photos.map((p) => card(p, ids)));
}

function card(photo, ids) {
  const comments = listFor(state.comments, photo.id).length;
  const marks = listFor(state.markings, photo.id).length;
  const shownTags = photo.tags.slice(0, 4);
  const open = () => openDetail(photo.id, ids, refreshGallery);
  return h('figure', {
    class: 'card', tabindex: '0', role: 'button', 'aria-label': `Open photo${photo.tags.length ? `: ${photo.tags.join(', ')}` : ''}`,
    onClick: open,
    onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } },
  },
  h('img', { src: photo.url, alt: '', loading: 'lazy', decoding: 'async' }),
  shownTags.length || comments || marks
    ? h('figcaption', {},
      h('div', { class: 'card-tags' },
        shownTags.map((t) => h('span', { class: 'chip chip-sm' }, t)),
        photo.tags.length > 4 ? h('span', { class: 'muted small' }, `+${photo.tags.length - 4}`) : null),
      comments || marks
        ? h('div', { class: 'card-meta' },
          comments ? h('span', { title: `${comments} comment${comments === 1 ? '' : 's'}` }, icon('comment'), comments) : null,
          marks ? h('span', { title: `${marks} marking${marks === 1 ? '' : 's'}` }, icon('pen'), marks) : null)
        : null)
    : null);
}

async function prepareImage(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name}: this browser can't read that image format`);
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(`${file.name}: couldn't process image`))), 'image/jpeg', 0.85);
  });
}

async function uploadFiles(files) {
  if (!files.length) return;
  const progress = toast(`Uploading 1 of ${files.length}…`, { sticky: true });
  const failures = [];
  for (const [i, file] of files.entries()) {
    progress.update(`Uploading ${i + 1} of ${files.length}…`);
    try {
      const blob = await prepareImage(file);
      const photo = await api.uploadPhoto(blob, file.name, state.me.name);
      state.photos.unshift(photo);
      refreshGallery();
    } catch (err) {
      failures.push(errorMessage(err));
    }
  }
  progress.close();
  const done = files.length - failures.length;
  if (done) toast(`Added ${done} photo${done === 1 ? '' : 's'}.`);
  for (const f of failures) toast(`Upload failed: ${f}`, { kind: 'error' });
}
