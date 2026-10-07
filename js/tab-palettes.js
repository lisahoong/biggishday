const tabPalettes = (() => {

const MAX_COLORS = 8;
const SEED = ['#c2624a', '#e8dcc8', '#5d6b52', '#2f2a26'];

function render(root, ctx) {
  const palettes = store.state.data.palettes;

  root.append(
    el('div', { class: 'page-head' },
      el('div', {},
        el('h2', {}, 'Palettes'),
        el('p', { class: 'lede' },
          'Build colour combinations and attach them to boards and vendors, so you can tell at a glance whether a direction still fits.'),
      ),
      el('div', { class: 'head-actions' },
        el('button', { class: 'btn btn-primary', onclick: () => editPalette(null) }, 'New palette'),
      ),
    ),
  );

  if (!palettes.length) {
    root.append(emptyState(
      'No palettes yet',
      'Start from a photo you love and pull three or four colours out of it.',
      el('button', { class: 'btn btn-primary', onclick: () => editPalette(null) }, 'Build a palette'),
    ));
    return;
  }

  root.append(el('div', { class: 'palette-grid' }, palettes.map(p => paletteCard(p, ctx))));
}

function paletteCard(palette, ctx) {
  const boards = store.state.data.collections.filter(c => c.paletteId === palette.id);
  const vendors = store.state.data.vendorOptions.filter(v => v.paletteId === palette.id);

  return el('div', { class: 'palette-card' },
    el('button', {
      class: 'palette-swatches',
      onclick: () => editPalette(palette),
      title: 'Edit palette',
    }, palette.colors.map(c => el('span', { style: { background: c } },
        el('code', { class: 'hex' }, c.toUpperCase())))),
    el('div', { class: 'palette-meta' },
      el('div', { class: 'palette-title' },
        el('strong', {}, palette.name),
        el('button', { class: 'btn btn-ghost btn-sm', onclick: () => editPalette(palette) }, 'Edit'),
      ),
      palette.notes ? el('p', { class: 'palette-notes' }, palette.notes) : null,
      el('div', { class: 'chip-row', style: { marginTop: '8px' } },
        boards.map(b => chip(`▦ ${b.name}`, { onclick: () => ctx.goToTab('inspiration') })),
        vendors.map(v => chip(`◆ ${v.name}`, { onclick: () => ctx.goToTab('vendors') })),
        (!boards.length && !vendors.length)
          ? el('span', { style: { color: 'var(--ink-3)', fontSize: '12.5px' } }, 'Not linked to anything yet')
          : null,
      ),
    ),
  );
}

// ---------- editor ----------
function editPalette(palette) {
  const isNew = !palette;
  let colors = [...(palette?.colors || SEED)];

  const name = textInput(palette?.name || '', { placeholder: 'e.g. Dusk garden' });
  const notes = el('textarea', { placeholder: 'Where does this belong? What is it for?' }, palette?.notes || '');
  const preview = el('div', { class: 'editor-preview' });
  const swatchList = el('div', { class: 'editor-swatches' });
  const tuner = el('div', { class: 'tuner' });

  // Which swatch the inline tuner is editing. Nothing selected = tuner hidden.
  let selected = null;

  /** Repaint the strip and the swatch chips without rebuilding the tuner —
   *  rebuilding mid-drag would kill the slider the user is holding. */
  const paint = () => {
    clear(preview).append(swatchStrip(colors));
    [...swatchList.querySelectorAll('.editor-swatch')].forEach((row, i) => {
      const dot = row.querySelector('.swatch-dot');
      if (dot && colors[i]) dot.style.background = colors[i];
      row.classList.toggle('selected', i === selected);
      const hex = row.querySelector('.hex-input');
      if (hex && document.activeElement !== hex) hex.value = (colors[i] || '').toUpperCase();
    });
  };

  const drawTuner = () => {
    clear(tuner);
    if (selected == null || !colors[selected]) { tuner.hidden = true; return; }
    tuner.hidden = false;

    const [h, s, l] = hexToHsl(colors[selected]);
    const apply = () => {
      colors[selected] = hslToHex(Number(hSl.value), Number(sSl.value), Number(lSl.value));
      readout.textContent = colors[selected].toUpperCase();
      readout.style.background = colors[selected];
      readout.style.color = Number(lSl.value) > 55 ? '#1a1917' : '#fff';
      hueTrack();
      paint();
    };

    const mk = (min, max, val) => el('input', { type: 'range', min, max, value: val, oninput: apply });
    const hSl = mk(0, 360, Math.round(h));
    const sSl = mk(0, 100, Math.round(s));
    const lSl = mk(0, 100, Math.round(l));

    // Saturation/lightness tracks are tinted to the current hue so they show real outcomes.
    const hueTrack = () => {
      const hv = Number(hSl.value);
      sSl.style.background = `linear-gradient(90deg, hsl(${hv} 0% ${lSl.value}%), hsl(${hv} 100% ${lSl.value}%))`;
      lSl.style.background = `linear-gradient(90deg, #000, hsl(${hv} ${sSl.value}% 50%), #fff)`;
    };

    const readout = el('div', { class: 'tuner-readout' }, colors[selected].toUpperCase());
    readout.style.background = colors[selected];
    readout.style.color = l > 55 ? '#1a1917' : '#fff';
    hueTrack();

    appendAll(tuner,
      el('div', { class: 'tuner-head' },
        el('span', {}, `Swatch ${selected + 1}`),
        readout,
        el('button', { class: 'btn btn-ghost btn-sm', onclick: () => { selected = null; drawTuner(); paint(); } }, 'Done'),
      ),
      el('label', { class: 'tuner-row' }, el('span', {}, 'Hue'), hSl),
      el('label', { class: 'tuner-row' }, el('span', {}, 'Saturation'), sSl),
      el('label', { class: 'tuner-row' }, el('span', {}, 'Lightness'), lSl),
      el('div', { class: 'tuner-shades' },
        [-24, -12, 12, 24].map(d => {
          const shade = hslToHex(h, s, Math.max(4, Math.min(96, l + d)));
          return el('button', {
            class: 'shade', style: { background: shade }, title: `${shade.toUpperCase()} — use this shade`,
            onclick: () => { colors[selected] = shade; drawTuner(); paint(); },
          });
        }),
      ),
    );
  };

  const select = i => { selected = i; drawTuner(); paint(); };

  const draw = () => {
    appendAll(clear(swatchList),
      colors.map((c, i) => el('div', { class: `editor-swatch${i === selected ? ' selected' : ''}` },
        el('button', {
          class: 'swatch-dot', style: { background: c },
          title: 'Adjust this colour',
          onclick: () => select(i),
        }),
        el('input', {
          type: 'text', class: 'hex-input', value: c.toUpperCase(),
          onfocus: () => select(i),
          oninput: e => {
            const v = normalizeHex(e.target.value);
            if (v) { colors[i] = v; if (i === selected) drawTuner(); paint(); }
          },
        }),
        el('button', {
          class: 'btn btn-ghost btn-sm', title: 'Remove',
          onclick: () => {
            colors.splice(i, 1);
            if (selected === i) selected = null;
            else if (selected > i) selected--;
            draw(); drawTuner();
          },
        }, '✕'),
      )),
      colors.length < MAX_COLORS
        ? el('button', {
            class: 'btn btn-secondary btn-sm add-swatch',
            onclick: () => { colors.push(randomNeighbour(colors)); draw(); select(colors.length - 1); },
          }, '+ Add colour')
        : null,
    );
    paint();
  };
  draw();
  drawTuner();

  openModal({
    title: isNew ? 'New palette' : 'Edit palette',
    body: el('div', { style: { display: 'contents' } },
      preview,
      swatchList,
      tuner,
      field('Name', name),
      field('Notes', notes),
      // A lifted colour becomes the selected swatch, so it can be tuned immediately.
      pickFromPhoto(hex => { colors.push(hex); draw(); select(colors.length - 1); }),
    ),
    actions: [
      !isNew ? el('button', {
        class: 'btn btn-danger',
        onclick: () => confirmDialog('Delete palette?', `"${palette.name}" will be removed and unlinked from any boards or vendors using it.`, () => {
          store.commit(d => {
            d.palettes = d.palettes.filter(p => p.id !== palette.id);
            d.collections.forEach(c => { if (c.paletteId === palette.id) c.paletteId = null; });
            d.vendorOptions.forEach(v => { if (v.paletteId === palette.id) v.paletteId = null; });
          });
          toast('Palette deleted');
        }),
      }, 'Delete') : null,
      el('span', { class: 'spacer' }),
      el('button', { class: 'btn btn-secondary', onclick: closeModal }, 'Cancel'),
      el('button', {
        class: 'btn btn-primary',
        onclick: () => {
          const value = name.value.trim();
          if (!value) { toast('Give the palette a name', 'error'); return; }
          if (!colors.length) { toast('Add at least one colour', 'error'); return; }
          store.commit(d => {
            if (isNew) {
              d.palettes.push({ id: store.newId('pal'), name: value, colors, notes: notes.value.trim() });
            } else {
              const p = d.palettes.find(x => x.id === palette.id);
              p.name = value; p.colors = colors; p.notes = notes.value.trim();
            }
          });
          closeModal();
        },
      }, isNew ? 'Create' : 'Save'),
    ],
  });
}

const TAG_CHIP_LIMIT = 14;

/** Sample a colour straight off one of the inspiration photos.
 *  Searchable/filterable, because scrolling 126 thumbnails to find one is hopeless. */
function pickFromPhoto(onPick) {
  const all = store.state.photos;
  if (!all.length) return null;

  const pick = { query: '', tags: new Set(), boardId: '' };

  const wrap = el('div', { class: 'section', style: { margin: '0' } },
    el('div', { class: 'section-head' }, el('h3', {}, 'Pick from a photo')),
  );

  const controls = el('div', { class: 'pick-controls' });
  const tagRow = el('div', { class: 'chip-row pick-tags' });
  const grid = el('div', { class: 'pick-grid' });
  const countLine = el('div', { class: 'pick-count' });
  const stage = el('div', { class: 'pick-stage', hidden: true });

  const boards = store.state.data.collections;
  const search = el('input', {
    type: 'text', placeholder: 'Search tags or filename…',
    oninput: e => { pick.query = e.target.value; drawResults(); },
  });
  const boardSel = selectInput(
    [{ value: '', label: 'All photos' }, ...boards.map(b => ({ value: b.id, label: b.name }))],
    '', { onchange: e => { pick.boardId = e.target.value; drawResults(); } },
  );
  appendAll(controls, search, boards.length ? boardSel : null);

  function matches() {
    const q = pick.query.trim().toLowerCase();
    const board = pick.boardId ? boards.find(b => b.id === pick.boardId) : null;
    return all.filter(p => {
      if (board && !board.photoFilenames.includes(p.filename)) return false;
      for (const t of pick.tags) {
        if (!p.tags.includes(t) && !p.suggestedTags.includes(t)) return false;
      }
      if (q) {
        const hay = [p.filename, ...p.tags, ...p.suggestedTags].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  /** Tag chips reflect what's actually in the current result set, so you can keep narrowing. */
  function drawTags(results) {
    const counts = new Map();
    for (const p of results) {
      for (const t of new Set([...p.tags, ...p.suggestedTags])) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    const ranked = [...counts.entries()]
      .filter(([t]) => !pick.tags.has(t))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, TAG_CHIP_LIMIT);

    appendAll(clear(tagRow),
      [...pick.tags].map(t => chip(t, {
        active: true,
        onclick: () => { pick.tags.delete(t); drawResults(); },
      })),
      ranked.map(([t, n]) => chip(t, {
        count: n,
        onclick: () => { pick.tags.add(t); drawResults(); },
      })),
    );
  }

  function drawResults() {
    const results = matches();
    drawTags(results);

    const showing = results.slice(0, 60);
    clear(countLine).append(
      results.length === all.length
        ? `${all.length} photos`
        : `${results.length} of ${all.length} photos`,
      showing.length < results.length ? ` — showing first ${showing.length}` : '',
    );

    appendAll(clear(grid),
      showing.length
        ? showing.map(p => el('button', {
            class: 'pick-thumb', title: [...p.tags, ...p.suggestedTags].join(', '),
            onclick: () => showPicker(p),
          }, el('img', { src: p.url, alt: '', loading: 'lazy' })))
        : el('span', { class: 'pick-none' }, 'No photos match — try clearing a filter.'),
    );
  }

  function showPicker(photo) {
    clear(stage);
    stage.hidden = false;
    const canvas = el('canvas', { class: 'pick-canvas' });
    const readout = el('div', { class: 'pick-readout' }, 'Click anywhere on the image to lift a colour');
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 520 / img.naturalWidth);
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = photo.url;

    canvas.addEventListener('click', e => {
      const r = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) * (canvas.width / r.width));
      const y = Math.floor((e.clientY - r.top) * (canvas.height / r.height));
      const [rr, gg, bb] = canvas.getContext('2d').getImageData(x, y, 1, 1).data;
      const hex = '#' + [rr, gg, bb].map(v => v.toString(16).padStart(2, '0')).join('');
      onPick(hex);
      appendAll(clear(readout),
        el('span', { class: 'pick-added' },
          el('span', { class: 'pick-dot', style: { background: hex } }),
          `Added ${hex.toUpperCase()}`),
        ' — keep clicking to add more.',
      );
    });

    appendAll(stage,
      el('button', {
        class: 'btn btn-ghost btn-sm pick-back',
        onclick: () => { stage.hidden = true; },
      }, '← Back to photos'),
      canvas, readout,
    );
    stage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  drawResults();
  appendAll(wrap, controls, tagRow, countLine, grid, stage);
  return wrap;
}

/** hex -> [h 0-360, s 0-100, l 0-100] */
function hexToHsl(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  const d = max - min;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

/** [h 0-360, s 0-100, l 0-100] -> hex */
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = [[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]][Math.floor(h / 60) % 6];
  return '#' + seg.map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

function normalizeHex(v) {
  const s = String(v).trim().replace(/^#?/, '');
  if (/^[0-9a-fA-F]{6}$/.test(s)) return '#' + s.toLowerCase();
  if (/^[0-9a-fA-F]{3}$/.test(s)) return '#' + s.split('').map(c => c + c).join('').toLowerCase();
  return null;
}

/** A new swatch that relates to what's already there, rather than a random jump. */
function randomNeighbour(colors) {
  if (!colors.length) return '#c2624a';
  const base = colors[colors.length - 1];
  const n = parseInt(base.slice(1), 16);
  const shift = v => Math.max(0, Math.min(255, v + Math.round((Math.random() - 0.5) * 90)));
  const r = shift((n >> 16) & 255), g = shift((n >> 8) & 255), b = shift(n & 255);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

return { render };
})();
