import * as api from './api.js';
import { state } from './state.js';
import { renderGallery } from './gallery.js';
import { h, errorMessage } from './ui.js';

const NAME_KEY = 'board.name';
const root = document.getElementById('app');
let signedIn;

function message(title, text, ...actions) {
  root.replaceChildren(h('div', { class: 'center-card' }, h('h1', {}, title), h('p', { class: 'muted' }, text), ...actions));
}

function card(title, subtitle, form) {
  root.replaceChildren(h('div', { class: 'center-card' }, h('h1', {}, title), h('p', { class: 'muted' }, subtitle), form));
  form.querySelector('input')?.focus();
}

function renderLogin() {
  const password = h('input', { type: 'password', required: true, autocomplete: 'current-password', placeholder: 'Board password', 'aria-label': 'Board password' });
  const button = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Enter');
  const status = h('p', { class: 'form-error', role: 'alert' });
  const form = h('form', { class: 'login-form' }, password, button, status);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    button.disabled = true;
    status.textContent = '';
    try {
      await api.signIn(password.value);
    } catch (err) {
      status.textContent = errorMessage(err);
      button.disabled = false;
      password.select();
    }
  });
  card('Our Wedding Board', 'Enter the board password to see and share inspiration.', form);
}

function askName(onDone) {
  const current = localStorage.getItem(NAME_KEY) || '';
  const name = h('input', { type: 'text', required: true, maxlength: '60', placeholder: 'e.g. Lisa', 'aria-label': 'Your name', value: current, autocomplete: 'given-name' });
  const form = h('form', { class: 'login-form' }, name, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Continue'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = name.value.trim().slice(0, 60);
    if (!value) return;
    localStorage.setItem(NAME_KEY, value);
    state.me = { name: value };
    onDone();
  });
  card(current ? 'Change your name' : "What's your name?", 'Shown next to your comments, markings and uploads on this device.', form);
}

async function loadBoard() {
  message('Loading…', 'Fetching the board.');
  try {
    const { photos, comments, markings } = await api.loadBoard();
    state.photos = photos;
    state.comments = groupBy(comments);
    state.markings = groupBy(markings);
    renderGallery(root, galleryActions);
  } catch (err) {
    message('Something went wrong', errorMessage(err),
      h('button', { class: 'btn btn-primary', onClick: () => location.reload() }, 'Try again'));
  }
}

const galleryActions = {
  onSignOut: () => api.signOut(),
  onChangeName: () => askName(() => renderGallery(root, galleryActions)),
};

function boot(session) {
  const isIn = Boolean(session);
  if (isIn === signedIn) return;
  signedIn = isIn;
  if (!isIn) return renderLogin();
  const name = localStorage.getItem(NAME_KEY);
  if (name) {
    state.me = { name };
    loadBoard();
  } else {
    askName(loadBoard);
  }
}

function groupBy(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.photo_id)) map.set(row.photo_id, []);
    map.get(row.photo_id).push(row);
  }
  return map;
}

if (!api.configured) {
  message('Almost there', 'Add your Supabase project URL and anon key to js/config.js, then reload.');
} else {
  api.onAuthChange(boot);
}
