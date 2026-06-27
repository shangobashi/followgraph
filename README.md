# FollowGraph v1.4.0 beta

A privacy-first Chrome/Edge extension that scans your X/Twitter **Following** page, exports your following list, and resolves profile activity locally with faster incremental scan parsing, captured API enrichment, cursor-aware scan completion, and saved-checkpoint recovery.

## What changed in v1.4.0 beta

- The scanner now parses newly mounted Following cells from the mutation stream instead of fully reparsing the visible list on every scroll tick.
- A periodic full-parse fallback remains in place to preserve correctness if X changes DOM mounting behavior.
- Progress rendering is throttled to reduce overlay work during large scans.
- Profile-page fallback now reuses a single signal snapshot per poll, reducing repeated full-body text reads.
- The release keeps the v1.3.7 captured API enrichment, saved-checkpoint recovery, and cursor-aware scan completion safeguards.

## Previous resolver changes

- The scanner now uses captured Following pagination cursors before deciding the list is finished.
- Mid-list loading stalls with a bottom cursor no longer complete the scan or start enrichment early.
- Terminal Following responses without a bottom cursor can still finish cleanly even if X leaves a loading spinner visible.
- Enrichment can start from any saved checkpoint, so a stuck scan with saved users is no longer trapped behind Resume scan.
- Stale scan sessions recover automatically, helper-tab fallback starts cleanly after API fast path, checkpoint writes cannot overwrite phase transitions, and destructive review actions are blocked until incomplete scans are resolved.

- API-first activity enrichment from the logged-in X web session
- Page-world capture of real X GraphQL responses during the scan
- `restId` persistence so most unresolved accounts skip screen-name lookup
- Adaptive 64-96 lane scheduler for large follow graphs with rate-limit retry
- Helper-tab DOM enrichment retained as fallback when X API discovery fails
- Faster fallback scroll loop for X's virtualized React list
- Batched local persistence during enrichment
- Throughput telemetry and run reports for the 90% resolution target
- Local 7.5K-scale benchmark and acceptance gate

## Why it works

X uses a **virtualized React list**: off-screen accounts are unmounted from the DOM.
FollowGraph extracts users as X mounts new cells, keeps a periodic full-parse fallback for safety, captures real X GraphQL responses in the page context, persists `restId` and embedded activity metadata, and resolves profile activity through X's authenticated web API from the user's own browser session before opening helper tabs.

That removes the old hot path where thousands of accounts each required a rendered profile page, content-script injection, DOM polling, and tab navigation. Protected, suspended, unavailable, and no-post accounts are treated as resolved terminal states instead of failed unknowns.

## Features

- Streaming extraction for virtualized lists
- Main-world X API response capture
- `restId`-based timeline lookup
- API-first profile activity resolver
- Adaptive concurrency with rate-limit backoff and retry
- Parallel helper-tab fallback for schema drift and API misses
- Batched local persistence
- Shadow DOM on-page overlay
- Export JSON + CSV
- Save last scan in `chrome.storage.local`
- Popup shows last scan summary, resolution rate, exports, worker progress, and throughput

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
3. Let v1.4.0 beta stream the list incrementally, run captured API enrichment, recover from X load failures, and fall back to helper tabs only where needed
4. Export JSON/CSV

## Benchmark

```bash
npm run replay:report
npm run acceptance
```

For a synthetic scheduler smoke test:

```bash
npm run benchmark:report
npm run acceptance:synthetic
```

The replay report models the v1.4 beta architecture at 7.5K accounts and writes `reports/latest.json`. The default acceptance gate rejects synthetic reports and fails unless the report resolves at least 90% within 90 minutes for at least 7.5K accounts.

Replay is not a replacement for a real X run. Real-world proof comes from the exported scan report produced after a live X run. Real-world speed depends on X session health, network latency, API availability, rate limits, and the number of accounts that need DOM fallback.

## Notes

* No servers, tracking, OAuth app, or third-party account access.
* All work runs in your browser with your logged-in X session.
* X DOM/API changes can break selectors or operation discovery; helper-tab fallback is intentionally kept to preserve resiliency.

MIT Licensed. Made by Shango Bashi.
