const $ = (id) => document.getElementById(id);
let tab, state = null, current = null;

const theme = () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light');
const webPage = () => /^https?:/.test(tab?.url || '');

function render(res = {}) {
  state = res.state || null; // background always replies with the tab's state or null
  current = state && !state.compare ? state.device : null;
  $('hero').classList.toggle('live', !!state);
  $('hero').removeAttribute('aria-busy');
  $('name').textContent = state?.compare ? 'All devices' : current?.name ?? 'Off';
  $('meta').textContent = state?.compare ? `${DEVICES.length} side by side`
    : current ? `${current.width} × ${current.height} · ${current.dpr}x` : 'Pick a device below';
  $('reset').disabled = !state;
  $('rotate').disabled = !current;
  for (const b of $('zoom').children) {
    b.disabled = !current;
    b.setAttribute('aria-pressed', String(!!current && String(current.zoom ?? 'fit') === b.dataset.zoom));
  }
  for (const b of $('devices').children) b.setAttribute('aria-pressed', String(current?.name === b.dataset.name));
  $('compare-label').textContent = state?.compare ? 'Exit compare' : 'Compare all side by side';
  $('error').textContent = res.error || '';
  if (current) { $('w').value = current.width; $('h').value = current.height; }
}

function send(msg) {
  $('hero').setAttribute('aria-busy', 'true');
  $('meta').textContent = 'Loading…';
  return chrome.runtime.sendMessage({ tabId: tab.id, theme: theme(), ...msg }).then(render);
}

function apply(device) {
  if (!webPage()) return render({ state, error: 'Device View only works on http(s) pages.' });
  return send({ type: 'apply', device: { zoom: current?.zoom ?? 'fit', ...device } });
}

for (const d of DEVICES) {
  const b = document.createElement('button');
  b.className = 'device';
  b.dataset.name = d.name;
  b.innerHTML = `<b></b><small class="display">${d.width}×${d.height}</small>`;
  b.querySelector('b').textContent = d.name;
  b.onclick = () => apply(d);
  $('devices').append(b);
}

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
  send({ type: 'compare' });
};

initTheme($('theme'));
// The framed viewer draws its own background, so push the new theme to it.
$('theme').addEventListener('click', () => {
  if (!state) return;
  if (state.compare) send({ type: 'compare' }); else apply(current);
});

chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => {
  tab = t;
  send({ type: 'get' });
});
