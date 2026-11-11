// tabId -> device currently emulated. shortcut: lost if the service worker restarts; the popup then just shows "off".
const active = new Map();

const send = (tabId, method, params) => chrome.debugger.sendCommand({ tabId }, method, params);

async function apply(tabId, d) {
  const prev = active.get(tabId);
  if (!prev) await chrome.debugger.attach({ tabId }, '1.3');

  // "fit" shrinks the device to the window, like DevTools' auto-zoom; otherwise a fixed zoom (0.5, 0.75, 1).
  const tab = await chrome.tabs.get(tabId);
  const scale = typeof d.zoom === 'number' ? d.zoom : Math.min(1, tab.width / d.width, tab.height / d.height);

  await send(tabId, 'Emulation.setDeviceMetricsOverride', {
    width: d.width, height: d.height, deviceScaleFactor: d.dpr, mobile: d.mobile, scale,
  });
  await send(tabId, 'Emulation.setTouchEmulationEnabled', { enabled: d.mobile, maxTouchPoints: d.mobile ? 5 : 1 });
  await send(tabId, 'Emulation.setEmitTouchEventsForMouse', { enabled: d.mobile, configuration: 'mobile' });

  const ua = d.ua || '';
  if (ua !== (prev?.ua || '')) {
    await send(tabId, 'Emulation.setUserAgentOverride', { userAgent: ua });
    // Sites sniff the user agent on load, so reload only when it changed.
    await send(tabId, 'Page.reload', {});
  }
  active.set(tabId, d);
}

async function reset(tabId) {
  if (!active.has(tabId)) return;
  active.delete(tabId);
  await chrome.debugger.detach({ tabId }); // detaching drops every override
  await chrome.tabs.reload(tabId);
}

// User clicked "Cancel" on Chrome's debugging bar, or the tab closed.
chrome.debugger.onDetach.addListener(({ tabId }) => active.delete(tabId));

// compare.html adds a frame-header rule scoped to its own tab (rule id = tab id).
// Drop it as soon as that tab closes or leaves the compare page, so real sites keep their framing protection.
const COMPARE = chrome.runtime.getURL('compare.html');
const dropFrameRule = (tabId) => chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId] }).catch(() => {});
chrome.tabs.onRemoved.addListener(dropFrameRule);
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url && !info.url.startsWith(COMPARE)) dropFrameRule(tabId);
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const run = msg.type === 'apply' ? apply(msg.tabId, msg.device)
    : msg.type === 'reset' ? reset(msg.tabId)
    : Promise.resolve();
  run.then(() => reply({ device: active.get(msg.tabId) || null }))
     .catch((e) => reply({ device: active.get(msg.tabId) || null, error: e.message }));
  return true; // async reply
});
