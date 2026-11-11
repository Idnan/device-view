const $ = (id) => document.getElementById(id);
let tab, current = null;

function render(res = {}) {
  current = res.device; // background always replies with the tab's current device or null
  const live = !!current;
  $('hero').classList.toggle('live', live);
  $('name').textContent = live ? current.name : 'Off';
  $('meta').textContent = live ? `${current.width} × ${current.height} · ${current.dpr}x` : 'Pick a device below';
  $('reset').disabled = $('rotate').disabled = !live;
  for (const b of $('zoom').children) {
    b.disabled = !live;
    b.setAttribute('aria-pressed', String(live && String(current.zoom ?? 'fit') === b.dataset.zoom));
  }
  for (const b of $('devices').children) b.setAttribute('aria-pressed', String(current?.name === b.dataset.name));
  $('error').textContent = res.error || '';
  if (live) { $('w').value = current.width; $('h').value = current.height; $('m').checked = current.mobile; }
}

const COMPARE = chrome.runtime.getURL('compare.html');
let source = null; // the real page, when the popup was opened on the compare tab

// Swap the compare tab back to the real page, so the device is applied to the site, not to compare.html.
async function leaveCompare() {
  const url = source;
  source = null;
  const loaded = new Promise((resolve) => {
    const done = (id, info, t) => {
      if (id === tab.id && info.status === 'complete' && !t.url.startsWith(COMPARE)) {
        chrome.tabs.onUpdated.removeListener(done);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(done);
  });
  await chrome.tabs.update(tab.id, { url });
  await loaded;
  tab = await chrome.tabs.get(tab.id);
}

const send = (msg) => chrome.runtime.sendMessage({ tabId: tab.id, ...msg }).then(render);
const apply = async (device) => {
  if (source) await leaveCompare();
  return send({ type: 'apply', device: { zoom: current?.zoom ?? 'fit', ...device } });
};

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
  const width = +$('w').value, height = +$('h').value, mobile = $('m').checked;
  apply({ name: 'Custom', width, height, dpr: mobile ? 2 : 1, mobile, ua: mobile ? IOS : undefined });
};

$('rotate').onclick = () => apply({ ...current, width: current.height, height: current.width });

for (const b of $('zoom').children) {
  b.onclick = () => apply({ ...current, zoom: b.dataset.zoom === 'fit' ? 'fit' : +b.dataset.zoom });
}

$('reset').onclick = () => send({ type: 'reset' });

$('compare').onclick = async () => {
  const url = source || tab.url || '';
  if (!/^https?:/.test(url)) return render({ device: current, error: 'Compare only works on http(s) pages.' });
  await chrome.tabs.create({ url: `compare.html?url=${encodeURIComponent(url)}`, index: tab.index + 1 });
  window.close();
};

initTheme($('theme'));

chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => {
  tab = t;
  if (tab.url?.startsWith(COMPARE)) {
    const url = new URL(tab.url).searchParams.get('url');
    if (/^https?:\/\//.test(url || '')) source = url;
  }
  send({ type: 'get' });
});
