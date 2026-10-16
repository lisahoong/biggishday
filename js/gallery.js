import * as api from './api.js?v=10';
import { state, listFor, allTags, isShown, ARCHIVED } from './state.js?v=10';
import { openDetail } from './detail.js?v=10';
import { renderCommentPanel, refreshCommentPanel } from './comments.js?v=10';
import { h, icon, toast, errorMessage, masonry, normalizeTag } from './ui.js?v=10';

const MAX_EDGE = 2400;
const byAdded = (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at);
const SORTS = {
  newest: ['Newest first', byAdded],
  oldest: ['Oldest first', (a, b) => byAdded(b, a)],
  comments: ['Most comments', (a, b) => listFor(state.comments, b.id).length - listFor(state.comments, a.id).length || byAdded(a, b)],
};

let filtersEl, gridEl, countEl, trashBtn, selectBtn, selectBar, archivedBtn;
// Select mode: clicking photos toggles them, and the bottom bar tags them all at once.
let selecting = false;
const selected = new Set();

// The comments panel sticks just below the topbar, so it needs the topbar's height.
// (A topbar removed from the page reports 0; keep the last real height.)
const topbarObserver = new ResizeObserver(([entry]) => {
  if (entry.target.isConnected) document.documentElement.style.setProperty('--topbar-h', `${entry.target.offsetHeight}px`);
});

export function renderGallery(root, { onSignOut, onChangeName, onOpenTrash, onOpenComments }) {
  enableDrop();
  const search = h('input', {
    type: 'search', class: 'search', placeholder: 'Search', 'aria-label': 'Search tags and comments',
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
  const sort = h('select', { class: 'sort', 'aria-label': 'Sort photos' },
    Object.entries(SORTS).map(([key, [label]]) => h('option', { value: key, selected: key === state.sort }, label)));
  sort.addEventListener('change', () => { state.sort = sort.value; refreshGallery(); });
  gridEl = h('main', { class: 'masonry' });
  trashBtn = h('button', { class: 'link-btn', onClick: onOpenTrash });
  selecting = false;
  selected.clear();
  selectBtn = h('button', { class: 'link-btn select-toggle', onClick: () => setSelecting(!selecting) }, 'Select');
  archivedBtn = h('button', {
    class: 'link-btn select-toggle',
    onClick: () => { state.showArchived = !state.showArchived; refreshGallery(); },
  });
  selectBar = renderSelectBar();
  const commentPanel = h('aside', { class: 'comment-panel', 'aria-label': 'Comments on photos with the selected tags', hidden: true });

  const topbar = h('header', { class: 'topbar' },
    h('div', { class: 'brand' }, 'Our Wedding Board'),
    search,
    h('button', { class: 'btn btn-primary', onClick: () => fileInput.click() }, icon('upload'), 'Add photos'),
    fileInput,
    h('div', { class: 'me' },
      h('button', { class: 'link-btn me-name', title: 'Change your name', onClick: onChangeName }, state.me.name),
      h('button', { class: 'link-btn', onClick: onOpenComments }, 'Comments'),
      trashBtn,
      h('button', { class: 'link-btn', onClick: onSignOut }, 'Sign out')));
  topbarObserver.disconnect();
  topbarObserver.observe(topbar);

  root.replaceChildren(
    topbar,
    h('div', { class: 'board' },
      h('div', { class: 'board-main' },
        filtersEl,
        h('div', { class: 'count-row' }, countEl, h('div', { class: 'count-actions' }, archivedBtn, selectBtn, sort)),
        gridEl),
      commentPanel),
    selectBar,
  );
  renderCommentPanel(commentPanel, refreshGallery);
  refreshGallery();
}

function visiblePhotos() {
  const q = state.search.trim().toLowerCase();
  return state.photos.filter((p) => {
    if (!isShown(p)) return false;
    for (const t of state.filterTags) if (!p.tags.includes(t)) return false;
    if (!q) return true;
    return p.tags.some((t) => t.includes(q))
      || listFor(state.comments, p.id).some((c) => c.body.toLowerCase().includes(q));
  }).sort(SORTS[state.sort][1]);
}

export function refreshGallery() {
  if (!gridEl) return;
  trashBtn.textContent = state.trash.length ? `Trash (${state.trash.length})` : 'Trash';
  const known = allTags();
  for (const t of [...state.filterTags]) if (!known.some(([x]) => x === t)) state.filterTags.delete(t);
  syncUrl();

  // Chip counts cover only the photos in view, so hidden archived photos don't inflate them.
  // The "archived" chip and any selected tag always get a chip, so they can be clicked.
  const inView = state.photos.filter(isShown);
  const tags = allTags(inView);
  const archivedCount = state.photos.filter((p) => p.tags.includes(ARCHIVED)).length;
  if (archivedCount && !tags.some(([t]) => t === ARCHIVED)) tags.push([ARCHIVED, archivedCount]);
  for (const t of state.filterTags) if (!tags.some(([x]) => x === t)) tags.push([t, 0]);
  archivedBtn.hidden = !archivedCount;
  archivedBtn.textContent = state.showArchived ? 'Hide archived' : `Show archived (${archivedCount})`;
  archivedBtn.setAttribute('aria-pressed', String(state.showArchived));

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
  countEl.textContent = photos.length === inView.length
    ? `${photos.length} photo${photos.length === 1 ? '' : 's'}`
    : `Showing ${photos.length} of ${inView.length}`;

  const empty = state.photos.length
    ? h('div', { class: 'empty' }, h('p', {}, 'Nothing matches those filters.'))
    : h('div', { class: 'empty' }, h('p', {}, 'No photos yet.'), h('p', { class: 'muted' }, 'Use “Add photos”, or drag or paste photos onto the page.'));
  masonry(gridEl, photos.map((p) => card(p, ids)), empty);
  updateSelectBar();
  refreshCommentPanel();
}

// Replaces rather than pushes, so Back still leaves the board instead of stepping through filters.
function syncUrl() {
  const url = new URL(location.href);
  url.searchParams.delete('tag');
  for (const t of state.filterTags) url.searchParams.append('tag', t);
  if (state.showArchived) url.searchParams.set('archived', '1');
  else url.searchParams.delete('archived');
  if (url.href !== location.href) history.replaceState(null, '', url);
}

function setSelecting(on) {
  selecting = on;
  selected.clear();
  selectBtn.textContent = on ? 'Done' : 'Select';
  gridEl.classList.toggle('is-selecting', on);
  for (const el of gridEl.querySelectorAll('.card')) {
    el.classList.remove('is-selected');
    if (on) el.setAttribute('aria-pressed', 'false');
    else el.removeAttribute('aria-pressed');
  }
  updateSelectBar();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && selecting && gridEl?.isConnected) setSelecting(false);
});

