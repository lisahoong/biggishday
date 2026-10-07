import * as api from './api.js';
import { state, listFor, allTags } from './state.js';
import { Markup } from './markup.js';
import { h, icon, toast, errorMessage, timeAgo, formatDate, normalizeTag, isTyping } from './ui.js';

let view = null;

export function openDetail(photoId, orderedIds, onChange) {
  if (!view) view = new DetailView();
  view.open(photoId, orderedIds, onChange);
}

class DetailView {
  constructor() {
    this.img = h('img', { class: 'detail-img', alt: '' });
    this.stage = h('div', { class: 'stage' }, this.img);
    this.markupBar = h('div', { class: 'markup-bar' });
    this.counter = h('span', { class: 'counter' });
    this.prevBtn = h('button', { class: 'btn btn-icon nav-prev', 'aria-label': 'Previous photo', onClick: () => this.step(-1) }, icon('left'));
    this.nextBtn = h('button', { class: 'btn btn-icon nav-next', 'aria-label': 'Next photo', onClick: () => this.step(1) }, icon('right'));
    this.side = h('aside', { class: 'detail-side' });

    this.root = h('div', { class: 'detail', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Photo details', hidden: true },
      h('div', { class: 'detail-main' },
        h('div', { class: 'detail-top' },
          h('button', { class: 'btn btn-icon', 'aria-label': 'Close', onClick: () => this.close() }, icon('close')),
          this.counter,
          this.markupBar),
        h('div', { class: 'stage-wrap' }, this.prevBtn, this.stage, this.nextBtn)),
      this.side);
    document.body.append(this.root);

    this.markup = new Markup({ stage: this.stage, img: this.img, toolbar: this.markupBar, });
    this.img.addEventListener('load', () => this.markup.render());
    document.addEventListener('keydown', (e) => this.onKey(e));
  }

  get photo() {
    return state.photos.find((p) => p.id === this.photoId);
  }

  open(photoId, orderedIds, onChange) {
    this.ids = orderedIds;
    this.onChange = onChange;
    this.root.hidden = false;
    document.body.classList.add('no-scroll');
    this.show(photoId);
  }

  close() {
    this.markup.setDrawing(false);
    this.root.hidden = true;
    this.photoId = null;
    document.body.classList.remove('no-scroll');
    this.onChange();
  }

  step(delta) {
    const i = this.ids.indexOf(this.photoId);
    const next = this.ids[i + delta];
    if (next) this.show(next);
  }

  show(photoId) {
    this.photoId = photoId;
    const photo = this.photo;
    if (!photo) return this.close();
    this.img.src = photo.url;
    this.img.alt = photo.tags.length ? `Inspiration photo: ${photo.tags.join(', ')}` : 'Inspiration photo';
    const i = this.ids.indexOf(photoId);
    this.counter.textContent = `${i + 1} of ${this.ids.length}`;
    this.prevBtn.disabled = i <= 0;
    this.nextBtn.disabled = i >= this.ids.length - 1;
    this.markup.setPhoto(photoId);
    this.renderSide();
    this.refreshFromServer(photoId);
  }

  // The gallery's copy may be stale if the other person edited since page load.
  async refreshFromServer(photoId) {
    const startVersion = state.version;
    try {
      const { photo, comments, markings } = await api.loadPhotoExtras(photoId);
      if (state.version !== startVersion) return;
      if (!photo) {
        state.photos = state.photos.filter((p) => p.id !== photoId);
        this.ids = this.ids.filter((id) => id !== photoId);
        if (this.photoId === photoId) {
          toast('This photo was deleted.');
          this.close();
        }
        return;
      }
      const local = state.photos.find((p) => p.id === photoId);
      if (local) local.tags = photo.tags;
      const pendingMarks = listFor(state.markings, photoId).filter((m) => m.pending);
      state.comments.set(photoId, comments);
      state.markings.set(photoId, [...markings, ...pendingMarks]);
      if (this.photoId === photoId) {
        this.markup.refresh();
        this.renderSide();
      }
    } catch (err) {
      toast(`Couldn't refresh this photo: ${errorMessage(err)}`, { kind: 'error' });
    }
  }

  onKey(e) {
    if (this.root.hidden || isTyping(e)) return;
    if (this.markup.handleKey(e)) { e.preventDefault(); return; }
    if (e.key === 'Escape') this.close();
    else if (e.key === 'ArrowLeft') this.step(-1);
    else if (e.key === 'ArrowRight') this.step(1);
  }

  renderSide() {
    const photo = this.photo;
    if (!photo) return;
    this.side.replaceChildren(
      this.tagsSection(photo),
      this.commentsSection(photo),
      h('section', { class: 'side-footer' },
        h('p', { class: 'muted' }, `${photo.added_by_name ? `Added by ${photo.added_by_name}` : 'Imported'} · ${formatDate(photo.created_at)}`),
        h('button', { class: 'btn btn-danger-ghost', onClick: () => this.deletePhoto(photo) }, 'Delete photo')),
    );
  }

  tagsSection(photo) {
    const input = h('input', {
      class: 'tag-input', list: 'tag-suggestions', placeholder: photo.tags.length ? 'Add another tag' : 'Add a tag, e.g. centerpiece',
      'aria-label': 'Add a tag', autocomplete: 'off',
    });
    const commit = () => {
      const added = input.value.split(',').map(normalizeTag).filter(Boolean);
      input.value = '';
      const tags = [...new Set([...photo.tags, ...added])];
      if (tags.length !== photo.tags.length) this.saveTags(photo, tags, true);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
    });
    input.addEventListener('blur', commit);

    const suggestions = h('datalist', { id: 'tag-suggestions' },
      allTags().filter(([t]) => !photo.tags.includes(t)).map(([t]) => h('option', { value: t })));

    return h('section', { class: 'side-section' },
      h('h2', {}, 'Tags'),
      h('div', { class: 'tag-editor' },
        photo.tags.map((t) => h('span', { class: 'chip' }, t,
          h('button', { class: 'chip-x', 'aria-label': `Remove tag ${t}`, onClick: () => this.saveTags(photo, photo.tags.filter((x) => x !== t)) }, '×'))),
        input),
      suggestions);
  }

