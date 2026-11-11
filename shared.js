// Loaded by popup.html and compare.html.
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

const DEVICES = [
  { name: 'iPhone SE', width: 375, height: 667, dpr: 2, mobile: true, ua: IOS },
  { name: 'iPhone 15 Pro', width: 393, height: 852, dpr: 3, mobile: true, ua: IOS },
  { name: 'iPhone 15 Pro Max', width: 430, height: 932, dpr: 3, mobile: true, ua: IOS },
  { name: 'Pixel 8', width: 412, height: 915, dpr: 2.625, mobile: true, ua: ANDROID },
  { name: 'Galaxy S24', width: 360, height: 780, dpr: 3, mobile: true, ua: ANDROID },
  { name: 'iPad Mini', width: 768, height: 1024, dpr: 2, mobile: true, ua: IPAD },
  { name: 'iPad Air', width: 820, height: 1180, dpr: 2, mobile: true, ua: IPAD },
  { name: 'iPad Pro 12.9"', width: 1024, height: 1366, dpr: 2, mobile: true, ua: IPAD },
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
