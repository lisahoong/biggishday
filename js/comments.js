import * as api from './api.js?v=8';
import { state, listFor } from './state.js?v=8';
import { openDetail } from './detail.js?v=8';
import { h, icon, toast, errorMessage, timeAgo } from './ui.js?v=8';

let filtersEl, countEl, listEl;
// Show only this person's comments; null shows everyone's.
let author = null;

export function renderComments(root, { onBack }) {
  filtersEl = h('div', { class: 'filters', role: 'group', 'aria-label': 'Filter by person' });
  countEl = h('p', { class: 'count muted' });
  listEl = h('main', { class: 'feed' });

  root.replaceChildren(
    h('header', { class: 'topbar' },
      h('button', { class: 'btn btn-icon', 'aria-label': 'Back to board', title: 'Back to board', onClick: onBack }, icon('left')),
      h('div', { class: 'brand' }, 'Comments')),
    h('div', { class: 'feed-page' }, filtersEl, countEl, listEl),
  );
  window.scrollTo(0, 0);
  refreshComments();
  fetchLatest(refreshComments);
}

// Comments were loaded with the board; pick up any the other person has left since.
async function fetchLatest(onDone) {
  const startVersion = state.version;
  try {
    const rows = await api.loadComments();
    if (state.version !== startVersion) return;
    const byPhoto = new Map();
    for (const c of rows) listFor(byPhoto, c.photo_id).push(c);
    state.comments = byPhoto;
    onDone();
  } catch (err) {
    toast(`Couldn't load the latest comments: ${errorMessage(err)}`, { kind: 'error' });
  }
}

// Newest first. Comments on photos in the trash are left out.
function allComments() {
  const photos = new Map(state.photos.map((p) => [p.id, p]));
  const all = [];
  for (const [photoId, comments] of state.comments) {
    const photo = photos.get(photoId);
    if (photo) for (const comment of comments) all.push({ comment, photo });
  }
  return all.sort((a, b) => Date.parse(b.comment.created_at) - Date.parse(a.comment.created_at));
}

function refreshComments() {
  if (!listEl?.isConnected) return;
  const all = allComments();
  const counts = new Map();
  for (const { comment } of all) counts.set(comment.author_name, (counts.get(comment.author_name) || 0) + 1);
  if (author && !counts.has(author)) author = null;

  const chip = (label, n, name) => h('button', {
    class: `chip chip-filter ${author === name ? 'is-active' : ''}`,
    'aria-pressed': String(author === name),
    onClick: () => { author = name; refreshComments(); },
  }, label, h('span', { class: 'chip-count' }, n));
  filtersEl.replaceChildren(
    chip('Everyone', all.length, null),
    ...[...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, n]) => chip(name, n, name)),
  );

  const shown = author ? all.filter(({ comment }) => comment.author_name === author) : all;
  countEl.textContent = `${shown.length} comment${shown.length === 1 ? '' : 's'}`;
  // Arrows in the photo view step through the photos in the order they appear here.
  const ids = [...new Set(shown.map(({ photo }) => photo.id))];
  listEl.replaceChildren(...(shown.length
    ? shown.map((entry) => item(entry, ids, refreshComments))
    : [h('div', { class: 'empty' }, h('p', {}, 'No comments yet.'), h('p', { class: 'muted' }, 'Open a photo on the board to leave the first one.'))]));
}

function item({ comment, photo }, ids, onChange) {
  const open = () => openDetail(photo.id, ids, onChange);
  return h('article', {
    class: 'feed-item', tabindex: '0', role: 'button',
    'aria-label': `${comment.author_name}: ${comment.body}. Open the photo.`,
    onClick: open,
    onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } },
  },
  h('img', { class: 'feed-thumb', src: photo.url, alt: '', loading: 'lazy', decoding: 'async' }),
  h('div', { class: 'feed-text' },
    h('div', { class: 'comment-head' },
      h('strong', {}, comment.author_name),
      h('time', { datetime: comment.created_at, title: new Date(comment.created_at).toLocaleString() }, timeAgo(comment.created_at))),
    h('p', { class: 'comment-body' }, comment.body),
    photo.tags.length
      ? h('div', { class: 'card-tags' }, photo.tags.slice(0, 4).map((t) => h('span', { class: 'chip chip-sm' }, t)))
      : null));
}

// Board panel: while tags are selected, comments on photos with any of those tags.
let panel = null;
let panelCollapsed = false;

export function renderCommentPanel(host, onChange) {
  panel = { host, onChange, shown: false };
  refreshCommentPanel();
}

export function refreshCommentPanel() {
  if (!panel?.host.isConnected) return;
  const { host, onChange } = panel;
  const tags = [...state.filterTags];
  host.hidden = !tags.length;
  if (!tags.length) {
    // Clearing the tags resets the panel, so the next tag picked slides it in again.
    panel.shown = false;
    panelCollapsed = false;
    host.replaceChildren();
    return;
  }
  if (!panel.shown) {
    panel.shown = true;
    fetchLatest(refreshCommentPanel);
  }

  const entries = allComments().filter(({ photo }) => photo.tags.some((t) => state.filterTags.has(t)));
  host.classList.toggle('is-collapsed', panelCollapsed);
  const setCollapsed = (collapsed) => { panelCollapsed = collapsed; refreshCommentPanel(); };
  if (panelCollapsed) {
    host.replaceChildren(h('button', { class: 'panel-tab', title: 'Show comments', onClick: () => setCollapsed(false) },
      icon('comment'), `Comments · ${entries.length}`));
    return;
  }

  const ids = [...new Set(entries.map(({ photo }) => photo.id))];
  const tagList = tags.map((t) => `‘${t}’`).join(' or ');
  host.replaceChildren(
    h('div', { class: 'comment-panel-head' },
      h('div', {},
        h('h2', {}, `Comments · ${entries.length}`),
        h('p', { class: 'muted small' }, `On photos tagged ${tagList}`)),
      h('button', { class: 'btn btn-icon', 'aria-label': 'Collapse comments', title: 'Collapse comments', onClick: () => setCollapsed(true) }, icon('right'))),
    entries.length
      ? h('div', { class: 'feed' }, entries.map((entry) => item(entry, ids, onChange)))
      : h('p', { class: 'panel-empty muted' }, 'No comments on these photos yet.'),
  );
}
