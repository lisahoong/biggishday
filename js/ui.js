export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'value') el.value = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

export function icon(name) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = ICONS[name];
  return span;
}

const svg = (body) =>
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const ICONS = {
  comment: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  close: svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
  left: svg('<polyline points="15 18 9 12 15 6"/>'),
  right: svg('<polyline points="9 18 15 12 9 6"/>'),
  trash: svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'),
  upload: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
};

// Deals items into columns left to right (column count comes from the CSS --cols variable).
// CSS columns flow top to bottom and rebalance as each image loads, so the order shifted
// between page loads. Here an item's column depends only on its position.
const masonryObserver = new ResizeObserver((entries) => entries.forEach((e) => layoutMasonry(e.target)));

export function masonry(container, items, empty) {
  Object.assign(container, { masonryItems: items, masonryEmpty: empty, masonryCols: 0 });
  masonryObserver.observe(container);
  layoutMasonry(container);
}

function layoutMasonry(container) {
  const { masonryItems: items, masonryEmpty: empty } = container;
  if (!items.length) {
    if (container.firstChild !== empty) container.replaceChildren(empty);
    return;
  }
  const n = Number(getComputedStyle(container).getPropertyValue('--cols')) || 1;
  if (n === container.masonryCols) return;
  container.masonryCols = n;
  const cols = Array.from({ length: n }, () => h('div', { class: 'masonry-col' }));
  items.forEach((item, i) => cols[i % n].append(item));
  container.replaceChildren(...cols);
}

let toastRoot;
export function toast(message, { kind = 'info', sticky = false, action } = {}) {
  if (!toastRoot) {
    toastRoot = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastRoot);
  }
  const el = h('div', { class: `toast toast-${kind}` }, message,
    action ? h('button', { class: 'toast-action', onClick: () => { remove(); action.onClick(); } }, action.label) : null);
  toastRoot.append(el);
  const remove = () => el.remove();
  if (!sticky) setTimeout(remove, kind === 'error' || action ? 7000 : 3500);
  return { update: (text) => { el.textContent = text; }, close: remove };
}

export function errorMessage(err) {
  return err?.message || String(err);
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const UNITS = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
export function timeAgo(iso) {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function normalizeTag(raw) {
  return raw.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40);
}

export function isTyping(event) {
  const t = event.target;
  return t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
}
