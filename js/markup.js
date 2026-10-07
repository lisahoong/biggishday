import * as api from './api.js?v=2';
import { state, listFor } from './state.js?v=2';
import { h, icon, toast, errorMessage } from './ui.js?v=2';

const SVG_NS = 'http://www.w3.org/2000/svg';
const COLORS = ['#e11d48', '#f59e0b', '#16a34a', '#2563eb', '#ffffff'];
const TOOLS = [['pen', 'Pen'], ['arrow', 'Arrow'], ['circle', 'Circle']];
// Stroke width as a fraction of the image's shorter side, so marks scale with the photo.
const STROKE = 0.006;
const SHOW_KEY = 'board.showMarkings';
const PREFS_KEY = 'board.drawPrefs';

function s(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function isValid(shape) {
  if (shape.type === 'pen') return shape.points.length >= 2;
  return shape.points.length === 2 && dist(shape.points[0], shape.points[1]) > 0.01;
}

export class Markup {
  constructor({ stage, img, toolbar }) {
    this.stage = stage;
    this.img = img;
    this.toolbar = toolbar;
    this.photoId = null;
    this.draft = null;
    this.drawing = false;
    this.visible = localStorage.getItem(SHOW_KEY) !== '0';
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    this.tool = prefs.tool || 'pen';
    this.color = prefs.color || COLORS[0];

    this.svg = s('svg', { class: 'markup' });
    stage.append(this.svg);
    this.svg.addEventListener('pointerdown', (e) => this.pointerDown(e));
    this.svg.addEventListener('pointermove', (e) => this.pointerMove(e));
    this.svg.addEventListener('pointerup', (e) => this.pointerUp(e));
    this.svg.addEventListener('pointercancel', () => { this.draft = null; this.render(); });
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(img);
  }

  get markings() {
    return listFor(state.markings, this.photoId);
  }

  setPhoto(photoId) {
    this.photoId = photoId;
    this.draft = null;
    this.refresh();
  }

  refresh() {
    this.renderToolbar();
    this.render();
  }

  destroy() {
    this.resizeObserver.disconnect();
  }

  // Returns true if the key was handled.
  handleKey(e) {
    if (!this.drawing) return false;
    if (e.key === 'Escape') { this.setDrawing(false); return true; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { this.undo(); return true; }
    return false;
  }

  setVisible(visible) {
    this.visible = visible;
    localStorage.setItem(SHOW_KEY, visible ? '1' : '0');
    if (!visible) this.drawing = false;
    this.refresh();
  }

  setDrawing(drawing) {
    this.drawing = drawing;
    if (drawing && !this.visible) this.setVisible(true);
    this.refresh();
  }

  savePrefs() {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ tool: this.tool, color: this.color }));
  }

  renderToolbar() {
    const count = this.markings.length;
    const mine = this.markings.filter((m) => m.author_name === state.me.name && !m.pending);
    const bar = this.toolbar;
    bar.replaceChildren();

    bar.append(
      h('button', {
        class: `btn btn-ghost ${this.visible ? '' : 'is-off'}`,
        'aria-pressed': String(this.visible),
        title: this.visible ? 'Hide markings' : 'Show markings',
        onClick: () => this.setVisible(!this.visible),
      }, icon(this.visible ? 'eye' : 'eyeOff'), this.visible ? 'Markings shown' : 'Markings hidden',
      count ? h('span', { class: 'pill' }, count) : null),
      h('button', {
        class: `btn ${this.drawing ? 'btn-primary' : 'btn-ghost'}`,
        'aria-pressed': String(this.drawing),
        onClick: () => this.setDrawing(!this.drawing),
      }, icon('pen'), this.drawing ? 'Done drawing' : 'Draw'),
    );

    if (!this.drawing) return;

    const tools = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Drawing tool' },
      TOOLS.map(([id, label]) => h('button', {
        class: this.tool === id ? 'is-active' : '',
        'aria-pressed': String(this.tool === id),
        title: label,
        onClick: () => { this.tool = id; this.savePrefs(); this.renderToolbar(); },
      }, icon(id), label)));

    const swatches = h('div', { class: 'swatches', role: 'group', 'aria-label': 'Color' },
      COLORS.map((c) => h('button', {
        class: `swatch ${this.color === c ? 'is-active' : ''}`,
        style: `--c:${c}`,
        'aria-label': `Color ${c}`,
        'aria-pressed': String(this.color === c),
        onClick: () => { this.color = c; this.savePrefs(); this.renderToolbar(); },
      })));

    bar.append(tools, swatches,
      h('button', { class: 'btn btn-ghost', disabled: !mine.length, title: 'Undo my last mark (Ctrl/Cmd+Z)', onClick: () => this.undo() },
        icon('undo'), 'Undo'),
      h('button', { class: 'btn btn-ghost', disabled: !mine.length, onClick: () => this.clearMine() }, 'Clear my marks'),
    );
  }

  size() {
    return { w: this.img.clientWidth, h: this.img.clientHeight };
  }

  render() {
    const { w, h: ht } = this.size();
    const svg = this.svg;
    svg.setAttribute('viewBox', `0 0 ${w || 1} ${ht || 1}`);
    svg.classList.toggle('is-hidden', !this.visible);
    svg.classList.toggle('is-drawing', this.drawing);
    svg.replaceChildren();
    if (!w || !ht || !this.photoId) return;
    const shapes = this.markings.map((m) => ({ shape: m.shape, title: `Drawn by ${m.author_name}` }));
    if (this.draft && (this.draft.type === 'pen' || this.draft.points.length === 2)) shapes.push({ shape: this.draft });
    for (const { shape, title } of shapes) svg.append(this.shapeToSvg(shape, w, ht, title));
  }

  shapeToSvg(shape, w, ht, title) {
    const px = shape.points.map(([x, y]) => [x * w, y * ht]);
    const sw = Math.max(2, (shape.width || STROKE) * Math.min(w, ht));
    let d;
    if (shape.type === 'pen') {
      d = px.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    } else if (shape.type === 'arrow') {
      const [[x0, y0], [x1, y1]] = px;
      const angle = Math.atan2(y1 - y0, x1 - x0);
      const head = Math.max(10, sw * 4);
      const hx = (a) => x1 - head * Math.cos(angle + a);
      const hy = (a) => y1 - head * Math.sin(angle + a);
      d = `M${x0} ${y0} L${x1} ${y1} M${hx(0.45)} ${hy(0.45)} L${x1} ${y1} L${hx(-0.45)} ${hy(-0.45)}`;
    } else {
      const [[x0, y0], [x1, y1]] = px;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
      d = `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
    }
    const g = s('g');
    if (title) g.append(Object.assign(s('title'), { textContent: title }));
    // Dark halo underneath keeps light colors readable on light photos.
    g.append(s('path', { d, class: 'halo', 'stroke-width': sw + 3 }));
    g.append(s('path', { d, stroke: shape.color, 'stroke-width': sw }));
    return g;
  }

  point(e) {
    const r = this.img.getBoundingClientRect();
    const clamp = (v) => Math.min(1, Math.max(0, v));
    const round = (v) => Math.round(v * 10000) / 10000;
    return [round(clamp((e.clientX - r.left) / r.width)), round(clamp((e.clientY - r.top) / r.height))];
  }

  pointerDown(e) {
    if (!this.drawing || e.button > 0) return;
    e.preventDefault();
    this.svg.setPointerCapture(e.pointerId);
    this.draft = { type: this.tool, color: this.color, width: STROKE, points: [this.point(e)] };
    this.render();
  }

  pointerMove(e) {
    if (!this.draft) return;
    const p = this.point(e);
    const pts = this.draft.points;
    if (this.draft.type === 'pen') {
      if (dist(pts[pts.length - 1], p) > 0.003) pts.push(p);
    } else {
      pts[1] = p;
    }
    this.render();
  }

  pointerUp() {
    const shape = this.draft;
    this.draft = null;
    if (shape && isValid(shape)) this.save(shape);
    else this.render();
  }

  async save(shape) {
    const photoId = this.photoId;
    const list = listFor(state.markings, photoId);
    const temp = { id: `tmp-${crypto.randomUUID()}`, photo_id: photoId, author_name: state.me.name, shape, pending: true };
    list.push(temp);
    state.version++;
    this.refresh();
    try {
      const row = await api.addMarking(photoId, shape, state.me.name);
      list.splice(list.indexOf(temp), 1, row);
    } catch (err) {
      list.splice(list.indexOf(temp), 1);
      toast(`Couldn't save that mark: ${errorMessage(err)}`, { kind: 'error' });
    }
    if (this.photoId === photoId) this.refresh();
  }

  async remove(marks) {
    if (!marks.length) return;
    const photoId = this.photoId;
    const list = listFor(state.markings, photoId);
    const ids = new Set(marks.map((m) => m.id));
    state.markings.set(photoId, list.filter((m) => !ids.has(m.id)));
    state.version++;
    this.refresh();
    try {
      await api.deleteMarkings([...ids]);
    } catch (err) {
      state.markings.set(photoId, list);
      toast(`Couldn't remove markings: ${errorMessage(err)}`, { kind: 'error' });
    }
    if (this.photoId === photoId) this.refresh();
  }

  undo() {
    const mine = this.markings.filter((m) => m.author_name === state.me.name && !m.pending);
    this.remove(mine.slice(-1));
  }

  clearMine() {
    const mine = this.markings.filter((m) => m.author_name === state.me.name && !m.pending);
    if (mine.length && confirm(`Remove all ${mine.length} of your marks on this photo?`)) this.remove(mine);
  }
}
