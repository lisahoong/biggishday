const tabVendors = (() => {

const view = { categoryId: null, compare: new Set() };

function render(root, ctx) {
  const data = store.state.data;
  const cats = store.sortedCategories();

  root.append(
    el('div', { class: 'page-head' },
      el('div', {},
        el('h2', {}, 'Vendors'),
        el('p', { class: 'lede' },
          'Keep the options you are weighing in one place. Tag each with the same words you use on your inspiration board and the overlap is worked out for you.'),
      ),
      el('div', { class: 'head-actions' },
        view.compare.size >= 2
          ? el('button', { class: 'btn btn-secondary', onclick: () => openCompare(ctx) }, `Compare ${view.compare.size}`)
          : null,
        el('button', { class: 'btn btn-primary', onclick: () => editVendor(null, view.categoryId) }, 'Add option'),
      ),
    ),
  );

  // category filter
  root.append(el('div', { class: 'chip-row', style: { marginBottom: '22px' } },
    chip('All', { active: !view.categoryId, onclick: () => { view.categoryId = null; store.notify(); } }),
    cats.map(c => {
      const n = data.vendorOptions.filter(v => v.categoryId === c.id).length;
      return chip(c.name, {
        count: n || null, active: view.categoryId === c.id,
        onclick: () => { view.categoryId = c.id; store.notify(); },
      });
    }),
  ));

  const options = data.vendorOptions.filter(v => !view.categoryId || v.categoryId === view.categoryId);
  if (!options.length) {
    root.append(emptyState(
      view.categoryId ? 'Nothing here yet' : 'No vendor options yet',
      'Add the options you are considering so you can weigh them against each other.',
      el('button', { class: 'btn btn-primary', onclick: () => editVendor(null, view.categoryId) }, 'Add an option'),
    ));
    return;
  }

  // group by category so like is compared with like
  const groups = new Map();
  for (const v of options) {
    if (!groups.has(v.categoryId)) groups.set(v.categoryId, []);
    groups.get(v.categoryId).push(v);
  }

  const tagCounts = store.boardVocabulary();
  for (const c of cats) {
    const list = groups.get(c.id);
    if (!list) continue;
    root.append(
      el('div', { class: 'section' },
        el('div', { class: 'section-head' },
          el('h3', {}, c.name),
          el('span', { class: 'hint' }, `${list.length} option${list.length === 1 ? '' : 's'}`),
        ),
        el('div', { class: 'vendor-grid' }, list.map(v => vendorCard(v, tagCounts, ctx))),
      ),
    );
  }
}

function vendorCard(v, tagCounts, ctx) {
  const overlap = styleOverlap(v.styleTags, tagCounts);
  const palette = v.paletteId ? store.paletteById(v.paletteId) : null;
  const selected = view.compare.has(v.id);

  return el('div', { class: `vendor-card${v.status === 'passed' ? ' passed' : ''}` },
    palette ? swatchStrip(palette.colors, { class: 'swatch-strip vendor-swatch' }) : null,
    el('div', { class: 'vendor-body' },
      el('div', { class: 'vendor-top' },
        el('div', { class: 'vendor-name' },
          el('strong', {}, v.name),
          v.url ? el('a', { href: v.url, target: '_blank', rel: 'noopener noreferrer', class: 'vendor-url', onclick: e => e.stopPropagation() }, '↗') : null,
        ),
        statusPill(v.status),
      ),
      el('div', { class: 'vendor-price num' }, priceLabel(v)),
      v.styleTags?.length
        ? el('div', { class: 'chip-row', style: { marginTop: '10px' } },
            v.styleTags.map(t => chip(t, {
              title: tagCounts.get(t) ? `${tagCounts.get(t)} photos on your board share this tag` : 'Not on your board yet',
              onclick: null,
            })))
        : null,
      overlap.length
        ? el('div', { class: 'overlap' },
            `Matches your board on ${overlap.length} tag${overlap.length === 1 ? '' : 's'} `,
            el('em', {}, `(${overlap.slice(0, 3).map(o => `${o.tag} ×${o.count}`).join(', ')})`))
        : (v.styleTags?.length ? el('div', { class: 'overlap muted' }, 'No overlap with your board') : null),
      v.notes ? el('p', { class: 'vendor-notes' }, v.notes) : null,
      el('div', { class: 'vendor-actions' },
        el('button', { class: 'btn btn-secondary btn-sm', onclick: () => editVendor(v) }, 'Edit'),
        v.status !== 'booked'
          ? el('button', { class: 'btn btn-primary btn-sm', onclick: () => bookVendor(v, ctx) }, 'Book')
          : el('button', { class: 'btn btn-ghost btn-sm', onclick: () => ctx.goToTab('budget') }, 'In budget →'),
        el('span', { style: { flex: '1' } }),
        el('button', {
          class: `btn btn-sm ${selected ? 'btn-primary' : 'btn-ghost'}`,
          title: 'Add to comparison',
          onclick: () => {
            if (selected) view.compare.delete(v.id); else view.compare.add(v.id);
            store.notify();
          },
        }, selected ? '✓ Comparing' : 'Compare'),
      ),
    ),
  );
}

function priceLabel(v) {
  const min = Number(v.priceMin) || 0, max = Number(v.priceMax) || 0;
  if (min && max) return min === max ? money(min) : `${money(min)} – ${money(max)}`;
  if (max) return `up to ${money(max)}`;
  if (min) return `from ${money(min)}`;
  return 'No price yet';
}

// ---------- booking: the vendor → budget cross-link ----------
function bookVendor(vendor, ctx) {
  const existing = store.state.data.budgetItems.find(i => i.vendorOptionId === vendor.id);
  const amount = numberInput(existing ? (existing.actual ?? existing.estimate) : vendorMidpoint(vendor), { step: '100' });
  const category = store.categoryById(vendor.categoryId);

  openModal({
    title: `Book ${vendor.name}`,
    body: el('div', { style: { display: 'contents' } },
      el('p', { class: 'form-hint', style: { marginTop: '0' } },
        existing
          ? 'This will update the linked cost in your budget and lock it in.'
          : `This adds a locked-in cost under ${el('strong', {}, category?.name || 'its category').textContent} and moves it out of your flexible pool.`),
      field('Agreed price', amount),
    ),
    actions: [
      el('button', { class: 'btn btn-secondary', onclick: closeModal }, 'Cancel'),
      el('button', {
        class: 'btn btn-primary',
        onclick: () => {
          const value = Number(amount.value) || 0;
          store.commit(d => {
            const v = d.vendorOptions.find(x => x.id === vendor.id);
            v.status = 'booked';
            // Anything else in this category is no longer in the running.
            d.vendorOptions
              .filter(o => o.categoryId === v.categoryId && o.id !== v.id && o.status !== 'passed')
              .forEach(o => { o.status = 'passed'; });

            let item = d.budgetItems.find(i => i.vendorOptionId === v.id);
            if (!item) {
              item = {
                id: store.newId('bi'), categoryId: v.categoryId, name: v.name,
                notes: '', estimate: value, actual: value, status: 'booked',
                vendorOptionId: v.id, createdAt: new Date().toISOString(),
              };
              d.budgetItems.push(item);
            } else {
              item.actual = value;
              item.status = 'booked';
              item.categoryId = v.categoryId;
            }
          });
          closeModal();
          toast(`${vendor.name} booked — added to your budget`);
          ctx.goToTab('budget');
        },
      }, 'Book & add to budget'),
    ],
  });
}

// ---------- editor ----------
function editVendor(vendor, presetCategoryId = null) {
  const isNew = !vendor;
  const cats = store.sortedCategories();
  if (!cats.length) { toast('Add a category first', 'error'); return; }

  let styleTags = [...(vendor?.styleTags || [])];

  const name = textInput(vendor?.name || '', { placeholder: 'e.g. Wildflower Studio' });
  const category = selectInput(cats.map(c => ({ value: c.id, label: c.name })),
    vendor?.categoryId || presetCategoryId || cats[0].id);
  const url = el('input', { type: 'url', value: vendor?.url || '', placeholder: 'https://' });
  const priceMin = numberInput(vendor?.priceMin ?? '', { step: '100', placeholder: 'low end' });
  const priceMax = numberInput(vendor?.priceMax ?? '', { step: '100', placeholder: 'high end' });
  const status = selectInput(store.VENDOR_STATUSES.map(v => ({ value: v, label: v })), vendor?.status || 'considering');
  const notes = el('textarea', { placeholder: 'What you liked, what gave you pause' }, vendor?.notes || '');
  const rating = selectInput(
    [{ value: '', label: 'No rating' }, ...[1, 2, 3, 4, 5].map(n => ({ value: String(n), label: '★'.repeat(n) }))],
    vendor?.rating ? String(vendor.rating) : '');
  const paletteSel = selectInput(
    [{ value: '', label: 'No palette' }, ...store.state.data.palettes.map(p => ({ value: p.id, label: p.name }))],
    vendor?.paletteId || '');

  const tagBox = el('div', { class: 'chip-row' });
  const vocab = [...store.boardVocabulary().keys()].sort();
  const tagInput = el('input', {
    type: 'text', placeholder: 'Add a style tag…', list: 'vendorTagOptions',
    onkeydown: e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      addStyleTag(tagInput.value);
      tagInput.value = '';
    },
  });

  function addStyleTag(raw) {
    const t = raw.trim().toLowerCase();
    if (!t || styleTags.includes(t)) return;
    styleTags.push(t);
    drawTags();
  }

  function drawTags() {
    const counts = store.boardVocabulary();
    appendAll(clear(tagBox),
      styleTags.map(t => el('span', { class: 'chip active removable' },
        t,
        counts.get(t) ? el('span', { class: 'count' }, counts.get(t)) : null,
        el('button', {
          class: 'chip-x', title: 'Remove',
          onclick: () => { styleTags = styleTags.filter(x => x !== t); drawTags(); },
        }, '✕'),
      )),
      styleTags.length ? null : el('span', { style: { color: 'var(--ink-3)', fontSize: '13px' } }, 'None yet.'),
    );
  }
  drawTags();

  openModal({
    title: isNew ? 'Add vendor option' : 'Edit vendor option',
    body: el('div', { style: { display: 'contents' } },
      field('Name', name),
      el('div', { class: 'field-row' }, field('Category', category), field('Status', status)),
      field('Website', url),
      el('div', { class: 'field-row' }, field('Price from', priceMin), field('Price to', priceMax)),
      el('div', {},
        el('div', { class: 'section-head', style: { marginBottom: '8px' } }, el('h3', {}, 'Style tags')),
        tagBox,
        el('div', { class: 'add-tag-row' },
          tagInput,
          el('datalist', { id: 'vendorTagOptions' }, vocab.map(t => el('option', { value: t }))),
          el('button', { class: 'btn btn-secondary btn-sm', onclick: () => { addStyleTag(tagInput.value); tagInput.value = ''; } }, 'Add'),
        ),
        el('p', { class: 'form-hint' }, 'Words already on your inspiration board show a count — those are the ones that create a match.'),
      ),
      el('div', { class: 'field-row' }, field('Palette', paletteSel), field('Your rating', rating)),
      field('Notes', notes),
    ),
    wide: true,
    actions: [
      !isNew ? el('button', {
        class: 'btn btn-danger',
        onclick: () => confirmDialog('Delete option?', `"${vendor.name}" will be removed. Any linked budget cost stays but is unlinked.`, () => {
          store.commit(d => {
            d.vendorOptions = d.vendorOptions.filter(v => v.id !== vendor.id);
            d.budgetItems.forEach(i => { if (i.vendorOptionId === vendor.id) i.vendorOptionId = null; });
          });
          view.compare.delete(vendor.id);
          toast('Option deleted');
        }),
      }, 'Delete') : null,
      el('span', { class: 'spacer' }),
      el('button', { class: 'btn btn-secondary', onclick: closeModal }, 'Cancel'),
      el('button', {
        class: 'btn btn-primary',
        onclick: () => {
          const value = name.value.trim();
          if (!value) { toast('Give it a name', 'error'); return; }
          const patch = {
            name: value,
            categoryId: category.value,
            url: url.value.trim(),
            priceMin: priceMin.value === '' ? null : Number(priceMin.value),
            priceMax: priceMax.value === '' ? null : Number(priceMax.value),
            styleTags,
            status: status.value,
            notes: notes.value.trim(),
            rating: rating.value ? Number(rating.value) : null,
            paletteId: paletteSel.value || null,
          };
          store.commit(d => {
            if (isNew) d.vendorOptions.push({ id: store.newId('vo'), photoFilenames: [], ...patch });
            else Object.assign(d.vendorOptions.find(v => v.id === vendor.id), patch);
          });
          closeModal();
        },
      }, isNew ? 'Add' : 'Save'),
    ],
  });
}

// ---------- compare ----------
function openCompare(ctx) {
  const chosen = store.state.data.vendorOptions.filter(v => view.compare.has(v.id));
  const tagCounts = store.boardVocabulary();

  const rows = [
    ['Category', v => store.categoryById(v.categoryId)?.name || '—'],
    ['Status', v => statusPill(v.status)],
    ['Price', v => priceLabel(v)],
    ['Your rating', v => (v.rating ? '★'.repeat(v.rating) : '—')],
    ['Style tags', v => el('div', { class: 'chip-row' },
      v.styleTags?.length ? v.styleTags.map(t => chip(t, { count: tagCounts.get(t) || null })) : '—')],
    ['Board overlap', v => {
      const o = styleOverlap(v.styleTags, tagCounts);
      return o.length ? `${o.length} shared tag${o.length === 1 ? '' : 's'}` : 'none';
    }],
    ['Palette', v => {
      const p = v.paletteId ? store.paletteById(v.paletteId) : null;
      return p ? el('div', {}, swatchStrip(p.colors, { class: 'swatch-strip compare-swatch' }), el('span', { class: 'compare-pal' }, p.name)) : '—';
    }],
    ['Notes', v => v.notes || '—'],
  ];

  const table = el('table', { class: 'compare-table' },
    el('thead', {}, el('tr', {}, el('th', {}, ''), chosen.map(v => el('th', {}, v.name)))),
    el('tbody', {}, rows.map(([label, get]) =>
      el('tr', {}, el('th', {}, label), chosen.map(v => el('td', {}, get(v)))))),
  );

  openModal({
    title: 'Compare options',
    body: el('div', { class: 'compare-wrap' }, table),
    wide: true,
    actions: [
      el('button', { class: 'btn btn-ghost', onclick: () => { view.compare.clear(); closeModal(); store.notify(); } }, 'Clear selection'),
      el('span', { class: 'spacer' }),
      el('button', { class: 'btn btn-secondary', onclick: closeModal }, 'Close'),
    ],
  });
}

return { render };
})();
