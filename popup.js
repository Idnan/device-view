const $ = (id) => document.getElementById(id);
let tab, state = null, current = null;
let presets = DEVICES, prefs = null, managing = false; // prefs: null = the defaults, untouched

const theme = () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light');
const webPage = () => /^https?:/.test(tab?.url || '');

function render(res = {}) {
  state = res.state || null; // background always replies with the tab's state or null
  current = state && !state.compare ? state.device : null;
  $('hero').classList.toggle('live', !!state);
  $('hero').removeAttribute('aria-busy');
  $('name').textContent = state?.compare ? 'All devices' : current?.name ?? 'Off';
  // Errors take the meta line instead of their own box, so the popup never grows past Chrome's 600px limit.
  $('meta').textContent = res.error || (state?.compare ? `${(state.devices || DEVICES).length} side by side`
    : current ? `${current.width} × ${current.height} · ${current.dpr}x` : 'Pick a device below');
  $('meta').classList.toggle('err', !!res.error);
  $('reset').disabled = !state;
  $('rotate').disabled = !current;
  for (const b of $('zoom').children) {
    b.disabled = !current;
    b.setAttribute('aria-pressed', String(!!current && String(current.zoom ?? 'fit') === b.dataset.zoom));
  }
  markPressed();
  $('compare-label').textContent = state?.compare ? 'Exit compare' : 'Compare all side by side';
  if (current) { $('w').value = current.width; $('h').value = current.height; }
}

function send(msg) {
  $('hero').setAttribute('aria-busy', 'true');
  $('meta').textContent = msg.type === 'reset' ? 'Turning off…' : 'Loading…';
  $('reset').disabled = true; // no double turn-off; render() re-enables it once the command is done
  return chrome.runtime.sendMessage({ tabId: tab.id, theme: theme(), ...msg }).then(render);
}

function apply(device) {
  if (!webPage()) return render({ state, error: 'Device View only works on http(s) pages.' });
  return send({ type: 'apply', device: { zoom: current?.zoom ?? 'fit', ...device } });
}

// ---------- presets: built-in devices the user ticked (CATALOG order), then their own sizes.
// Untouched lists follow DEFAULTS, so a yearly update reaches them; edited ones see new devices unticked in Manage. ----------

const STORE = 'presets'; // { shown: [catalog names], mine: [{ name, width, height, on }] }; own sizes show only when on

const markPressed = () => {
  for (const b of $('devices').children) b.setAttribute('aria-pressed', String(current?.name === b.dataset.name));
};

const kind = (d) => (!d.mobile ? 'Computers' : d.ua === IPAD ? 'Tablets' : 'Phones');
const shownNames = () => prefs?.shown ?? DEFAULTS;
const mine = () => prefs?.mine ?? [];

function computePresets() {
  const shown = new Set(shownNames());
  presets = [...CATALOG.filter((d) => shown.has(d.name)), ...mine().filter((d) => d.on).map(({ on, ...d }) => ({ ...d, dpr: 1, mobile: false }))];
}

async function loadPresets() {
  const stored = (await chrome.storage.sync.get(STORE))[STORE];
  prefs = stored && Array.isArray(stored.shown) && Array.isArray(stored.mine) ? stored : null;
  computePresets();
}

// shortcut: storage.sync allows 8 KB per item (~150 own sizes); past that the save fails and says so.
// quiet: a checkbox already shows its new state, so only the count changes (no redraw, keeps focus and scroll).
async function savePrefs(next, quiet) {
  prefs = next;
  computePresets();
  if (quiet) $('devices-title').textContent = `Manage devices · ${presets.length} shown`;
  else renderDevices();
  await (prefs ? chrome.storage.sync.set({ [STORE]: prefs }) : chrome.storage.sync.remove(STORE))
    .catch(() => render({ state, error: 'Too many sizes to save. Remove a few.' }));
}
const editPrefs = (change, quiet) => savePrefs({ shown: shownNames(), mine: mine(), ...change }, quiet);

const removeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const el = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text != null ? { textContent: text } : {});

function renderGrid() {
  $('devices').replaceChildren(...presets.map((d) => {
    const b = el('button', 'device');
    b.dataset.name = d.name;
    b.append(el('b', '', d.name), el('small', 'display', `${d.width}×${d.height}`));
    b.onclick = () => apply(d);
    return b;
  }));
  markPressed();
}