function toggleSelected(photo, el) {
  if (selected.has(photo.id)) selected.delete(photo.id);
  else selected.add(photo.id);
  el.classList.toggle('is-selected', selected.has(photo.id));
  el.setAttribute('aria-pressed', String(selected.has(photo.id)));
  updateSelectBar();
}

function renderSelectBar() {
  const input = h('input', {
    class: 'tag-input', list: 'bulk-tag-suggestions', placeholder: 'Tag to add, e.g. centerpiece',
    'aria-label': 'Tag to add to selected photos', autocomplete: 'off',
  });
  const form = h('form', { class: 'select-form' }, input,
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'Add tag'),
    h('datalist', { id: 'bulk-tag-suggestions' }));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const tags = input.value.split(',').map(normalizeTag).filter(Boolean);
    if (!tags.length) return;
    input.value = '';
    tagSelected(tags);
  });
  const bar = h('div', { class: 'select-bar', hidden: true, role: 'region', 'aria-label': 'Selected photos' },
    h('span', { class: 'select-count' }),
    h('button', { class: 'link-btn', onClick: selectAllVisible }, 'Select all'),
    form,
    h('button', { class: 'link-btn', onClick: () => setSelecting(false) }, 'Done'));
  return bar;
}

function updateSelectBar() {
  if (!selectBar) return;
  // Drop selections for photos deleted since they were picked.
  for (const id of selected) if (!state.photos.some((p) => p.id === id)) selected.delete(id);
  selectBar.hidden = !selecting;
  const n = selected.size;
  selectBar.querySelector('.select-count').textContent = n ? `${n} selected` : 'Click photos to select them';
  selectBar.querySelector('.select-form button').disabled = !n;
  selectBar.querySelector('datalist').replaceChildren(...allTags().map(([t]) => h('option', { value: t })));
}

function selectAllVisible() {
  for (const p of visiblePhotos()) selected.add(p.id);
  for (const el of gridEl.querySelectorAll('.card')) {
    el.classList.add('is-selected');
    el.setAttribute('aria-pressed', 'true');
  }
  updateSelectBar();
}

async function tagSelected(tags) {
  const changes = state.photos
    .filter((p) => selected.has(p.id))
    .map((photo) => ({ photo, before: photo.tags, after: [...new Set([...photo.tags, ...tags])] }))
    .filter((c) => c.after.length !== c.before.length);
  const label = tags.map((t) => `“${t}”`).join(', ');
  if (!changes.length) return toast(`The selected photos already have ${label}.`);

  for (const c of changes) c.photo.tags = c.after;
  state.version++;
  refreshGallery();
  const results = await Promise.allSettled(changes.map((c) => api.updateTags(c.photo.id, c.after)));
  const failed = changes.filter((_, i) => results[i].status === 'rejected');
  for (const c of failed) c.photo.tags = c.before;
  if (failed.length) {
    refreshGallery();
    toast(`Couldn't tag ${failed.length} photo${failed.length === 1 ? '' : 's'}: ${errorMessage(results.find((r) => r.status === 'rejected').reason)}`, { kind: 'error' });
  }
  const done = changes.length - failed.length;
  if (done) toast(`Added ${label} to ${done} photo${done === 1 ? '' : 's'}.`);
}

