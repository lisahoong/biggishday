const tabBudget = (() => {

/** Hypothetical category totals, keyed by categoryId. Never written to disk. */
let whatIf = {};
let whatIfOn = false;

function render(root, ctx) {
  const data = store.state.data;
  const summary = budgetSummary(data, whatIfOn ? whatIf : {});

  root.append(
    el('div', { class: 'page-head' },
      el('div', {},
        el('h2', {}, 'Budget'),
        el('p', { class: 'lede' },
          'Only booked costs are locked. Everything else is still moveable — that flexible pool is where trade-offs come from.'),
      ),
      el('div', { class: 'head-actions' },
        el('button', { class: 'btn btn-secondary', onclick: () => editCategory(null) }, 'Add category'),
        el('button', { class: 'btn btn-primary', onclick: () => editItem(null) }, 'Add cost'),
      ),
    ),
    summaryCard(summary, data),
    tradeOffPanel(summary),
    categoryList(summary, ctx),
  );
}

// ---------- summary ----------
function summaryCard(s, data) {
  const guestInput = numberInput(data.settings.guestCount, {
    oninput: e => store.commit(d => { d.settings.guestCount = Number(e.target.value) || 0; }),
  });
  const targetInput = numberInput(data.settings.budgetTarget, {
    step: '1000',
    oninput: e => store.commit(d => { d.settings.budgetTarget = Number(e.target.value) || 0; }),
  });

  const pct = v => (s.target > 0 ? Math.min(100, (v / s.target) * 100) : (s.total > 0 ? (v / s.total) * 100 : 0));

  return el('div', { class: 'card card-pad summary-card' },
    el('div', { class: 'summary-top' },
      el('div', {},
        el('div', { class: 'stat-label' }, 'Projected total'),
        el('div', { class: 'stat-hero num' }, money(s.total)),
        el('div', { class: 'stat-sub' },
          s.target > 0
            ? (s.over
                ? el('span', { class: 'over-text' }, `${money(s.overBy)} over your ${money(s.target)} target`)
                : `${money(s.remaining)} left of ${money(s.target)}`)
            : 'Set a target to track against',
        ),
      ),
      el('div', { class: 'summary-inputs' },
        field('Guests', guestInput),
        field('Total budget', targetInput),
      ),
    ),
    el('div', { class: `meter ${s.over ? 'over' : ''}`, style: { marginTop: '18px' } },
      el('span', { class: 'locked', style: { width: `${pct(s.locked)}%` } }),
      el('span', { class: 'flex', style: { width: `${pct(s.flex)}%` } }),
    ),
    el('div', { class: 'stat-row' },
      statBlock('Locked in', money(s.locked), 'booked — cannot move'),
      statBlock('Still flexible', money(s.flex), 'not booked yet'),
      statBlock('Per guest', s.perGuest != null ? money(s.perGuest) : '—', `${data.settings.guestCount} guests`),
    ),
  );
}

function statBlock(label, value, sub) {
  return el('div', { class: 'stat-block' },
    el('div', { class: 'stat-label' }, label),
    el('div', { class: 'stat-value num' }, value),
    el('div', { class: 'stat-sub' }, sub),
  );
}

// ---------- trade-offs ----------
function tradeOffPanel(s) {
  const section = el('div', { class: 'section' },
    el('div', { class: 'section-head' },
      el('h3', {}, 'Where the give is'),
      el('button', {
        class: `btn btn-sm ${whatIfOn ? 'btn-primary' : 'btn-secondary'}`,
        onclick: () => {
          whatIfOn = !whatIfOn;
          if (!whatIfOn) whatIf = {};
          store.notify();
        },
      }, whatIfOn ? 'Exit what-if' : 'Try a what-if'),
    ),
  );

  if (!s.flexRanking.length) {
    section.append(el('div', { class: 'card card-pad', style: { color: 'var(--ink-3)', fontSize: '13px' } },
      'Nothing flexible yet — add some estimated costs and this will show which categories have room to move.'));
    return section;
  }

  const headline = s.over
    ? `You are ${money(s.overBy)} over. ${money(s.flex)} of your spend is still flexible — these categories have the most room.`
    : s.target > 0
      ? `${money(s.flex)} of your spend is still flexible. If something has to grow, here is where it can come from.`
      : `${money(s.flex)} is still flexible across these categories.`;

  const card = el('div', { class: 'card card-pad tradeoff' },
    el('p', { class: `tradeoff-headline ${s.over ? 'over-text' : ''}` }, headline),
  );

  const rows = el('div', { class: 'tradeoff-rows' });
  for (const r of s.flexRanking.slice(0, 6)) {
    const share = s.flex > 0 ? (r.flex / s.flex) * 100 : 0;
    rows.append(el('div', { class: 'tradeoff-row' },
      el('span', { class: 'tradeoff-name' }, r.category.name),
      el('span', { class: 'tradeoff-bar' }, el('span', { style: { width: `${share}%` } })),
      el('span', { class: 'tradeoff-amt num' }, money(r.flex)),
    ));
  }
  card.append(rows);

  if (whatIfOn) {
    const grid = el('div', { class: 'whatif-grid' });
    for (const r of s.rollups) {
      grid.append(el('label', { class: 'whatif-item' },
        el('span', { class: 'whatif-label' }, r.category.name,
          r.locked > 0 ? el('em', {}, ` ${money(r.locked)} locked`) : null),
        numberInput(Math.round(r.total), {
          step: '500',
          oninput: e => { whatIf[r.categoryId] = Number(e.target.value) || 0; store.notify(); },
        }),
      ));
    }
    card.append(
      el('div', { class: 'whatif' },
        el('p', { class: 'whatif-note' },
          'Change any number to price a hypothetical. Booked spend stays put, and nothing here is saved.'),
        grid,
        el('button', { class: 'btn btn-secondary btn-sm', onclick: () => { whatIf = {}; store.notify(); } }, 'Reset'),
      ),
    );
  }

  section.append(card);
  return section;
}

// ---------- categories & line items ----------
function categoryList(s, ctx) {
  const section = el('div', { class: 'section' },
    el('div', { class: 'section-head' }, el('h3', {}, 'By category')),
  );

  const withContent = s.rollups.filter(r => r.items.length);
  const emptyOnes = s.rollups.filter(r => !r.items.length);

  if (!withContent.length) {
    section.append(emptyState('No costs tracked yet',
      'Add your first cost to start seeing where the budget sits.',
      el('button', { class: 'btn btn-primary', onclick: () => editItem(null) }, 'Add cost')));
    return section;
  }

  for (const r of withContent) section.append(categoryCard(r, ctx));

  if (emptyOnes.length) {
    section.append(el('div', { class: 'untouched' },
      el('span', {}, 'Nothing tracked yet in:'),
      el('div', { class: 'chip-row' }, emptyOnes.map(r =>
        el('button', { class: 'chip', onclick: () => editItem(null, r.categoryId) }, `+ ${r.category.name}`))),
    ));
  }
  return section;
}

function categoryCard(r, ctx) {
  const over = r.target > 0 && r.total > r.target;
  const head = el('div', { class: 'cat-head' },
    el('div', { class: 'cat-title' },
      el('strong', {}, r.category.name),
      el('button', { class: 'btn btn-ghost btn-sm', onclick: () => editCategory(r.category) }, 'Edit'),
    ),
    el('div', { class: 'cat-numbers' },
      el('span', { class: 'num cat-total' }, money(r.total)),
      r.target > 0
        ? el('span', { class: `cat-target num ${over ? 'over-text' : ''}` },
            over ? `${money(r.total - r.target)} over ${money(r.target)}` : `of ${money(r.target)}`)
        : el('button', { class: 'btn btn-ghost btn-sm', onclick: () => editCategory(r.category) }, 'set target'),
    ),
  );

  const rows = el('div', { class: 'item-rows' });
  for (const item of r.items) {
    const vendor = item.vendorOptionId
      ? store.state.data.vendorOptions.find(v => v.id === item.vendorOptionId)
      : null;
    rows.append(el('div', { class: 'item-row', onclick: () => editItem(item) },
      el('div', { class: 'item-main' },
        el('span', { class: 'item-name' }, item.name),
        vendor ? el('button', {
          class: 'item-link',
          title: 'Linked vendor — open Vendors',
          onclick: e => { e.stopPropagation(); ctx.goToTab('vendors'); },
        }, `◆ ${vendor.name}`) : null,
        item.notes ? el('span', { class: 'item-notes' }, item.notes) : null,
      ),
      statusPill(item.status),
      el('span', { class: 'item-amt num' }, money(itemAmount(item))),
    ));
  }

  return el('div', { class: 'card cat-card' }, head, rows,
    el('button', { class: 'add-item-row', onclick: () => editItem(null, r.categoryId) }, '+ Add cost'),
  );
}

// ---------- editors ----------
function editItem(item, presetCategoryId = null) {
  const isNew = !item;
  const cats = store.sortedCategories();
  if (!cats.length) { toast('Add a category first', 'error'); return; }

  const name = textInput(item?.name || '', { placeholder: 'e.g. Ceremony florals' });
  const category = selectInput(
    cats.map(c => ({ value: c.id, label: c.name })),
    item?.categoryId || presetCategoryId || cats[0].id,
  );
  const estimate = numberInput(item?.estimate ?? '', { step: '100', placeholder: '0' });
  const actual = numberInput(item?.actual ?? '', { step: '100', placeholder: 'once agreed' });
  const status = selectInput(
    store.BUDGET_STATUSES.map(v => ({ value: v, label: STATUS_LABEL[v] })),
    item?.status || 'estimated',
  );
  const notes = el('textarea', { placeholder: 'Anything worth remembering' }, item?.notes || '');

  openModal({
    title: isNew ? 'Add cost' : 'Edit cost',
    body: el('div', { style: { display: 'contents' } },
      field('What is it', name),
      el('div', { class: 'field-row' }, field('Category', category), field('Status', status)),
      el('div', { class: 'field-row' }, field('Estimate', estimate), field('Agreed price', actual)),
      el('p', { class: 'form-hint' },
        'Only ', el('strong', {}, 'Booked'), ' counts as locked. Anything else stays in the flexible pool you can trade against.'),
      field('Notes', notes),
    ),
    actions: [
      !isNew ? el('button', {
        class: 'btn btn-danger',
        onclick: () => confirmDialog('Delete cost?', `"${item.name}" will be removed from the budget.`, () => {
          store.commit(d => { d.budgetItems = d.budgetItems.filter(i => i.id !== item.id); });
          toast('Cost deleted');
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
            estimate: Number(estimate.value) || 0,
            actual: actual.value === '' ? null : Number(actual.value),
            status: status.value,
            notes: notes.value.trim(),
          };
          store.commit(d => {
            if (isNew) d.budgetItems.push({ id: store.newId('bi'), vendorOptionId: null, createdAt: new Date().toISOString(), ...patch });
            else Object.assign(d.budgetItems.find(i => i.id === item.id), patch);
          });
          closeModal();
        },
      }, isNew ? 'Add' : 'Save'),
    ],
  });
}

const STATUS_LABEL = {
  idea: 'Idea — rough guess',
  estimated: 'Estimated',
  quoted: 'Quoted',
  booked: 'Booked — locked in',
};

function editCategory(category) {
  const isNew = !category;
  const name = textInput(category?.name || '', { placeholder: 'e.g. Hair & Makeup' });
  const target = numberInput(category?.budgetTarget ?? '', { step: '500', placeholder: 'optional' });

  const inUse = category
    ? store.state.data.budgetItems.filter(i => i.categoryId === category.id).length +
      store.state.data.vendorOptions.filter(v => v.categoryId === category.id).length
    : 0;

  openModal({
    title: isNew ? 'Add category' : 'Edit category',
    body: el('div', { style: { display: 'contents' } },
      field('Name', name),
      field('Target for this category', target),
      el('p', { class: 'form-hint' }, 'Categories are shared with the Vendors tab, so anything you add here shows up there too.'),
    ),
    actions: [
      !isNew ? el('button', {
        class: 'btn btn-danger',
        onclick: () => {
          if (inUse) { toast(`Still used by ${inUse} item${inUse === 1 ? '' : 's'}`, 'error'); return; }
          confirmDialog('Delete category?', `"${category.name}" will be removed.`, () => {
            store.commit(d => { d.categories = d.categories.filter(c => c.id !== category.id); });
            toast('Category deleted');
          });
        },
      }, 'Delete') : null,
      el('span', { class: 'spacer' }),
      el('button', { class: 'btn btn-secondary', onclick: closeModal }, 'Cancel'),
      el('button', {
        class: 'btn btn-primary',
        onclick: () => {
          const value = name.value.trim();
          if (!value) { toast('Give it a name', 'error'); return; }
          store.commit(d => {
            if (isNew) {
              d.categories.push({
                id: store.newId('cat'), name: value,
                sortOrder: Math.max(0, ...d.categories.map(c => c.sortOrder)) + 1,
                budgetTarget: Number(target.value) || 0,
              });
            } else {
              const c = d.categories.find(x => x.id === category.id);
              c.name = value;
              c.budgetTarget = Number(target.value) || 0;
            }
          });
          closeModal();
        },
      }, isNew ? 'Add' : 'Save'),
    ],
  });
}

return { render };
})();
