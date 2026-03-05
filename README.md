# FollowGraph

A privacy-first, client-side Chrome/Edge extension that scans your X/Twitter **Following** page and exports your following list.

## Why it works (when others fail)
X uses a **virtualized React list**: off-screen accounts are unmounted from the DOM.
So FollowGraph extracts users **during the scroll loop** (streaming), not only after scrolling ends.

## Features
- Streaming extraction (handles virtualization)
- Shadow DOM on-page overlay (progress + status)
- Export JSON + CSV
- Save last scan in chrome.storage.local
- Popup shows last scan summary + export + diff

## Install (dev)
```bash
npm install
npm run build
```

Load:

* Chrome/Edge -> `chrome://extensions`
* Enable Developer mode
* Load unpacked -> select the `extension/` folder

## Usage

1. Open: `https://x.com/<you>/following` or `https://twitter.com/<you>/following`
2. Click extension icon -> **Scan Following**
3. Watch overlay
4. Export JSON/CSV

## Notes

* No servers, no tracking, no OAuth.
* DOM changes on X can break selectors; file an issue with screenshots/HTML if it does.

MIT Licensed. Made by Shango Bashi.
