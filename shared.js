// Loaded by popup.html and injected with viewer.js.
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

// Every built-in device. Update yearly: add new flagships here (Galaxy Jan-Feb, Pixel Aug, iPhone Sep),
// then swap them into DEFAULTS. Sizes are CSS px in portrait.
const CATALOG = [
  { name: 'iPhone 18 Pro', width: 402, height: 874, dpr: 3, mobile: true, ua: IOS },
  { name: 'iPhone 18 Pro Max', width: 440, height: 956, dpr: 3, mobile: true, ua: IOS },
  { name: 'iPhone Air', width: 420, height: 912, dpr: 3, mobile: true, ua: IOS },
  { name: 'iPhone 17', width: 402, height: 874, dpr: 3, mobile: true, ua: IOS },
  { name: 'iPhone 16e', width: 390, height: 844, dpr: 3, mobile: true, ua: IOS },
  { name: 'iPhone SE', width: 375, height: 667, dpr: 2, mobile: true, ua: IOS },
  { name: 'Pixel 11 Pro', width: 427, height: 952, dpr: 3, mobile: true, ua: ANDROID },
  { name: 'Pixel 11 Pro XL', width: 448, height: 997, dpr: 3, mobile: true, ua: ANDROID },
  { name: 'Pixel 10', width: 412, height: 924, dpr: 2.625, mobile: true, ua: ANDROID },
  { name: 'Galaxy S26', width: 360, height: 780, dpr: 3, mobile: true, ua: ANDROID },
  { name: 'Galaxy S26 Ultra', width: 412, height: 891, dpr: 3.5, mobile: true, ua: ANDROID },
  { name: 'Galaxy A55', width: 360, height: 800, dpr: 2.25, mobile: true, ua: ANDROID },
  { name: 'iPad mini', width: 744, height: 1133, dpr: 2, mobile: true, ua: IPAD },
  { name: 'iPad Air 11"', width: 820, height: 1180, dpr: 2, mobile: true, ua: IPAD },
  { name: 'iPad Pro 11"', width: 834, height: 1210, dpr: 2, mobile: true, ua: IPAD },
  { name: 'iPad Pro 13"', width: 1032, height: 1376, dpr: 2, mobile: true, ua: IPAD },
  { name: 'Laptop', width: 1366, height: 768, dpr: 1, mobile: false },
  { name: 'MacBook Pro 14"', width: 1512, height: 982, dpr: 2, mobile: false },
  { name: 'MacBook Pro 16"', width: 1728, height: 1117, dpr: 2, mobile: false },
  { name: 'Desktop', width: 1920, height: 1080, dpr: 1, mobile: false },
  { name: 'Desktop QHD', width: 2560, height: 1440, dpr: 1, mobile: false },
];

// The list everyone gets until they edit their own (popup.js keeps edited lists in chrome.storage.sync).
const DEFAULTS = ['iPhone 18 Pro', 'iPhone 18 Pro Max', 'Pixel 11 Pro', 'Pixel 11 Pro XL', 'Galaxy S26',
  'Galaxy S26 Ultra', 'iPad mini', 'iPad Pro 13"', 'Laptop', 'Desktop'];
const DEVICES = DEFAULTS.map((name) => CATALOG.find((d) => d.name === name));

// Light/dark: follows the system until the user picks one, then remembers it.
function initTheme(button) {
  const root = document.documentElement;
  const set = (theme) => {
    if (theme) root.dataset.theme = theme;
    root.classList.toggle('dark', theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
  };
  set(localStorage.getItem('theme'));
  button.onclick = () => {
    const next = root.classList.contains('dark') ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    set(next);
  };
}
