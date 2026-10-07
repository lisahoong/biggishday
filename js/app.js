/* App shell: tab routing, folder connection, save indicator. Classic script — loaded last. */

(() => {
  const TABS = {
    overview: tabOverview,
    inspiration: tabInspiration,
    palettes: tabPalettes,
    budget: tabBudget,
    vendors: tabVendors,
  };

  const tabRoot = document.getElementById('tabRoot');
  const banner = document.getElementById('banner');
  const folderState = document.getElementById('folderState');
  const connectBtn = document.getElementById('connectBtn');
  const saveIndicator = document.getElementById('saveIndicator');
  const brandSub = document.getElementById('brandSub');

  let activeTab = localStorage.getItem('activeTab') || 'overview';
  if (!TABS[activeTab]) activeTab = 'overview';

  // ---------- save indicator ----------
  let hideTimer = null;
  store.setSaveStatusHandler((status, err) => {
    clearTimeout(hideTimer);
    saveIndicator.style.opacity = '1';
    if (status === 'saving') saveIndicator.textContent = 'saving…';
    else if (status === 'saved') {
      saveIndicator.textContent = 'saved';
      hideTimer = setTimeout(() => { saveIndicator.style.opacity = '0'; }, 1400);
    } else if (status === 'local') {
      saveIndicator.textContent = 'saved in browser';
      hideTimer = setTimeout(() => { saveIndicator.style.opacity = '0'; }, 1400);
    } else {
      saveIndicator.textContent = '';
      toast(`Could not save: ${err?.message || 'unknown error'}`, 'error');
    }
  });

  // ---------- tabs ----------
  document.getElementById('tabs').addEventListener('click', e => {
    const btn = e.target.closest('button[data-tab]');
    if (btn) goToTab(btn.dataset.tab);
  });

  /** Switch tabs programmatically — used by cross-links (e.g. after booking a vendor). */
  function goToTab(name) {
    if (!TABS[name]) return;
    activeTab = name;
    localStorage.setItem('activeTab', name);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const ctx = { goToTab };

  function renderBanner() {
    banner.hidden = true;
    banner.className = 'banner';
    clear(banner);

    if (!store.CAN_PERSIST) {
      banner.hidden = false;
      banner.append('Changes stay in this browser — saving to disk needs Chrome or Edge on desktop.');
      return;
    }
    if (!store.state.canWrite) {
      banner.hidden = false;
      banner.className = 'banner warn';
      appendAll(banner,
        el('strong', {}, 'Not saving to disk yet.'),
        el('span', {}, 'Your changes are held in this browser only — clearing site data or switching browsers loses them. Connect the folder once and everything written so far is flushed to disk.'),
        el('span', { class: 'spacer' }),
        el('button', { class: 'btn btn-primary btn-sm', onclick: connect }, 'Connect Folder'),
      );
    }
  }

  function render() {
    for (const btn of document.querySelectorAll('#tabs button[data-tab]')) {
      btn.classList.toggle('active', btn.dataset.tab === activeTab);
    }

    const on = store.state.canWrite;
    folderState.textContent = on ? `saving to ${store.state.rootName}/` : 'browser only';
    folderState.className = on ? 'state ok' : 'state no';
    folderState.title = on ? 'Changes are being written to this folder' : 'Changes are not on disk yet';
    connectBtn.textContent = on ? 'Change folder' : 'Connect Folder';
    connectBtn.className = on ? 'btn btn-ghost btn-sm' : 'btn btn-secondary btn-sm';
    connectBtn.hidden = !store.CAN_PERSIST;
    brandSub.textContent = store.state.data.settings.venue || '';

    renderBanner();
    clear(tabRoot);
    TABS[activeTab].render(tabRoot, ctx);
  }

  store.subscribe(render);

  async function connect(forcePick = false) {
    try {
      await store.connectFolder({ forcePick });
      toast(`Saving to ${store.state.rootName}/ — everything so far has been written to disk.`);
    } catch (e) {
      if (e.name === 'AbortError') return;
      toast(e.message, 'error');
    }
  }

  // Once connected, this button re-opens the picker so a wrong folder can be swapped out.
  connectBtn.addEventListener('click', () => connect(store.state.canWrite));

  // ---------- boot ----------
  store.load()
    .then(() => store.tryRestoreFolder())
    .catch(e => toast(`Could not load data: ${e.message}`, 'error'));

  render();
})();
