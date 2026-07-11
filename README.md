# FollowGraph v1.5.0 beta

FollowGraph is a privacy-first Chrome/Edge extension that scans your X/Twitter **Following** page, exports the list, and classifies recent account activity locally.

## What changed in v1.5.0 beta

- Enrichment no longer sends every unresolved account through a full profile-page navigation.
- Helper tabs bootstrap X's authenticated timeline operation once, then relay subsequent accounts through direct in-browser API calls.
- Only accounts that the API relay cannot resolve return to the profile-page fallback.
- The fast path requires a captured timeline operation, avoiding queue-wide false starts when only a user lookup operation is available.
- Helper tabs are capped at 8-12 concurrent API relays to protect browser responsiveness and reduce X rate-limit pressure.
- The extension records scan, API-fast-path, API-relay, and DOM-fallback throughput in the saved scan report.

## Why it works

X uses a **virtualized React list**: off-screen accounts are unmounted from the DOM. FollowGraph extracts users while the page scrolls, captures the live Following GraphQL operation, and saves every unique profile as it appears.

For activity resolution, FollowGraph first uses embedded Following data. It then uses the authenticated X web API already available in the logged-in browser session. If a timeline operation is not available on the Following page, a small helper-tab pool bootstraps it once and keeps resolving the remaining queue through API relays. A profile page is opened only for individual API misses.

No separate OAuth login, server upload, or third-party account access is involved.

## Features

- Streaming extraction for virtualized X lists
- Cursor-aware Following API pagination
- CSV and JSON exports
- Local scan checkpoints and progress recovery
- Activity classification: Active, Dormant, Inactive, and Unknown
- API-first enrichment with rate-limit backoff
- Helper-tab API relay with bounded DOM fallback
- Local inactive-over-30-day review and explicit unfollow flow
- Saved throughput telemetry and reports in `chrome.storage.local`

## Install

### Prebuilt beta package

Download `public/downloads/followgraph-extension.zip` from the landing page or GitHub release assets, unzip it somewhere permanent, then:

1. Open `chrome://extensions` in Chrome or the extensions page in Edge.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the unzipped `extension/` folder.

### Build from source

```bash
npm install
npm run build
```

Load the generated `extension/` folder as an unpacked extension.

## Usage

1. Open `https://x.com/<you>/following` or `https://twitter.com/<you>/following`.
2. Click the FollowGraph extension icon and select **Scan Following**.
3. Leave the Following tab open while the scan finishes.
4. FollowGraph begins API enrichment automatically when activity is unresolved.
5. Review activity and inactive-over-30-day accounts in the popup, then export JSON/CSV or explicitly select accounts for unfollow review.

## Validation

```bash
npx tsc --noEmit
npm run test:scan-completion
npm run replay:target
npm run benchmark:target
npm run build
```

The target replay and synthetic benchmark model 7,500 accounts against a 42-minute gate. They verify scheduler behavior, not live X behavior. The authoritative live result is the saved scan report after a real scan, including API-relay and DOM-fallback throughput.

## Notes

- X can change its DOM and internal web API without notice. API misses fall back to profile pages rather than silently inventing activity.
- Actual throughput depends on the X session, rate limits, network latency, and the fraction of accounts requiring DOM fallback.
- FollowGraph is independent and is not affiliated with, endorsed by, or sponsored by X or Twitter.

MIT Licensed. Made by Shango Bashi.
