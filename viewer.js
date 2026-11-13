// Injected (after shared.js) into a tab that background.js reloaded as a dead image document.
// Runs on the site's own origin, so the iframes below are same-origin: cookies and logins work.
(() => {
  if (window.__deviceView) return; // already running in this document
  window.__deviceView = true; // background.js checks this to know the viewer is still the top document
  const url = location.href;
  const root = document.documentElement;
  root.innerHTML = '<head><meta charset="utf-8"><title></title><style></style></head><body></body>';
  document.title = `Device View \u00b7 ${location.host}`;
  document.querySelector('style').textContent = `
    :root { --stage: #ecebe6; --card: #fff; --ink: #0a0a0a; --muted: #4a4a46; --edge: #0a0a0a; color-scheme: light; }
    :root[data-theme="dark"] { --stage: #141415; --card: #1f1f21; --ink: #f4f4f0; --muted: #b4b4ae; --edge: #ffd60a; color-scheme: dark; }
    * { box-sizing: border-box; }
    html { height: 100%; }
    body { margin: 0; min-height: 100%; display: flex; flex-direction: column; background: var(--stage); color: var(--ink);
           font: 600 13px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
    main { flex: 1 0 auto; display: flex; gap: 28px; padding: 24px; }
    /* Toolbar above the device(s): rotate, zoom, turn off. Compare shows only turn off. */
    .bar { flex: none; display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; padding: 16px 24px 0; }
    .bar button { height: 32px; border: 2px solid var(--ink); border-radius: 8px; background: var(--card); color: var(--ink);
                  font: inherit; font-size: 12px; cursor: pointer; transition: transform .08s, box-shadow .08s; }
    .bar > button { padding: 0 12px; }
    .bar > button:hover { transform: translate(-1px, -1px); box-shadow: 2px 2px 0 var(--ink); }
    .bar > button:active { transform: none; box-shadow: none; }
    .bar .icon { width: 32px; padding: 0; display: grid; place-items: center; }
    .bar .icon svg { width: 15px; height: 15px; }
    .bar .seg { display: flex; border: 2px solid var(--ink); border-radius: 8px; overflow: hidden; }
    .bar .seg button { height: 28px; min-width: 50px; border: 0; border-radius: 0; background: var(--card); }
    .bar .seg button + button { border-left: 2px solid var(--ink); }
    .bar .seg button:hover:not([aria-pressed="true"]) { background: #ffd60a; color: #0a0a0a; }
    .bar .seg button[aria-pressed="true"] { background: var(--ink); color: var(--stage); }
    .bar.compare .single-only { display: none; }
    .bar.busy { opacity: .6; pointer-events: none; }
    main.single figure { margin: auto; } /* centres, but unlike justify-content:center never cuts off a frame wider than the window */
    main.compare { align-items: flex-start; overflow-x: auto; }
    figure { margin: 0; flex: none; display: flex; flex-direction: column; gap: 8px; }
    figcaption { display: flex; justify-content: space-between; gap: 16px; font-weight: 700; }
    figcaption span { color: var(--muted); font-weight: 500; font-variant-numeric: tabular-nums; }
    figcaption i { font-style: normal; color: var(--muted); font-weight: 500; }
    .frame { position: relative; overflow: hidden; border: 2px solid var(--edge); border-radius: 14px; background: #fff; box-shadow: 4px 4px 0 var(--edge); }
    iframe { display: block; border: 0; transform-origin: 0 0; background: #fff; }
    .frame.loading::before { content: ''; position: absolute; inset: 0; z-index: 1; background: rgb(255 255 255 / .45); } /* see-through: a reload keeps the old page visible; z-index because the scaled iframe paints above unindexed siblings */
    .frame.loading::after { content: ''; position: absolute; z-index: 2; top: 50%; left: 50%; width: 28px; height: 28px; margin: -14px 0 0 -14px; border: 3px solid #d8d7d2; border-top-color: #0a0a0a; border-radius: 50%; animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .frame.loading::after { animation-duration: 3s; } }
  `;

  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.innerHTML = `
    <button class="single-only" data-act="rotate" title="Rotate (R)">Rotate</button>
    <div class="seg single-only" role="group" aria-label="Zoom">
      <button data-zoom="0.5" title="50% (1)">50%</button><button data-zoom="0.75" title="75% (2)">75%</button><button data-zoom="1" title="100% (3)">100%</button><button data-zoom="fit" title="Fit to window (F)">Fit</button>
    </div>
    <button class="icon" data-act="off" aria-label="Turn off" title="Turn off"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 3v9"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/></svg></button>`;
  const main = document.createElement('main');
  document.body.append(bar, main);
  let view = null;
  let layout = null;

  // Where the (first) frame has navigated to, so switching layouts keeps the user's page.
  const frameUrl = () => {
    try { return main.querySelector('iframe')?.contentWindow.location.href || url; } catch { return url; }
  };

  function figure(d, src) {
    const fig = document.createElement('figure');
    fig.innerHTML = '<figcaption><b></b><span></span></figcaption><div class="frame"><iframe></iframe></div>';
    const iframe = fig.querySelector('iframe');
    iframe.addEventListener('load', () => { clearTimeout(iframe.spin); iframe.parentElement.classList.remove('loading'); });
    load(iframe, src);
    return fig;
  }

  // The spinner only appears if a load takes a moment, so quick device switches don't flash it.
  function load(iframe, src) {
    clearTimeout(iframe.spin);
    iframe.spin = setTimeout(() => iframe.parentElement.classList.add('loading'), 300);
    iframe.src = src;
  }

  function build() {
    const src = frameUrl();
    main.className = layout;
    main.replaceChildren(...(layout === 'compare' ? (view.devices || DEVICES) : [view.device]).map((d) => figure(d, src)));
  }

  // Fit: shrink to the window. Phones and tablets use the scale that fits BOTH orientations, so rotating
  // doesn't make the same device look bigger; computers never rotate, so they just fit as shown.
  const fit = (w, h) => Math.min(1, (innerWidth - 56) / w, (innerHeight - 96 - bar.offsetHeight) / h);
  const fitScale = (d) => (d.mobile ? Math.min(fit(d.width, d.height), fit(d.height, d.width)) : fit(d.width, d.height));

  function size() {
    const list = layout === 'compare' ? (view.devices || DEVICES) : [view.device];
    main.querySelectorAll('figure').forEach((fig, i) => {
      const d = list[i];
      const s = layout === 'compare'
        ? Math.min(1, (innerHeight - 110 - bar.offsetHeight) / d.height)
        : typeof d.zoom === 'number' ? d.zoom : fitScale(d);
      const orientation = d.width > d.height ? 'Landscape' : d.width < d.height ? 'Portrait' : '';
      fig.querySelector('b').replaceChildren(d.name,
        ...(orientation ? [Object.assign(document.createElement('i'), { textContent: ` \u00b7 ${orientation}` })] : []));
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
    bar.classList.toggle('compare', want === 'compare');
    bar.querySelector('[data-act="off"]').title = want === 'compare' ? 'Exit compare' : 'Turn off';
    const zoom = String(view.device?.zoom ?? 'fit');
    for (const b of bar.querySelectorAll('[data-zoom]')) b.setAttribute('aria-pressed', String(b.dataset.zoom === zoom));
    if (want !== layout) { layout = want; build(); }
    else if (reload) main.querySelectorAll('iframe').forEach((f) => load(f, frameUrl()));
    size();
  }

  // Toolbar commands go through background.js like the popup's, so state stays in one place;
  // it answers with a 'view' message that re-renders this page (or navigates away for turn off).
  let busy = false;
  function command(msg) {
    if (busy || !view) return;
    busy = true;
    bar.classList.add('busy');
    chrome.runtime.sendMessage({ theme: view.theme, ...msg }).catch(() => {}).finally(() => {
      busy = false;
      bar.classList.remove('busy');
    });
  }
  const act = {
    rotate: () => command({ type: 'apply', device: { ...view.device, width: view.device.height, height: view.device.width } }),
    zoom: (z) => command({ type: 'apply', device: { ...view.device, zoom: z === 'fit' ? 'fit' : +z } }),
    off: () => command({ type: 'reset' }),
  };
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.zoom) act.zoom(b.dataset.zoom); else act[b.dataset.act]();
  });
  // Shortcuts work while this page (not the site inside the frame) has focus.
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || layout !== 'single') return;
    const key = e.key.toLowerCase();
    const zoom = { 1: '0.5', 2: '0.75', 3: '1', f: 'fit' }[key];
    if (key === 'r') act.rotate(); else if (zoom) act.zoom(zoom); else return;
    e.preventDefault();
  });

  addEventListener('resize', () => view && size());
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type === 'view') render(msg.view, msg.reload);
    reply(true);
  });
})();
