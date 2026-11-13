# Device View

A Chrome extension to preview any website at phone, tablet, desktop or custom sizes without opening DevTools.

## Features

- **10 device presets**: iPhone SE, iPhone 15 Pro / Pro Max, Pixel 8, Galaxy S24, iPad Mini / Air / Pro, Laptop and Desktop
- **Custom sizes**: enter any width and height
- **Rotate** between portrait and landscape, keeping your scroll position
- **Zoom**: 50%, 75%, 100%, or Fit to the window
- **Compare**: every device side by side in one tab
- **Mobile user agent**: phone and tablet presets send their user agent to the server, so sites that detect mobile serve their mobile version
- **Light and dark themes**, with a toolbar icon that follows Chrome's mode

## Install

Device View isn't on the Chrome Web Store yet. To install it from source:

1. Clone or download this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the repository folder.

## Usage

Open any `http(s)` page, click the Device View icon and pick a device. The tab switches to the device view; click the power button to return to the normal page. You stay on whatever page you navigated to inside the device frame.

## How it works

The tab is reloaded with its HTML marked as an image, so the site's own code never runs in the top page. Device View then draws its viewer there and shows the site in iframes cut to the exact device size. Because the viewer is on the site's own origin, cookies and logins keep working.

Session rules (`declarativeNetRequest`), scoped to that tab only, remove the headers that would block framing (`X-Frame-Options`, `Content-Security-Policy` and the cross-origin policies) and set the device's user agent on requests.

### Permissions

| Permission | Why |
| --- | --- |
| `declarativeNetRequest` | Tab-scoped rules that allow framing and set the user agent |
| `scripting` | Inject the device viewer into the tab |
| `tabs` | Reload the tab and track its state |
| `storage` | Remember each tab's device while the extension's background worker sleeps |
| `offscreen` | Detect Chrome's light/dark mode to switch the toolbar icon |
| `<all_urls>` | Work on any site you open |

No data leaves your browser.

## Limitations

- Only `http(s)` pages can be viewed. `chrome://` pages and the Chrome Web Store are off-limits to extensions.
- The user agent is sent to servers, but scripts in the page still see your desktop browser's `navigator.userAgent`, and touch input and pixel density aren't emulated.
- Sites that block framing with scripts, or that serve their HTML from a service worker, may not display correctly.

## Credits

- [Space Grotesk](https://github.com/floriankarsten/space-grotesk) font, SIL Open Font License 1.1 (`fonts/OFL.txt`)
- Icon based on [Material Symbols](https://github.com/google/material-design-icons) "devices", Apache License 2.0 (`icons/LICENSE-material-symbols.txt`)

## License

[MIT](LICENSE) © 2026 Adnan Ahmed
