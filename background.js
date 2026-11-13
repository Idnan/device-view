// The tab is taken over by viewer.js, which shows the site in an iframe cut to the device size.
// Clean edges, no debugging bar, same origin as the site so logins keep working.
// (Full chrome.debugger emulation was removed for now; it is in git history at c1d8e02.)
// Per-tab state lives in storage.session because the service worker is killed when idle.

const key = (tabId) => `tab:${tabId}`;
const getState = async (tabId) => (await chrome.storage.session.get(key(tabId)))[key(tabId)] || null;
const setState = (tabId, s) => s ? chrome.storage.session.set({ [key(tabId)]: s }) : chrome.storage.session.remove(key(tabId));

// Headers that stop a page from being framed or from talking to its parent.
const STRIP = ['x-frame-options', 'content-security-policy', 'frame-options',
  'cross-origin-opener-policy', 'cross-origin-embedder-policy', 'cross-origin-resource-policy'];
const busy = new Set(); // tabs we are reloading ourselves, so onUpdated doesn't treat it as the user leaving

// One session rule per tab, id = tabId (fits DNR's 32-bit ids). It is first the takeover rule,
// then replaced by the frame rule once the viewer is in.
const setRule = (tabId, action, condition) => chrome.declarativeNetRequest.updateSessionRules({
  removeRuleIds: [tabId], addRules: [{ id: tabId, action, condition: { tabIds: [tabId], ...condition } }],
});
const dropRules = (tabId) => chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId] }).catch(() => {});

// Every request in a taken-over tab comes from the frames, so this covers their pages and fetches.
const setFrameRule = (tabId, ua) => setRule(tabId, {
  type: 'modifyHeaders',
  responseHeaders: STRIP.map((header) => ({ header, operation: 'remove' })),
  ...(ua && { requestHeaders: [{ header: 'user-agent', operation: 'set', value: ua }] }),
}, { excludedResourceTypes: ['main_frame'] });

function waitForLoad(tabId) {
  return new Promise((resolve) => {
    const done = (id, info) => {
      if (id === tabId && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(done); resolve(); }
    };
    chrome.tabs.onUpdated.addListener(done);
  });
}

// Is viewer.js still the tab's top document? (Frame loads also mark the tab "loading", so status alone can't tell.)
const viewerAlive = (tabId) => chrome.scripting.executeScript({ target: { tabId }, func: () => window.__deviceView === true })
  .then(([r]) => r?.result === true).catch(() => false);

// Reload the tab with its HTML labelled as an image, so the site's own code never runs,
// then inject viewer.js into that same-origin document. Same trick as Responsive Viewer.
// shortcut: a site's service worker can serve cached HTML and bypass this; unregister SWs first if that bites.
async function takeOver(tabId) {
  busy.add(tabId);
  try {
    await setRule(tabId, {
      type: 'modifyHeaders', responseHeaders: [{ header: 'content-type', operation: 'set', value: 'image/png' }],
    }, { resourceTypes: ['main_frame'] });
    const loaded = waitForLoad(tabId);
    await chrome.tabs.reload(tabId);
    await loaded;
  } finally {
    // Never leave the image rule behind: it would break the next normal load of this tab.
    await dropRules(tabId);
    busy.delete(tabId);
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: ['shared.js', 'viewer.js'] });
}

async function showFramed(tabId, view, prev) {
  const ua = view.compare ? undefined : view.device.ua;
  const fresh = prev?.mode !== 'framed';
  try {
    if (fresh) await takeOver(tabId);
    await setFrameRule(tabId, ua);
    const uaChanged = !fresh && (prev.compare ? undefined : prev.device?.ua) !== ua;
    await chrome.tabs.sendMessage(tabId, { type: 'view', view, reload: uaChanged }, { frameId: 0 });
  } catch (e) {
    if (fresh) await dropRules(tabId);
    throw e;
  }
}

// Put the real page back, at whatever page the frame had navigated to.
async function stopFramed(tabId) {
  await dropRules(tabId);
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => { try { return document.querySelector('iframe')?.contentWindow.location.href || null; } catch { return null; } },
  }).catch(() => []);
  const url = res?.result;
  await (url && /^https?:/.test(url) ? chrome.tabs.update(tabId, { url }) : chrome.tabs.reload(tabId));
}

// Resolves once the real page has loaded again.
async function stop(tabId, prev) {
  await setState(tabId, null);
  if (!prev) return;
  const loaded = waitForLoad(tabId); // listen before reloading so a fast load isn't missed
  await stopFramed(tabId);
  await loaded;
}

async function apply(tabId, device, theme) {
  const prev = await getState(tabId);
  const next = { mode: 'framed', device, compare: false, theme };
  await showFramed(tabId, next, prev);
  await setState(tabId, next);
}

async function compare(tabId, theme, devices) {
  const prev = await getState(tabId);
  const next = { mode: 'framed', device: prev?.device || null, compare: true, theme, devices };
  await showFramed(tabId, next, prev);
  await setState(tabId, next);
}

// If a framed tab no longer shows the viewer (user reloaded or navigated, a link targeted the top page),
// forget it and drop its rules.
async function verify(tabId) {
  if (busy.has(tabId) || (await getState(tabId))?.mode !== 'framed' || await viewerAlive(tabId)) return;
  await setState(tabId, null);
  await dropRules(tabId);
}
chrome.tabs.onUpdated.addListener((tabId, info) => { if (info.status === 'complete') verify(tabId); });

// After an install, update or browser restart, nothing from before is trustworthy: old viewers are gone, so drop every leftover rule and state.
const clearAll = () => Promise.all([
  chrome.declarativeNetRequest.getSessionRules()
    .then((rules) => chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: rules.map((r) => r.id) })),
  chrome.storage.session.clear(),
]);
chrome.runtime.onInstalled.addListener(clearAll);
chrome.runtime.onStartup.addListener(clearAll);

// Black toolbar icon on light Chrome, white on dark. offscreen.html watches the colour scheme for us.
const setScheme = (dark) => chrome.action.setIcon({
  path: { 16: `icons/icon16${dark ? '-white' : ''}.png`, 32: `icons/icon32${dark ? '-white' : ''}.png` },
});
const watchScheme = () => chrome.offscreen.createDocument({
  url: 'offscreen.html', reasons: ['MATCH_MEDIA'], justification: 'Match the toolbar icon to light or dark mode.',
}).catch(() => {}); // already open
chrome.runtime.onInstalled.addListener(watchScheme);
chrome.runtime.onStartup.addListener(watchScheme);

chrome.tabs.onRemoved.addListener((tabId) => { setState(tabId, null); dropRules(tabId); });

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'scheme') return void setScheme(msg.dark);
  return handle(msg, reply);
});

// One command at a time per tab: overlapping clicks would otherwise run two takeovers at once.
const queues = new Map();
function serial(tabId, fn) {
  const run = (queues.get(tabId) || Promise.resolve()).then(fn);
  queues.set(tabId, run.catch(() => {}));
  return run;
}

function handle(msg, reply) {
  const { tabId } = msg;
  const run = serial(tabId, async () => {
    await verify(tabId); // the stored state can be stale if the service worker slept through a reload
    if (msg.type === 'apply') return apply(tabId, msg.device, msg.theme);
    if (msg.type === 'compare') return compare(tabId, msg.theme, msg.devices);
    if (msg.type === 'reset') return stop(tabId, await getState(tabId));
  });
  run.then(async () => reply({ state: await getState(tabId) }))
     .catch(async (e) => reply({ state: await getState(tabId), error: e.message }));
  return true; // async reply
}

