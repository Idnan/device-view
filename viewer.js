// Injected (after shared.js) into a tab that background.js reloaded as a dead image document.
// Runs on the site's own origin, so the iframes below are same-origin: cookies and logins work.
(() => {
  const url = location.href;
  const root = document.documentElement;
  root.innerHTML = '<head><meta charset="utf-8"><title></title><style></style></head><body></body>';
  document.title = `Device View \u00b7 ${location.host}`;
  document.querySelector('style').textContent = `
    :root { --stage: #ecebe6; --ink: #0a0a0a; --muted: #4a4a46; color-scheme: light; }
    :root[data-theme="dark"] { --stage: #141415; --ink: #f4f4f0; --muted: #b4b4ae; color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; }
    body { background: var(--stage); color: var(--ink); font: 600 13px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
    main { min-height: 100%; display: flex; gap: 28px; padding: 24px; }
    main.single { align-items: center; justify-content: center; }
    main.compare { align-items: flex-start; overflow-x: auto; }
    figure { margin: 0; flex: none; display: flex; flex-direction: column; gap: 8px; }
    figcaption { display: flex; justify-content: space-between; gap: 16px; font-weight: 700; }
    figcaption span { color: var(--muted); font-weight: 500; font-variant-numeric: tabular-nums; }
    .frame { overflow: hidden; border: 2px solid var(--ink); border-radius: 14px; background: #fff; box-shadow: 4px 4px 0 var(--ink); }
    iframe { display: block; border: 0; transform-origin: 0 0; background: #fff; }
  `;

  const main = document.createElement('main');
  document.body.append(main);
  let view = null;
  let layout = null;

  // Where the (first) frame has navigated to, so switching layouts keeps the user's page.
  const frameUrl = () => {
    try { return main.querySelector('iframe')?.contentWindow.location.href || url; } catch { return url; }
  };

  function figure(d, src) {
    const fig = document.createElement('figure');
    fig.innerHTML = '<figcaption><b></b><span></span></figcaption><div class="frame"><iframe></iframe></div>';
    fig.querySelector('iframe').src = src;
    return fig;
  }

  function build() {
    const src = frameUrl();
    main.className = layout;
    main.replaceChildren(...(layout === 'compare' ? DEVICES : [view.device]).map((d) => figure(d, src)));
  }

  function size() {
    const list = layout === 'compare' ? DEVICES : [view.device];
    main.querySelectorAll('figure').forEach((fig, i) => {
      const d = list[i];
      const s = layout === 'compare'
        ? Math.min(1, (innerHeight - 110) / d.height)
        : typeof d.zoom === 'number' ? d.zoom : Math.min(1, (innerWidth - 56) / d.width, (innerHeight - 96) / d.height);
      fig.querySelector('b').textContent = d.name;
      fig.querySelector('span').textContent = `${d.width}\u00d7${d.height}${s < 1 ? ` \u00b7 ${Math.round(s * 100)}%` : ''}`;
      const frame = fig.querySelector('.frame');
      frame.style.width = `${Math.round(d.width * s) + 4}px`; // +4 for the 2px border on each side
      frame.style.height = `${Math.round(d.height * s) + 4}px`;
      const iframe = fig.querySelector('iframe');
      iframe.title = d.name;
      iframe.width = d.width;
      iframe.height = d.height;
      iframe.style.transform = `scale(${s})`;
    });
  }

  function render(next, reload) {
    view = next;
    root.dataset.theme = view.theme === 'dark' ? 'dark' : 'light';
    const want = view.compare ? 'compare' : 'single';
    if (want !== layout) { layout = want; build(); }
    else if (reload) main.querySelectorAll('iframe').forEach((f) => { f.src = frameUrl(); });
    size();
  }

  addEventListener('resize', () => view && size());
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type === 'view') render(msg.view, msg.reload);
    reply(true);
  });
})();