function renderManage() {
  const shown = new Set(shownNames());
  $('catalog-list').replaceChildren(...['Phones', 'Tablets', 'Computers'].flatMap((group) => [
    el('h3', 'group display', group),
    ...CATALOG.filter((d) => kind(d) === group).map((d) => {
      const row = el('label', 'check');
      const box = Object.assign(el('input'), { type: 'checkbox', checked: shown.has(d.name) });
      box.onchange = () => {
        const now = new Set(shownNames());
        if (box.checked) now.add(d.name); else now.delete(d.name);
        editPrefs({ shown: CATALOG.map((c) => c.name).filter((n) => now.has(n)) }, true);
        $('restore').hidden = false;
      };
      row.append(box, el('b', '', d.name), el('small', 'display', `${d.width}×${d.height}`));
      return row;
    }),
  ]));
  $('mine-list').replaceChildren(...(mine().length ? mine().map((d, i) => {
    // The checkbox sits in its own label so clicking × never toggles it.
    const row = el('div', 'check mine');
    const label = el('label', 'mine-label');
    const box = Object.assign(el('input'), { type: 'checkbox', checked: !!d.on });
    box.onchange = () => {
      editPrefs({ mine: mine().map((m, j) => (j === i ? { ...m, on: box.checked } : m)) }, true);
      $('restore').hidden = false;
    };
    label.append(box, el('b', '', d.name), el('small', 'display', `${d.width}×${d.height}`));
    // Two clicks to delete: × turns into "Confirm"; leaving the button cancels.
    const x = el('button', 'x');
    x.innerHTML = removeIcon;
    x.setAttribute('aria-label', `Delete ${d.name}`);
    x.title = 'Delete';
    x.onclick = () => {
      if (!x.classList.contains('confirm')) {
        x.classList.add('confirm');
        x.textContent = 'Confirm';
        x.setAttribute('aria-label', `Confirm deleting ${d.name}`);
        return;
      }
      editPrefs({ mine: mine().filter((_, j) => j !== i) });
    };
    x.onblur = () => {
      x.classList.remove('confirm');
      x.innerHTML = removeIcon;
      x.setAttribute('aria-label', `Delete ${d.name}`);
    };
    row.append(label, x);
    return row;
  }) : [el('p', 'empty-mine', 'Sizes you add below appear here. Tick one to show it in your device list.')]));
}

function renderDevices() {
  $('devices-title').textContent = managing ? `Manage devices · ${presets.length} shown` : 'Devices';
  $('manage-toggle').textContent = managing ? 'Done' : 'Manage devices';
  $('manage-toggle').setAttribute('aria-expanded', String(managing));
  for (const id of ['devices', 'custom', 'compare']) $(id).hidden = managing;
  $('manage').hidden = !managing;
  $('restore').hidden = !managing || !prefs; // only in Manage, and only once something changed
  if (managing) renderManage(); else renderGrid();
}

$('manage-toggle').onclick = () => { managing = !managing; renderDevices(); };
// Reset also deletes the user's own sizes and sits next to Done, so it takes two clicks like deleting a size.
$('restore').onclick = () => {
  const b = $('restore');
  if (!b.classList.contains('confirm')) {
    b.classList.add('confirm');
    b.textContent = 'Confirm';
    return;
  }
  b.onblur();
  savePrefs(null);
};
$('restore').onblur = () => {
  $('restore').classList.remove('confirm');
  $('restore').textContent = 'Reset';
};
$('mine-form').onsubmit = (e) => {
  e.preventDefault();
  editPrefs({ mine: [...mine(), { name: $('mine-name').value.trim() || `${$('mine-w').value}×${$('mine-h').value}`, width: +$('mine-w').value, height: +$('mine-h').value, on: false }] });
  $('mine-form').reset();
};

$('custom').onsubmit = (e) => {
  e.preventDefault();
  apply({ name: 'Custom', width: +$('w').value, height: +$('h').value, dpr: 1, mobile: false });
};

$('rotate').onclick = () => apply({ ...current, width: current.height, height: current.width });

for (const b of $('zoom').children) {
  b.onclick = () => apply({ ...current, zoom: b.dataset.zoom === 'fit' ? 'fit' : +b.dataset.zoom });
}

$('reset').onclick = () => send({ type: 'reset' });

$('compare').onclick = () => {
  if (state?.compare) return send({ type: 'reset' });
  if (!webPage()) return render({ state, error: 'Compare only works on http(s) pages.' });
  send({ type: 'compare', devices: presets });
};

initTheme($('theme'));
// The framed viewer draws its own background, so push the new theme to it.
$('theme').addEventListener('click', () => {
  if (!state) return;
  if (state.compare) send({ type: 'compare', devices: state.devices }); else apply(current);
});

loadPresets().then(renderDevices);
chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => {
  tab = t;
  send({ type: 'get' });
});
