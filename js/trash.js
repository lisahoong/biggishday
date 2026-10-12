import * as api from './api.js?v=9';
import { state, TRASH_DAYS, trashExpiry } from './state.js?v=9';
import { h, icon, toast, errorMessage, formatDate, masonry } from './ui.js?v=9';

let gridEl, countEl, emptyBtn;

// Moves a trashed photo back onto the board. Returns true on success.
export async function restore(photo) {
  try {
    await api.restorePhoto(photo.id);
  } catch (err) {
    toast(`Couldn't restore photo: ${errorMessage(err)}`, { kind: 'error' });
    return false;
  }
  state.trash = state.trash.filter((p) => p.id !== photo.id);
  photo.deleted_at = null;
  photo.deleted_by_name = null;
  state.photos.push(photo);
  state.photos.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  state.version++;
  return true;
}

export function renderTrash(root, { onBack }) {
  countEl = h('p', { class: 'count muted' });
  gridEl = h('main', { class: 'masonry' });
  emptyBtn = h('button', { class: 'btn btn-ghost', onClick: emptyTrash }, 'Empty trash');

  root.replaceChildren(
    h('header', { class: 'topbar' },
      h('button', { class: 'btn btn-icon', 'aria-label': 'Back to board', title: 'Back to board', onClick: onBack }, icon('left')),
      h('div', { class: 'brand' }, 'Trash'),
      h('p', { class: 'muted small trash-note' }, `Photos are deleted for good ${TRASH_DAYS} days after they're moved here.`),
      emptyBtn),
    countEl,
    gridEl,
  );
  refreshTrash();
}

function refreshTrash() {
  const n = state.trash.length;
  countEl.textContent = `${n} photo${n === 1 ? '' : 's'}`;
  emptyBtn.disabled = !n;
  masonry(gridEl, state.trash.map(card),
    h('div', { class: 'empty' }, h('p', {}, 'The trash is empty.'), h('p', { class: 'muted' }, 'Deleted photos wait here so you can restore them.')));
}

function daysLeft(photo) {
  const days = Math.max(1, Math.ceil((trashExpiry(photo) - Date.now()) / 86400000));
  return `${days} day${days === 1 ? '' : 's'} left`;
}

function card(photo) {
  const by = photo.deleted_by_name ? ` by ${photo.deleted_by_name}` : '';
  return h('figure', { class: 'card trash-card' },
    h('img', { src: photo.url, alt: '', loading: 'lazy', decoding: 'async' }),
    h('figcaption', {},
      h('span', { class: 'muted small', title: `Deleted${by} on ${formatDate(photo.deleted_at)}` }, daysLeft(photo)),
      h('div', { class: 'trash-actions' },
        h('button', { class: 'link-btn', onClick: async () => { if (await restore(photo)) { toast('Photo restored.'); refreshTrash(); } } }, 'Restore'),
        h('button', { class: 'link-btn link-danger', onClick: () => deleteForever(photo) }, 'Delete forever'))));
}

async function purge(photo) {
  await api.deletePhoto(photo);
  state.trash = state.trash.filter((p) => p.id !== photo.id);
  state.comments.delete(photo.id);
}

async function deleteForever(photo) {
  if (!confirm('Delete this photo for good? Its comments will be deleted too. This can\'t be undone.')) return;
  try {
    await purge(photo);
    toast('Photo deleted for good.');
  } catch (err) {
    toast(`Couldn't delete photo: ${errorMessage(err)}`, { kind: 'error' });
  }
  refreshTrash();
}

async function emptyTrash() {
  const n = state.trash.length;
  if (!n || !confirm(`Delete all ${n} photo${n === 1 ? '' : 's'} in the trash for good? This can't be undone.`)) return;
  emptyBtn.disabled = true;
  const results = await Promise.allSettled(state.trash.map(purge));
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed) toast(`Couldn't delete ${failed} photo${failed === 1 ? '' : 's'}.`, { kind: 'error' });
  else toast('Trash emptied.');
  refreshTrash();
}

// Called once on load: anything trashed more than TRASH_DAYS ago is deleted for good.
// Best effort; if it fails (or the other device got there first) the next load retries.
export function purgeExpired() {
  const now = Date.now();
  const expired = state.trash.filter((p) => trashExpiry(p) <= now);
  state.trash = state.trash.filter((p) => trashExpiry(p) > now);
  for (const photo of expired) api.deletePhoto(photo).catch(() => {});
}
