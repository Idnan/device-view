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
const ruleIds = (tabId) => ({ takeover: tabId * 3, frames: tabId * 3 + 1, ua: tabId * 3 + 2 });
const busy = new Set(); // tabs we are reloading ourselves, so onUpdated doesn't treat it as the user leaving

async function setFrameRules(tabId, ua) {
  const ids = ruleIds(tabId);
  const addRules = [{
    id: ids.frames,
    action: { type: 'modifyHeaders', responseHeaders: STRIP.map((header) => ({ header, operation: 'remove' })) },
    condition: { tabIds: [tabId], resourceTypes: ['sub_frame'] },
  }];
  // Every request in a taken-over tab comes from the frames, so this covers the page and its fetches.
  if (ua) addRules.push({
    id: ids.ua,
    action: { type: 'modifyHeaders', requestHeaders: [{ header: 'user-agent', operation: 'set', value: ua }] },
    condition: { tabIds: [tabId], excludedResourceTypes: ['main_frame'] },
  });
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ids.frames, ids.ua], addRules });
}

const dropRules = (tabId) => chrome.declarativeNetRequest
  .updateSessionRules({ removeRuleIds: Object.values(ruleIds(tabId)) }).catch(() => {});

function waitForLoad(tabId) {
  return new Promise((resolve) => {
    const done = (id, info) => {
      if (id === tabId && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(done); resolve(); }
    };
    chrome.tabs.onUpdated.addListener(done);
  });
}

// Reload the tab with its HTML labelled as an image, so the site's own code never runs,
// then inject viewer.js into that same-origin document. Same trick as Responsive Viewer.
// shortcut: a site's service worker can serve cached HTML and bypass this; unregister SWs first if that bites.
async function takeOver(tabId) {
  const { takeover } = ruleIds(tabId);
  busy.add(tabId);
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [takeover],
      addRules: [{
        id: takeover,
        action: { type: 'modifyHeaders', responseHeaders: [{ header: 'content-type', operation: 'set', value: 'image/png' }] },
        condition: { tabIds: [tabId], resourceTypes: ['main_frame'] },
      }],
    });
    const loaded = waitForLoad(tabId);
    await chrome.tabs.reload(tabId);
    await loaded;
  } finally {
    // Never leave the image rule behind: it would break the next normal load of this tab.
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [takeover] });
    busy.delete(tabId);
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: ['shared.js', 'viewer.js'] });
}

async function showFramed(tabId, view, prev) {
  const ua = view.compare ? undefined : view.device.ua;
  await setFrameRules(tabId, ua);
  const fresh = prev?.mode !== 'framed';
  if (fresh) await takeOver(tabId);
  const uaChanged = !fresh && (prev.compare ? undefined : prev.device?.ua) !== ua;
  await chrome.tabs.sendMessage(tabId, { type: 'view', view, reload: uaChanged }, { frameId: 0 });
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

// The user reloaded or navigated a framed tab: the viewer is gone, so forget it and drop its rules.
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'loading' || busy.has(tabId)) return;
  if ((await getState(tabId))?.mode === 'framed') { setState(tabId, null); dropRules(tabId); }
});

chrome.tabs.onRemoved.addListener((tabId) => { setState(tabId, null); dropRules(tabId); });

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const { tabId } = msg;
  const run = msg.type === 'apply' ? apply(tabId, msg.device, msg.full, msg.theme)
    : msg.type === 'compare' ? compare(tabId, msg.theme)
    : msg.type === 'reset' ? getState(tabId).then((s) => stop(tabId, s))
    : Promise.resolve();
  run.then(async () => reply({ state: await getState(tabId) }))
     .catch(async (e) => reply({ state: await getState(tabId), error: e.message }));
  return true; // async reply
});