function card(photo, ids) {
  const comments = listFor(state.comments, photo.id).length;
  const shownTags = photo.tags.slice(0, 4);
  const isSelected = selecting && selected.has(photo.id);
  const activate = (e) => {
    if (selecting) toggleSelected(photo, e.currentTarget);
    else openDetail(photo.id, ids, refreshGallery);
  };
  return h('figure', {
    class: `card ${isSelected ? 'is-selected' : ''}`, tabindex: '0', role: 'button',
    'aria-label': `Photo${photo.tags.length ? `: ${photo.tags.join(', ')}` : ''}`,
    'aria-pressed': selecting ? String(isSelected) : null,
    onClick: activate,
    onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(e); } },
  },
  h('span', { class: 'card-check', 'aria-hidden': 'true' }),
  h('img', { src: photo.url, alt: '', loading: 'lazy', decoding: 'async' }),
  shownTags.length || comments
    ? h('figcaption', {},
      h('div', { class: 'card-tags' },
        shownTags.map((t) => h('span', { class: 'chip chip-sm' }, t)),
        photo.tags.length > 4 ? h('span', { class: 'muted small' }, `+${photo.tags.length - 4}`) : null),
      comments
        ? h('div', { class: 'card-meta' },
          h('span', { title: `${comments} comment${comments === 1 ? '' : 's'}` }, icon('comment'), comments))
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

// Drag images onto the board to add them: files from Finder, or images from another browser
// window. Paste (⌘V) also works, which helps for sites that block downloading their images.
// Listeners are set up once on the document and only act while the gallery is showing.
const COPY_TIP = 'Right-click the image, choose Copy Image, then press ⌘V (Ctrl+V) here.';
let dropReady = false;

function enableDrop() {
  if (dropReady) return;
  dropReady = true;
  const overlay = h('div', { class: 'drop-overlay', hidden: true }, h('p', {}, 'Drop photos to add them'));
  document.body.append(overlay);
  const inGallery = () => gridEl?.isConnected;
  // Drags that start on this page (e.g. a board photo) aren't new photos.
  let internal = false;
  const droppable = (e) => !internal && ['Files', 'text/uri-list'].some((t) => e.dataTransfer?.types.includes(t));
  let depth = 0;
  const hide = () => { depth = 0; overlay.hidden = true; };

  document.addEventListener('dragstart', () => { internal = true; });
  document.addEventListener('dragend', () => { internal = false; });
  document.addEventListener('dragenter', (e) => {
    if (!droppable(e) || !inGallery()) return;
    depth++;
    overlay.hidden = false;
  });
  document.addEventListener('dragleave', (e) => {
    if (droppable(e) && --depth <= 0) hide();
  });
  document.addEventListener('dragover', (e) => {
    if (!droppable(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = inGallery() ? 'copy' : 'none';
  });
  document.addEventListener('drop', (e) => {
    if (!droppable(e)) return;
    e.preventDefault();
    hide();
    if (inGallery()) addDropped(e.dataTransfer);
  });
  document.addEventListener('paste', (e) => {
    const images = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (!images.length || !inGallery()) return;
    e.preventDefault();
    uploadFiles(images);
  });
}

function addDropped(dt) {
  const files = [...dt.files];
  if (files.length) {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length < files.length) toast('Only image files can be added.', { kind: 'error' });
    return uploadFiles(images);
  }
  const url = droppedImageUrl(dt);
  if (!url) return toast(`Couldn't find an image in what was dropped. ${COPY_TIP}`, { kind: 'error' });
  addFromUrl(url);
}

// A dragged image inside a link (common on Pinterest and the like) gives the link as the URL,
// so prefer the <img> in the dragged HTML.
function droppedImageUrl(dt) {
  const html = dt.getData('text/html');
  const src = html && new DOMParser().parseFromString(html, 'text/html').querySelector('img')?.getAttribute('src');
  const candidates = [src, ...dt.getData('text/uri-list').split(/\r?\n/).filter((l) => l && !l.startsWith('#'))];
  for (const c of candidates) {
    try {
      const url = new URL(c);
      if (['http:', 'https:', 'data:'].includes(url.protocol)) return url.href;
    } catch { /* relative or malformed; try the next one */ }
  }
  return null;
}

async function addFromUrl(url) {
  const progress = toast('Fetching image…', { sticky: true });
  let blob;
  try {
    const res = await fetch(url, { referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    blob = await res.blob();
  } catch {
    // Almost always the site not allowing other pages to download its images (CORS).
    progress.close();
    return toast(`That site doesn't let its images be downloaded here. ${COPY_TIP}`, { kind: 'error' });
  }
  progress.close();
  if (!blob.type.startsWith('image/')) return toast(`That link isn't an image. ${COPY_TIP}`, { kind: 'error' });
  uploadFiles([new File([blob], fileNameFrom(url), { type: blob.type })]);
}

function fileNameFrom(url) {
  if (url.startsWith('data:')) return 'dropped-image';
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop()) || 'dropped-image';
  } catch {
    return 'dropped-image';
  }
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
