// Hidden page: service workers can't read prefers-color-scheme, so this reports it (and every change).
const dark = matchMedia('(prefers-color-scheme: dark)');
const report = () => chrome.runtime.sendMessage({ type: 'scheme', dark: dark.matches });
dark.addEventListener('change', report);
report();
