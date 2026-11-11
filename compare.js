const MAX_HEIGHT = 640; // every frame is scaled so its height fits this, keeping the row scannable

initTheme(document.getElementById('theme'));

(async () => {
  const url = new URLSearchParams(location.search).get('url') || '';
  if (!/^https?:\/\//.test(url)) {
    document.getElementById('frames').outerHTML = '<p id="error">Open Compare from the popup on an http(s) page.</p>';
    return;
  }
  document.getElementById('url').textContent = url;
  document.title = `Compare · ${new URL(url).host}`;

  // Most sites forbid being framed (X-Frame-Options / CSP frame-ancestors).
  // Strip those headers, but only for frames inside this tab.
  const { id: tabId } = await chrome.tabs.getCurrent();
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [tabId],
    addRules: [{
      id: tabId,
      action: {
        type: 'modifyHeaders',
        responseHeaders: [
          { header: 'x-frame-options', operation: 'remove' },
          { header: 'content-security-policy', operation: 'remove' },
        ],
      },
      condition: { tabIds: [tabId], resourceTypes: ['sub_frame'] },
    }],
  });

  for (const d of DEVICES) {
    const scale = Math.min(1, MAX_HEIGHT / d.height);
    const fig = document.createElement('figure');
    fig.innerHTML = `
      <figcaption class="display"><b></b><span>${d.width}×${d.height}</span></figcaption>
      <div class="frame" style="width:${Math.round(d.width * scale)}px;height:${Math.round(d.height * scale)}px">
        <iframe width="${d.width}" height="${d.height}" style="transform:scale(${scale})"></iframe>
      </div>`;
    fig.querySelector('b').textContent = d.name;
    fig.querySelector('iframe').src = url;
    fig.querySelector('iframe').title = d.name;
    document.getElementById('frames').append(fig);
  }

  document.getElementById('reload').onclick = () => {
    for (const f of document.querySelectorAll('iframe')) f.src = url;
  };
})();
