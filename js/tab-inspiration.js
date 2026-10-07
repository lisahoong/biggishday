const tabInspiration = (() => {

// Module-local view state — deliberately not persisted; filters are exploratory.
const view = {
  query: '',
  tags: new Set(),
  suggested: new Set(),
  untaggedOnly: false,
  boardId: null,       // null = all photos
  showSuggested: false,
};

function render(root, ctx) {
  const { photos } = store.state;
  const boards = store.state.data.collections;
  const board = view.boardId ? boards.find(b => b.id === view.boardId) : null;
  if (view.boardId && !board) view.boardId = null;

  root.append(
    el('div', { class: 'page-head' },
      el('div', {},
        el('h2', {}, board ? board.name : 'Inspiration'),
        el('p', { class: 'lede' }, board
          ? (board.description || `${board.photoFilenames.length} photos in this board.`)
          : 'Filter by tag to find a direction, then group what you love into a board.'),
      ),
      el('div', { class: 'head-actions' },
        board
          ? el('button', { class: 'btn btn-secondary', onclick: () => { view.boardId = null; store.notify(); } }, '← All photos')
          : null,
        board
          ? el('button', { class: 'btn btn-secondary', onclick: () => editBoard(board) }, 'Edit board')
          : el('button', { class: 'btn btn-primary', onclick: () => editBoard(null) }, 'New board'),
      ),
    ),
  );

  if (!board) root.append(boardStrip(boards));

  const pool = board
    ? photos.filter(p => board.photoFilenames.includes(p.filename))
    : photos;

  root.append(filterPanel(pool));

  const results = applyFilters(pool);
  root.append(
    el('div', { class: 'section-head', style: { marginTop: '18px' } },
      el('h3', {}, `${results.length} ${results.length === 1 ? 'photo' : 'photos'}`),
      hasFilters()
        ? el('button', { class: 'btn btn-ghost btn-sm', onclick: clearFilters }, 'Clear filters')
        : null,
    ),
  );

  if (!photos.length) {
    root.append(emptyState('No photos yet', 'Drop images into the photos/ folder, then reload.'));
    return;
  }
  if (!results.length) {
    root.append(emptyState('Nothing matches', 'Try loosening the filters.'));
    return;
  }
  root.append(photoGrid(results, ctx));
}

// ---------- filtering ----------
function hasFilters() {
  return view.query || view.tags.size || view.suggested.size || view.untaggedOnly;
}
function clearFilters() {
  view.query = '';
  view.tags.clear();
  view.suggested.clear();
  view.untaggedOnly = false;
  store.notify();
}

function applyFilters(pool) {
  const q = view.query.trim().toLowerCase();
  return pool.filter(p => {
    if (view.untaggedOnly && p.tags.length) return false;
    for (const t of view.tags) if (!p.tags.includes(t)) return false;
    for (const t of view.suggested) if (!p.suggestedTags.includes(t)) return false;
    if (q) {
      const hay = [p.filename, ...p.tags, ...p.suggestedTags].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Counts computed over the current pool so chip numbers reflect what you'd actually get. */
function countsFor(pool, key) {
  const counts = new Map();
  for (const p of pool) for (const t of p[key]) counts.set(t, (counts.get(t) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function filterPanel(pool) {
  const userTags = countsFor(pool, 'tags');
  const suggested = countsFor(pool, 'suggestedTags');

  const search = el('input', {
    type: 'text', placeholder: 'Search tags or filenames…', value: view.query,
    oninput: e => { view.query = e.target.value; debounceRender(); },
  });

  const panel = el('div', { class: 'card card-pad filter-panel' },
    el('div', { class: 'filter-top' },
      search,
      chip('Untagged only', {
        active: view.untaggedOnly,
        onclick: () => { view.untaggedOnly = !view.untaggedOnly; store.notify(); },
      }),
    ),
    el('div', { class: 'chip-row' },
      userTags.map(([tag, count]) => chip(tag, {
        count, active: view.tags.has(tag),
        onclick: () => { toggle(view.tags, tag); store.notify(); },
      })),
      userTags.length ? null : el('span', { class: 'hint' }, 'No tags yet.'),
    ),
    suggested.length ? el('details', { class: 'suggested-block', open: view.showSuggested || undefined },
      el('summary', {
        onclick: () => { view.showSuggested = !view.showSuggested; },
      }, `AI-suggested tags (${suggested.length})`),
      el('div', { class: 'chip-row', style: { marginTop: '10px' } },
        suggested.map(([tag, count]) => chip(tag, {
          count, suggested: true, active: view.suggested.has(tag),
          onclick: () => { toggle(view.suggested, tag); store.notify(); },
        })),
      ),
    ) : null,
  );
  return panel;
}

function toggle(set, value) {
  if (set.has(value)) set.delete(value); else set.add(value);
}

let debounceTimer = null;
function debounceRender() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => store.notify(), 180);
}

// ---------- boards ----------
function boardStrip(boards) {
  const wrap = el('div', { class: 'section' },
    el('div', { class: 'section-head' }, el('h3', {}, 'Boards')),
  );
  if (!boards.length) {
    wrap.append(el('p', { class: 'hint', style: { color: 'var(--ink-3)', fontSize: '13px', margin: '0' } },
      'No boards yet — group photos into a board to compare directions side by side.'));
    return wrap;
  }
  wrap.append(el('div', { class: 'board-strip' },
    boards.map(b => {
      const palette = b.paletteId ? store.paletteById(b.paletteId) : null;
      const cover = b.coverPhoto || b.photoFilenames[0];
      const coverPhoto = cover ? store.photoByName(cover) : null;
      return el('button', {
        class: 'board-card',
        onclick: () => { view.boardId = b.id; clearFilters(); },
      },
        el('div', { class: 'board-thumb' },
          coverPhoto ? el('img', { src: coverPhoto.url, alt: '', loading: 'lazy' }) : null,
        ),
        el('div', { class: 'board-meta' },
          el('strong', {}, b.name),
          el('span', {}, `${b.photoFilenames.length} photo${b.photoFilenames.length === 1 ? '' : 's'}`),
          palette ? swatchStrip(palette.colors, { class: 'swatch-strip board-swatch' }) : null,
        ),
      );
    }),
  ));
  return wrap;
}

function editBoard(board) {
  const isNew = !board;
  const name = textInput(board?.name || '', { placeholder: 'e.g. Garden party, warm' });
  const desc = el('textarea', { placeholder: 'What is this direction about?' }, board?.description || '');
  const paletteSel = el('select', {},
    el('option', { value: '' }, 'No palette'),
    store.state.data.palettes.map(p => {
      const o = el('option', { value: p.id }, p.name);
      if (p.id === board?.paletteId) o.selected = true;
      return o;
    }),
  );

  openModal({
    title: isNew ? 'New board' : 'Edit board',
    body: el('div', { style: { display: 'contents' } },
      field('Name', name),
      field('Description', desc),
      field('Palette', paletteSel),
    ),
    actions: [
      !isNew ? el('button', {
        class: 'btn btn-danger',
        onclick: () => confirmDialog('Delete board?', `"${board.name}" will be removed. The photos themselves stay put.`, () => {
          store.commit(d => { d.collections = d.collections.filter(c => c.id !== board.id); });
          view.boardId = null;
          toast('Board deleted');
        }),
      }, 'Delete') : null,
      el('span', { class: 'spacer' }),
      el('button', { class: 'btn btn-secondary', onclick: closeModal }, 'Cancel'),
      el('button', {
        class: 'btn btn-primary',
        onclick: () => {
          const value = name.value.trim();
          if (!value) { toast('Give the board a name', 'error'); return; }
          store.commit(d => {
            if (isNew) {
              d.collections.push({
                id: store.newId('col'), name: value, description: desc.value.trim(),
                photoFilenames: [], paletteId: paletteSel.value || null, coverPhoto: null,
              });
            } else {
              const b = d.collections.find(c => c.id === board.id);
              b.name = value;
              b.description = desc.value.trim();
              b.paletteId = paletteSel.value || null;
            }
          });
          closeModal();
        },
      }, isNew ? 'Create' : 'Save'),
    ],
  });
}

// ---------- grid ----------
function photoGrid(photos, ctx) {
  return el('div', { class: 'photo-grid' },
    photos.map(p => el('button', {
      class: 'photo-card',
      onclick: () => openPhoto(p, ctx),
    },
      el('img', { src: p.url, alt: p.filename, loading: 'lazy' }),
      el('div', { class: 'photo-overlay' },
        el('div', { class: 'photo-tags' },
          p.tags.length
            ? p.tags.slice(0, 4).map(t => el('span', { class: 'mini-tag' }, t))
            : el('span', { class: 'mini-tag muted' }, 'untagged'),
        ),
      ),
    )),
  );
}

// ---------- photo detail ----------
function openPhoto(photo, ctx) {
  const body = el('div', { class: 'photo-detail' });

  const rerender = () => {
    clear(body).append(
      el('div', { class: 'photo-detail-img' }, el('img', { src: photo.url, alt: photo.filename })),
      el('div', { class: 'photo-detail-side' }, ...sideSections(photo, rerender)),
    );
  };
  rerender();

  openModal({ title: 'Photo', body, wide: true, actions: [
    el('button', { class: 'btn btn-secondary', onclick: closeModal }, 'Done'),
  ] });
}

function sideSections(photo, rerender) {
  const vocab = [...store.tagVocabulary().keys()].sort();
  const listId = 'tagOptions';

  const input = el('input', {
    type: 'text', placeholder: 'Add a tag…', list: listId,
    onkeydown: e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      addTag(photo, input.value, rerender);
      input.value = '';
    },
  });

  const yourTags = el('div', { class: 'section' },
    el('div', { class: 'section-head' }, el('h3', {}, 'Your tags')),
    el('div', { class: 'chip-row' },
      photo.tags.length
        ? photo.tags.map(t => el('span', { class: 'chip active removable' }, t,
            el('button', { class: 'chip-x', title: 'Remove', onclick: () => removeTag(photo, t, rerender) }, '✕')))
        : el('span', { style: { color: 'var(--ink-3)', fontSize: '13px' } }, 'None yet.'),
    ),
    el('div', { class: 'add-tag-row' },
      input,
      el('datalist', { id: listId }, vocab.map(t => el('option', { value: t }))),
      el('button', { class: 'btn btn-secondary btn-sm', onclick: () => { addTag(photo, input.value, rerender); input.value = ''; } }, 'Add'),
    ),
  );

  const unusedSuggestions = photo.suggestedTags.filter(t => !photo.tags.includes(t));
  const suggestions = el('div', { class: 'section' },
    el('div', { class: 'section-head' }, el('h3', {}, 'AI suggestions')),
    el('div', { class: 'chip-row' },
      unusedSuggestions.length
        ? unusedSuggestions.map(t => chip(`+ ${t}`, {
            suggested: true,
            title: 'Add to your tags',
            onclick: () => addTag(photo, t, rerender),
          }))
        : el('span', { style: { color: 'var(--ink-3)', fontSize: '13px' } },
            photo.suggestedTags.length ? 'All applied.' : 'None — run /suggest-photo-tags.'),
    ),
  );

  const boards = store.state.data.collections;
  const boardSection = el('div', { class: 'section' },
    el('div', { class: 'section-head' }, el('h3', {}, 'Boards')),
    boards.length
      ? el('div', { class: 'chip-row' }, boards.map(b => chip(b.name, {
          active: b.photoFilenames.includes(photo.filename),
          onclick: () => {
            store.commit(d => {
              const board = d.collections.find(c => c.id === b.id);
              const i = board.photoFilenames.indexOf(photo.filename);
              if (i === -1) board.photoFilenames.push(photo.filename);
              else board.photoFilenames.splice(i, 1);
            });
            rerender();
          },
        })))
      : el('span', { style: { color: 'var(--ink-3)', fontSize: '13px' } }, 'No boards yet.'),
  );

  return [yourTags, suggestions, boardSection];
}

function addTag(photo, raw, rerender) {
  const tag = raw.trim().toLowerCase();
  if (!tag || photo.tags.includes(tag)) return;
  photo.tags.push(tag);
  store.savePhotoMetadata();
  rerender();
  store.notify();
}

function removeTag(photo, tag, rerender) {
  photo.tags = photo.tags.filter(t => t !== tag);
  store.savePhotoMetadata();
  rerender();
  store.notify();
}

return { render };
})();
