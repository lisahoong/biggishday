/* Data layer.
   Reads go over fetch — instant, no permission prompt.
   Writes go through the File System Access API, which needs one folder grant.
   Both require a real origin, which is why the app is served from localhost. */

const store = (() => {
  const DATA_FILE = 'wedding-data.json';
  const PHOTOS_DIR = 'photos';
  const META_FILE = 'metadata.json';
  const IDB_NAME = 'wedding-planner';
  const IDB_KEY = 'rootDir';
  const LS_PENDING = 'weddingPendingData';
  const LS_PHOTO_TAGS = 'weddingPendingTags';

  const IMAGE_EXT = ['jpg','jpeg','png','gif','webp','heic','heif','avif','bmp','tiff','tif','svg'];

  const CAN_PERSIST = typeof window.showDirectoryPicker === 'function' && !!window.indexedDB;

  const BUDGET_STATUSES = ['idea', 'estimated', 'quoted', 'booked'];
  const VENDOR_STATUSES = ['considering', 'shortlisted', 'booked', 'passed'];

  const DEFAULT_CATEGORIES = [
    'Venue', 'Catering & Bar', 'Photography & Video', 'Florals & Decor',
    'Music & Entertainment', 'Attire & Beauty', 'Stationery', 'Rentals',
    'Cake & Desserts', 'Transportation', 'Officiant', 'Gifts & Favors',
  ];

  function newId(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  }

  function emptyData() {
    return {
      version: 1,
      settings: { guestCount: 150, budgetTarget: 0, weddingDate: null, venue: 'Fairmont Grand Del Mar' },
      categories: DEFAULT_CATEGORIES.map((name, i) => ({
        id: newId('cat'), name, sortOrder: i, budgetTarget: 0,
      })),
      budgetItems: [],
      vendorOptions: [],
      palettes: [],
      collections: [],
    };
  }

  const state = {
    loaded: false,
    canWrite: false,
    pending: false,
    pendingTags: false,
    rootName: '',
    data: emptyData(),
    photos: [],
  };

  let rootHandle = null;
  let photosHandle = null;
  const listeners = new Set();
  let onSaveStatus = () => {};

  const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
  const notify = () => listeners.forEach(fn => fn());
  const setSaveStatusHandler = fn => { onSaveStatus = fn; };

  // ---------- read path ----------
  async function fetchJson(path) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  const byNewest = (a, b) => (b.addedAt || '').localeCompare(a.addedAt || '');

  function photoFromMeta(m) {
    return {
      filename: m.filename,
      tags: m.tags || [],
      suggestedTags: m.suggestedTags || [],
      source: m.source || 'local file',
      originalName: m.originalName || m.filename,
      addedAt: m.addedAt || null,
      url: `${PHOTOS_DIR}/${encodeURIComponent(m.filename)}`,
    };
  }

  /** Load everything read-only. Runs on boot; needs no user gesture. */
  async function load() {
    const pending = readPending();
    const onDisk = await fetchJson(DATA_FILE);
    state.data = migrate(pending?.data || onDisk || emptyData());
    state.pending = !!pending;

    const meta = (await fetchJson(`${PHOTOS_DIR}/${META_FILE}`)) || [];
    state.photos = meta.filter(m => m && m.filename).map(photoFromMeta).sort(byNewest);

    // Tag edits made before the folder was connected win over what's on disk.
    const pendingTags = readPendingTags();
    if (pendingTags) {
      state.pendingTags = true;
      for (const p of state.photos) {
        if (pendingTags[p.filename]) p.tags = pendingTags[p.filename];
      }
    }

    state.loaded = true;
    notify();
  }

  function migrate(raw) {
    const base = emptyData();
    const d = {
      version: 1,
      settings: { ...base.settings, ...(raw.settings || {}) },
      categories: raw.categories?.length ? raw.categories : base.categories,
      budgetItems: raw.budgetItems || [],
      vendorOptions: raw.vendorOptions || [],
      palettes: raw.palettes || [],
      collections: raw.collections || [],
    };
    d.categories.forEach((c, i) => {
      if (c.sortOrder == null) c.sortOrder = i;
      if (c.budgetTarget == null) c.budgetTarget = 0;
    });
    return d;
  }

  // ---------- write path ----------
  function readPending() {
    try {
      const raw = localStorage.getItem(LS_PENDING);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function writePending() {
    try {
      localStorage.setItem(LS_PENDING, JSON.stringify({ savedAt: Date.now(), data: state.data }));
      state.pending = true;
    } catch { /* quota — the disk write is the real save */ }
  }
  function clearPending() {
    try { localStorage.removeItem(LS_PENDING); } catch {}
    state.pending = false;
  }

  // Photo tags are keyed by filename so they survive metadata.json being rewritten
  // underneath us by the suggest-photo-tags skill.
  function readPendingTags() {
    try {
      const raw = localStorage.getItem(LS_PHOTO_TAGS);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function writePendingTags() {
    try {
      const map = {};
      for (const p of state.photos) if (p.tags.length) map[p.filename] = p.tags;
      localStorage.setItem(LS_PHOTO_TAGS, JSON.stringify(map));
      state.pendingTags = true;
    } catch { /* quota */ }
  }
  function clearPendingTags() {
    try { localStorage.removeItem(LS_PHOTO_TAGS); } catch {}
    state.pendingTags = false;
  }

  async function writeJson(dir, name, value) {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(value, null, 2));
    await w.close();
  }

  let saveTimer = null;
  function save() {
    // Land the edit somewhere durable immediately, even without folder access.
    writePending();
    onSaveStatus('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      if (!state.canWrite) { onSaveStatus('local'); notify(); return; }
      try {
        await writeJson(rootHandle, DATA_FILE, state.data);
        clearPending();
        onSaveStatus('saved');
        notify();
      } catch (e) {
        onSaveStatus('error', e);
      }
    }, 300);
  }

  /** Mutate data, persist, re-render. The only sanctioned way to change state. */
  function commit(fn) {
    fn(state.data);
    save();
    notify();
  }

  /** Write photos/metadata.json in the exact shape the suggest-photo-tags skill expects.
   *  Photo tags live in that file rather than wedding-data.json, so without a folder
   *  connection they'd have nowhere to go — they're mirrored into localStorage and
   *  flushed to disk on connect. */
  async function savePhotoMetadata() {
    writePendingTags();
    onSaveStatus('saving');
    if (!state.canWrite) { onSaveStatus('local'); notify(); return; }
    try {
      await writeJson(photosHandle, META_FILE, state.photos.map(p => ({
        filename: p.filename,
        tags: p.tags,
        source: p.source,
        originalName: p.originalName,
        addedAt: p.addedAt,
        suggestedTags: p.suggestedTags,
      })));
      clearPendingTags();
      onSaveStatus('saved');
      notify();
    } catch (e) {
      onSaveStatus('error', e);
    }
  }

  // ---------- folder handle (enables writing) ----------
  function idbOpen() {
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(IDB_NAME, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => req.result.createObjectStore('handles');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbSet(key, val) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function idbGet(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readonly');
      const req = tx.objectStore('handles').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbDel(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Connect the wedding folder.
   * `forcePick` always opens the picker — needed to switch folders, since otherwise
   * a remembered (possibly wrong) handle would be reused forever.
   */
  async function connectFolder({ forcePick = false } = {}) {
    const handle = (!forcePick && rootHandle)
      ? rootHandle
      : await window.showDirectoryPicker({ mode: 'readwrite' });
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') throw new Error('Write permission was not granted');
    // attach() validates the folder; only remember it once it's proven good.
    await attach(handle);
    idbSet(IDB_KEY, handle).catch(() => {});
  }

  /** Re-attach a folder granted in a previous session. Never prompts. */
  async function tryRestoreFolder() {
    if (!CAN_PERSIST) return;
    let handle = null;
    try { handle = await idbGet(IDB_KEY); } catch { return; }
    if (!handle) return;
    let perm = 'prompt';
    try { perm = await handle.queryPermission({ mode: 'readwrite' }); } catch { return; }
    if (perm !== 'granted') {
      rootHandle = handle;
      state.rootName = handle.name;
      notify();
      return;
    }
    try {
      await attach(handle);
    } catch {
      // Remembered folder is no longer valid — forget it so the user gets a fresh picker.
      idbDel(IDB_KEY).catch(() => {});
      rootHandle = null;
      state.rootName = '';
      notify();
    }
  }

  async function attach(handle) {
    // Never create photos/ — if it's missing, this is the wrong folder, and silently
    // creating one would send every future save somewhere the app never reads from.
    let ph;
    try {
      ph = await handle.getDirectoryHandle(PHOTOS_DIR, { create: false });
    } catch {
      throw new Error(`“${handle.name}” has no photos folder in it — pick the wedding folder itself.`);
    }
    rootHandle = handle;
    state.rootName = handle.name;
    photosHandle = ph;
    state.canWrite = true;
    await scanForNewPhotos();
    // Flush anything that accumulated while we had nowhere to write.
    if (state.pending) {
      await writeJson(rootHandle, DATA_FILE, state.data);
      clearPending();
    }
    if (state.pendingTags) await savePhotoMetadata();
    notify();
  }

  /** Pick up image files on disk that metadata.json doesn't know about yet. */
  async function scanForNewPhotos() {
    const known = new Set(state.photos.map(p => p.filename));
    const added = [];
    for await (const entry of photosHandle.values()) {
      if (entry.kind !== 'file' || known.has(entry.name) || entry.name === META_FILE) continue;
      const ext = (/\.([a-zA-Z0-9]+)$/.exec(entry.name) || [])[1]?.toLowerCase();
      if (!IMAGE_EXT.includes(ext)) continue;
      const file = await entry.getFile();
      added.push(photoFromMeta({
        filename: entry.name, tags: [], suggestedTags: [],
        source: 'local file', originalName: entry.name,
        addedAt: new Date(file.lastModified).toISOString(),
      }));
    }
    if (!added.length) return 0;
    state.photos = [...state.photos, ...added].sort(byNewest);
    await savePhotoMetadata();
    return added.length;
  }

  async function refresh() {
    await load();
    if (state.canWrite) await scanForNewPhotos();
    notify();
  }

  // ---------- lookups ----------
  const categoryById = id => state.data.categories.find(c => c.id === id) || null;
  const paletteById = id => state.data.palettes.find(p => p.id === id) || null;
  const photoByName = f => state.photos.find(p => p.filename === f) || null;
  const sortedCategories = () => [...state.data.categories].sort((a, b) => a.sortOrder - b.sortOrder);

  function tagVocabulary() {
    const counts = new Map();
    for (const p of state.photos) for (const t of p.tags) counts.set(t, (counts.get(t) || 0) + 1);
    return counts;
  }

  function suggestedTagVocabulary() {
    const counts = new Map();
    for (const p of state.photos) for (const t of p.suggestedTags) counts.set(t, (counts.get(t) || 0) + 1);
    return counts;
  }

  /** Every tag on a photo by either route, counted once per photo. Style words like
   *  "garden party" live mostly in the AI set, so matching user tags alone misses most of it. */
  function boardVocabulary() {
    const counts = new Map();
    for (const p of state.photos) {
      for (const t of new Set([...p.tags, ...p.suggestedTags])) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    return counts;
  }

  return {
    CAN_PERSIST, BUDGET_STATUSES, VENDOR_STATUSES,
    state, subscribe, notify, setSaveStatusHandler, newId,
    load, connectFolder, tryRestoreFolder, refresh,
    save, commit, savePhotoMetadata,
    categoryById, paletteById, photoByName, sortedCategories,
    tagVocabulary, suggestedTagVocabulary, boardVocabulary,
  };
})();
