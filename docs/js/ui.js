/* Shared render helpers. Classic script — everything here is a global by design,
   so the app runs from file:// with no server and no module loading. */

/** Create an element. children may be nodes, strings, or falsy (skipped). */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'html') node.innerHTML = v;
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

function clear(node) { node.replaceChildren(); return node; }

/** Like el()'s child handling: flattens arrays and skips nullish. Native append does neither. */
function appendAll(node, ...children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

const money = n =>
  (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

// ---------- toast ----------
function toast(message, kind = '') {
  const stack = document.getElementById('toastStack');
  const node = el('div', { class: `toast ${kind}` }, message);
  stack.append(node);
  setTimeout(() => node.remove(), 2600);
}

// ---------- modal ----------
let closeModalFn = null;

/** openModal({ title, body, actions, wide }) — `body` is a node, `actions` go in the footer. */
function openModal({ title, body, actions = [], wide = false }) {
  const backdrop = document.getElementById('modalBackdrop');
  const modal = document.getElementById('modal');
  modal.className = wide ? 'modal wide' : 'modal';

  const close = () => {
    backdrop.hidden = true;
    clear(modal);
    document.removeEventListener('keydown', onKey);
    backdrop.removeEventListener('mousedown', onBackdrop);
    closeModalFn = null;
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  const onBackdrop = e => { if (e.target === backdrop) close(); };

  appendAll(clear(modal),
    el('div', { class: 'modal-head' },
      el('h3', {}, title),
      el('button', { class: 'btn btn-ghost', onclick: close, 'aria-label': 'Close' }, '✕'),
    ),
    el('div', { class: 'modal-body' }, body),
    actions.length ? el('div', { class: 'modal-foot' }, actions) : null,
  );

  backdrop.hidden = false;
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('mousedown', onBackdrop);
  closeModalFn = close;

  const firstInput = modal.querySelector('input, textarea, select');
  if (firstInput) firstInput.focus();
  return close;
}

function closeModal() { if (closeModalFn) closeModalFn(); }

function confirmDialog(title, message, onConfirm, confirmLabel = 'Delete') {
  openModal({
    title,
    body: el('p', { style: { margin: '0', color: 'var(--ink-2)' } }, message),
    actions: [
      el('button', { class: 'btn btn-secondary', onclick: closeModal }, 'Cancel'),
      el('button', { class: 'btn btn-primary', onclick: () => { closeModal(); onConfirm(); } }, confirmLabel),
    ],
  });
}

// ---------- form helpers ----------
function field(labelText, input) {
  return el('label', { class: 'field' }, el('span', {}, labelText), input);
}

function textInput(value = '', attrs = {}) {
  return el('input', { type: 'text', value, ...attrs });
}

function numberInput(value = '', attrs = {}) {
  return el('input', { type: 'number', value: value === 0 ? '0' : (value || ''), min: '0', step: '1', ...attrs });
}

function selectInput(options, value, attrs = {}) {
  const sel = el('select', attrs);
  for (const o of options) {
    const opt = el('option', { value: o.value }, o.label);
    if (o.value === value) opt.selected = true;
    sel.append(opt);
  }
  return sel;
}

function chip(label, { active = false, count = null, suggested = false, onclick = null, title = null } = {}) {
  return el('button', {
    class: `chip${active ? ' active' : ''}${suggested ? ' suggested' : ''}${onclick ? '' : ' static'}`,
    onclick: onclick || undefined,
    title,
    type: 'button',
  }, label, count != null ? el('span', { class: 'count' }, count) : null);
}

function statusPill(status) {
  return el('span', { class: `pill ${status}` }, status);
}

function emptyState(heading, detail, action = null) {
  return el('div', { class: 'empty' },
    el('strong', {}, heading), detail,
    action ? el('div', { style: { marginTop: '14px' } }, action) : null);
}

function swatchStrip(colors, attrs = {}) {
  return el('div', { class: 'swatch-strip', ...attrs },
    (colors.length ? colors : ['#e6ded3']).map(c => el('span', { style: { background: c } })));
}
