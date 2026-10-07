const tabOverview = (() => {

function render(root, ctx) {
  const data = store.state.data;
  const s = budgetSummary(data);
  const progress = vendorProgress(data);
  const gaps = emptyCategories(data);

  root.append(
    el('div', { class: 'page-head' },
      el('div', {},
        el('h2', {}, 'Overview'),
        el('p', { class: 'lede' }, headline(s, progress)),
      ),
      el('div', { class: 'head-actions' },
        el('label', { class: 'field date-field' },
          el('span', {}, 'Wedding date'),
          el('input', {
            type: 'date', value: data.settings.weddingDate || '',
            oninput: e => store.commit(d => { d.settings.weddingDate = e.target.value || null; }),
          }),
        ),
      ),
    ),
  );

  root.append(el('div', { class: 'overview-stats' },
    tile('Projected total', money(s.total),
      s.target > 0
        ? (s.over ? `${money(s.overBy)} over target` : `${money(s.remaining)} to spare`)
        : 'no target set',
      s.over ? 'bad' : null, () => ctx.goToTab('budget')),
    tile('Locked in', money(s.locked),
      `${countBooked(progress)} vendor${countBooked(progress) === 1 ? '' : 's'} booked`,
      null, () => ctx.goToTab('budget')),
    tile('Still flexible', money(s.flex), 'can be traded', null, () => ctx.goToTab('budget')),
    tile('Days to go', daysToGo(data.settings.weddingDate), data.settings.weddingDate || 'set a date', null, null),
  ));

  root.append(decisionSection(progress, gaps, ctx));
  root.append(styleSection(data, ctx));
}

function headline(s, progress) {
  const booked = countBooked(progress);
  const open = progress.filter(p => p.total > 0 && !p.isBooked).length;
  const bits = [];
  if (s.over) bits.push(`You are ${money(s.overBy)} over target, with ${money(s.flex)} still moveable.`);
  else if (s.target > 0) bits.push(`${money(s.remaining)} left of your ${money(s.target)} target.`);
  else bits.push('Set a budget target to start tracking against it.');
  if (booked) bits.push(`${booked} categor${booked === 1 ? 'y is' : 'ies are'} settled`);
  if (open) bits.push(`${open} still being decided.`);
  return bits.join(' ');
}

const countBooked = progress => progress.filter(p => p.isBooked).length;

function daysToGo(date) {
  if (!date) return '—';
  const days = Math.ceil((new Date(date) - new Date()) / 86400000);
  if (days < 0) return 'past';
  return String(days);
}

function tile(label, value, sub, tone, onclick) {
  return el(onclick ? 'button' : 'div', {
    class: `tile${onclick ? ' clickable' : ''}`,
    onclick: onclick || undefined,
  },
    el('div', { class: 'stat-label' }, label),
    el('div', { class: `tile-value num ${tone === 'bad' ? 'over-text' : ''}` }, value),
    el('div', { class: 'stat-sub' }, sub),
  );
}

// ---------- decisions ----------
function decisionSection(progress, gaps, ctx) {
  const section = el('div', { class: 'section' },
    el('div', { class: 'section-head' },
      el('h3', {}, 'Decision progress'),
      el('button', { class: 'btn btn-ghost btn-sm', onclick: () => ctx.goToTab('vendors') }, 'Open vendors →'),
    ),
  );

  const active = progress.filter(p => p.total > 0);
  if (!active.length) {
    section.append(emptyState('No options tracked yet',
      'Add a few vendor options and this becomes a map of what is settled and what is still open.',
      el('button', { class: 'btn btn-primary', onclick: () => ctx.goToTab('vendors') }, 'Add options')));
    return section;
  }

  section.append(el('div', { class: 'decision-grid' }, active.map(p =>
    el('button', { class: 'decision-row', onclick: () => ctx.goToTab('vendors') },
      el('span', { class: `decision-dot ${p.isBooked ? 'done' : p.shortlisted ? 'near' : ''}` }),
      el('span', { class: 'decision-name' }, p.category.name),
      el('span', { class: 'decision-state' },
        p.isBooked ? 'booked'
          : p.shortlisted ? `${p.shortlisted} shortlisted`
          : `${p.considering} being considered`),
    ),
  )));

  if (gaps.length) {
    section.append(el('div', { class: 'gap-note' },
      el('strong', {}, 'Nothing considered yet: '),
      el('div', { class: 'chip-row', style: { marginTop: '8px' } },
        gaps.map(c => chip(c.name, { onclick: () => ctx.goToTab('vendors') }))),
      el('p', {}, 'Not necessarily a problem — your planner may already have these covered. Worth a look if you want a say.'),
    ));
  }
  return section;
}

// ---------- style ----------
function styleSection(data, ctx) {
  const section = el('div', { class: 'section' },
    el('div', { class: 'section-head' },
      el('h3', {}, 'Direction'),
      el('button', { class: 'btn btn-ghost btn-sm', onclick: () => ctx.goToTab('inspiration') }, 'Open inspiration →'),
    ),
  );

  const { collections, palettes } = data;
  if (!collections.length && !palettes.length) {
    section.append(emptyState('No boards or palettes yet',
      'Group a few photos into a board and pull some colours out of them.',
      el('button', { class: 'btn btn-primary', onclick: () => ctx.goToTab('inspiration') }, 'Start a board')));
    return section;
  }

  const row = el('div', { class: 'direction-grid' });
  for (const b of collections) {
    const palette = b.paletteId ? store.paletteById(b.paletteId) : null;
    const cover = b.coverPhoto || b.photoFilenames[0];
    const photo = cover ? store.photoByName(cover) : null;
    row.append(el('button', { class: 'direction-card', onclick: () => ctx.goToTab('inspiration') },
      el('div', { class: 'direction-thumb' }, photo ? el('img', { src: photo.url, alt: '', loading: 'lazy' }) : null),
      el('div', { class: 'direction-meta' },
        el('strong', {}, b.name),
        el('span', {}, `${b.photoFilenames.length} photos`),
        palette ? swatchStrip(palette.colors, { class: 'swatch-strip board-swatch' }) : null,
      ),
    ));
  }
  for (const p of palettes) {
    row.append(el('button', { class: 'direction-card', onclick: () => ctx.goToTab('palettes') },
      el('div', { class: 'direction-thumb' }, swatchStrip(p.colors, { class: 'swatch-strip', style: { borderRadius: '0' } })),
      el('div', { class: 'direction-meta' },
        el('strong', {}, p.name),
        el('span', {}, `${p.colors.length} colours`),
      ),
    ));
  }
  section.append(row);
  return section;
}

return { render };
})();
