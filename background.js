// Two ways to show a tab as a device:
//  framed (default): the tab is taken over by viewer.js, which shows the site in an iframe cut to the device size.
//                    Clean edges, no debugging bar, same origin as the site so logins keep working.
//  full:             chrome.debugger emulation (touch, pixel density, user agent), like DevTools device mode.
// Per-tab state lives in storage.session because the service worker is killed when idle.

const key = (tabId) => `tab:${tabId}`;
const getState = async (tabId) => (await chrome.storage.session.get(key(tabId)))[key(tabId)] || null;
const setState = (tabId, s) => s ? chrome.storage.session.set({ [key(tabId)]: s }) : chrome.storage.session.remove(key(tabId));

// ---------- framed mode ----------

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

// ---------- full emulation mode ----------

const send = (tabId, method, params) => chrome.debugger.sendCommand({ tabId }, method, params);

async function emulate(tabId, d, prev) {
  if (prev?.mode !== 'full') await chrome.debugger.attach({ tabId }, '1.3');

  // "fit" shrinks the device to the window, like DevTools' auto-zoom; otherwise a fixed zoom (0.5, 0.75, 1).
  const tab = await chrome.tabs.get(tabId);
  const scale = typeof d.zoom === 'number' ? d.zoom : Math.min(1, tab.width / d.width, tab.height / d.height);

  await send(tabId, 'Emulation.setDeviceMetricsOverride', {
    width: d.width, height: d.height, deviceScaleFactor: d.dpr, mobile: d.mobile, scale,
  });
  await send(tabId, 'Emulation.setTouchEmulationEnabled', { enabled: d.mobile, maxTouchPoints: d.mobile ? 5 : 1 });
  await send(tabId, 'Emulation.setEmitTouchEventsForMouse', { enabled: d.mobile, configuration: 'mobile' });

  const ua = d.ua || '';
  if (prev?.mode !== 'full' || ua !== (prev.device.ua || '')) {
    await send(tabId, 'Emulation.setUserAgentOverride', { userAgent: ua });
    // Sites sniff the user agent on load, so reload only when it changed.
    await send(tabId, 'Page.reload', {});
  }
}

async function stopFull(tabId) {
  await chrome.debugger.detach({ tabId }).catch(() => {}); // detaching drops every override
  await chrome.tabs.reload(tabId);
}

// ---------- commands ----------

// Resolves once the real page has loaded again.
async function stop(tabId, prev) {
  await setState(tabId, null);
  if (!prev) return;
  const loaded = waitForLoad(tabId); // listen before reloading so a fast load isn't missed
  await (prev.mode === 'framed' ? stopFramed(tabId) : stopFull(tabId));
  await loaded;
}

async function apply(tabId, device, full, theme) {
  let prev = await getState(tabId);
  const mode = full ? 'full' : 'framed';
  if (prev && prev.mode !== mode) {
    await stop(tabId, prev);
    prev = null;
  }
  const next = { mode, device, compare: false, theme };
  if (full) await emulate(tabId, device, prev);
  else await showFramed(tabId, next, prev);
  await setState(tabId, next);
}

async function compare(tabId, theme) {
  let prev = await getState(tabId);
  if (prev?.mode === 'full') {
    await stop(tabId, prev);
    prev = null;
  }
  const next = { mode: 'framed', device: prev?.device || null, compare: true, theme };
  await showFramed(tabId, next, prev);
  await setState(tabId, next);
}

// User clicked "Cancel" on Chrome's debugging bar.
chrome.debugger.onDetach.addListener(async ({ tabId }) => {
  if ((await getState(tabId))?.mode === 'full') setState(tabId, null);
});

// If a framed tab no longer shows the viewer (user reloaded or navigated, a link targeted the top page),
// forget it and drop its rules.
async function verify(tabId) {
  if (busy.has(tabId) || (await getState(tabId))?.mode !== 'framed' || await viewerAlive(tabId)) return;
  await setState(tabId, null);
  await dropRules(tabId);
}
chrome.tabs.onUpdated.addListener((tabId, info) => { if (info.status === 'complete') verify(tabId); });

// After an install, update or browser restart, nothing from before is trustworthy: old viewers and
// debugger sessions are gone, so drop every leftover rule and state.
const clearAll = () => Promise.all([
  chrome.declarativeNetRequest.getSessionRules()
    .then((rules) => chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: rules.map((r) => r.id) })),
  chrome.storage.session.clear(),
]);
chrome.runtime.onInstalled.addListener(clearAll);
chrome.runtime.onStartup.addListener(clearAll);

chrome.tabs.onRemoved.addListener((tabId) => { setState(tabId, null); dropRules(tabId); });

chrome.runtime.onMessage.addListener((msg, _sender, reply) => handle(msg, reply));

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
    if (msg.type === 'apply') return apply(tabId, msg.device, msg.full, msg.theme);
    if (msg.type === 'compare') return compare(tabId, msg.theme);
    if (msg.type === 'reset') return stop(tabId, await getState(tabId));
  });
  run.then(async () => reply({ state: await getState(tabId) }))
     .catch(async (e) => reply({ state: await getState(tabId), error: e.message }));
  return true; // async reply
}

