# FollowGraph v1.3

A privacy-first Chrome/Edge extension that scans your X/Twitter **Following** page, exports your following list, and resolves profile activity locally with a v1.3 API-first enrichment pipeline.

## What changed in v1.3

- API-first activity enrichment from the logged-in X web session
- Adaptive 48-96 lane scheduler for large follow graphs
- Helper-tab DOM enrichment retained as fallback when X API discovery fails
- Faster fallback scroll loop for X's virtualized React list
- Batched local persistence during enrichment
- Throughput telemetry in job state and popup status
- Local 7.5K-scale benchmark harness

## Why it works

X uses a **virtualized React list**: off-screen accounts are unmounted from the DOM.
FollowGraph still extracts users during the scroll loop when DOM fallback is needed, but v1.3 now tries to resolve profile activity through X's authenticated web API from the user's own browser session before opening helper tabs.

That removes the old hot path where thousands of accounts each required a rendered profile page, content-script injection, DOM polling, and tab navigation.

## Features

- Streaming extraction for virtualized lists
- API-first profile activity resolver
- Adaptive concurrency with rate-limit backoff
- Parallel helper-tab fallback for schema drift and API misses
- Batched local persistence
- Shadow DOM on-page overlay
- Export JSON + CSV
- Save last scan in `chrome.storage.local`
- Popup shows last scan summary, exports, worker progress, and throughput

## Install

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
3. Let v1.3 stream the list, run API-fast enrichment, and fall back to helper tabs only where needed
4. Export JSON/CSV

## Benchmark

```bash
npm run benchmark -- 7500 48 350
```

The benchmark models the v1.3 scheduler at 7.5K accounts. Real-world speed depends on X session health, network latency, API availability, rate limits, and the number of accounts that need DOM fallback.

## Notes

* No servers, tracking, OAuth app, or third-party account access.
* All work runs in your browser with your logged-in X session.
* X DOM/API changes can break selectors or operation discovery; helper-tab fallback is intentionally kept to preserve resiliency.

MIT Licensed. Made by Shango Bashi.
