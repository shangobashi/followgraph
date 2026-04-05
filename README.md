# FollowGraph v1.1

A privacy-first, client-side Chrome/Edge extension that scans your X/Twitter **Following** page, exports your following list, and resolves profile activity locally with the v1.1 parallel enrichment pipeline.

## Why it works (when others fail)
X uses a **virtualized React list**: off-screen accounts are unmounted from the DOM.
So FollowGraph extracts users **during the scroll loop** (streaming), not only after scrolling ends.

## Features
- Streaming extraction (handles virtualization)
- Parallel helper-tab enrichment for large follow graphs
- Batched local persistence so activity resolution does not rewrite the full scan on every profile
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
3. Let v1.1 stream the list, then fan out activity checks across helper tabs
4. Export JSON/CSV

## Notes

* No servers, no tracking, no OAuth.
* v1.1 is tuned to cut large enrichment jobs down from multi-day serial runs to same-session processing.
* DOM changes on X can break selectors; file an issue with screenshots/HTML if it does.

MIT Licensed. Made by Shango Bashi.
