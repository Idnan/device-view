// Loaded by popup.html and injected with viewer.js.
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

// Update yearly: newest flagships (Galaxy Jan-Feb, Pixel Aug, iPhone Sep). Sizes are CSS px in portrait.
const DEVICES = [
  { name: 'iPhone 18 Pro', width: 402, height: 874, dpr: 3, mobile: true, ua: IOS },
  { name: 'iPhone 18 Pro Max', width: 440, height: 956, dpr: 3, mobile: true, ua: IOS },
  { name: 'Pixel 11 Pro', width: 427, height: 952, dpr: 3, mobile: true, ua: ANDROID },
  { name: 'Pixel 11 Pro XL', width: 448, height: 997, dpr: 3, mobile: true, ua: ANDROID },
  { name: 'Galaxy S26', width: 360, height: 780, dpr: 3, mobile: true, ua: ANDROID },
  { name: 'Galaxy S26 Ultra', width: 412, height: 891, dpr: 3.5, mobile: true, ua: ANDROID },
  { name: 'iPad mini', width: 744, height: 1133, dpr: 2, mobile: true, ua: IPAD },
  { name: 'iPad Pro 13"', width: 1032, height: 1376, dpr: 2, mobile: true, ua: IPAD },
  { name: 'Laptop', width: 1366, height: 768, dpr: 1, mobile: false },
  { name: 'Desktop', width: 1920, height: 1080, dpr: 1, mobile: false },
];

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