  async saveTags(photo, tags, refocus = false) {
    const before = photo.tags;
    photo.tags = tags;
    state.version++;
    this.renderSide();
    if (refocus) this.side.querySelector('.tag-input')?.focus();
    try {
      await api.updateTags(photo.id, tags);
    } catch (err) {
      photo.tags = before;
      if (this.photoId === photo.id) this.renderSide();
      toast(`Couldn't save tags: ${errorMessage(err)}`, { kind: 'error' });
    }
  }

  commentsSection(photo) {
    const comments = listFor(state.comments, photo.id);
    const textarea = h('textarea', { rows: 3, placeholder: 'What do you like about this one?', 'aria-label': 'Write a comment' });
    const button = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Post');
    const form = h('form', { class: 'comment-form' }, textarea, h('div', { class: 'form-row' }, h('span', { class: 'muted small' }, 'Ctrl/⌘ + Enter to post'), button));
    form.addEventListener('submit', (e) => { e.preventDefault(); this.postComment(photo, textarea, button); });
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); form.requestSubmit(); }
    });

    return h('section', { class: 'side-section side-comments' },
      h('h2', {}, 'Comments'),
      comments.length
        ? h('ul', { class: 'comments' }, comments.map((c) => h('li', { class: 'comment' },
          h('div', { class: 'comment-head' },
            h('strong', {}, c.author_name),
            h('time', { datetime: c.created_at, title: new Date(c.created_at).toLocaleString() }, timeAgo(c.created_at)),
            c.author_name === state.me.name
              ? h('button', { class: 'link-btn', onClick: () => this.deleteComment(photo, c) }, 'Delete')
              : null),
          h('p', { class: 'comment-body' }, c.body))))
        : h('p', { class: 'muted' }, 'No comments yet. Point out what you like: the colors, the flowers, the lighting.'),
      form);
  }

  async postComment(photo, textarea, button) {
    const body = textarea.value.trim();
    if (!body) return;
    button.disabled = true;
    try {
      state.version++;
      const row = await api.addComment(photo.id, body, state.me.name);
      listFor(state.comments, photo.id).push(row);
        if (this.photoId === photo.id) {
        this.renderSide();
        this.side.querySelector('.comments li:last-child')?.scrollIntoView({ block: 'nearest' });
      }
    } catch (err) {
      button.disabled = false;
      toast(`Couldn't post comment: ${errorMessage(err)}`, { kind: 'error' });
    }
  }

  async deleteComment(photo, comment) {
    if (!confirm('Delete this comment?')) return;
    try {
      state.version++;
      await api.deleteComment(comment.id);
      const list = listFor(state.comments, photo.id);
      list.splice(list.indexOf(comment), 1);
        if (this.photoId === photo.id) this.renderSide();
    } catch (err) {
      toast(`Couldn't delete comment: ${errorMessage(err)}`, { kind: 'error' });
    }
  }

  async deletePhoto(photo) {
    if (!confirm('Delete this photo for both of you? Its comments and markings will be deleted too.')) return;
    try {
      await api.deletePhoto(photo);
    } catch (err) {
      toast(`Couldn't delete photo: ${errorMessage(err)}`, { kind: 'error' });
      return;
    }
    const i = this.ids.indexOf(photo.id);
    state.photos = state.photos.filter((p) => p.id !== photo.id);
    state.comments.delete(photo.id);
    state.markings.delete(photo.id);
    this.ids = this.ids.filter((id) => id !== photo.id);
    toast('Photo deleted.');
    const next = this.ids[Math.min(i, this.ids.length - 1)];
    if (next) this.show(next);
    else this.close();
  }
}
