# README Campaign Inject

## One-line pitch
FollowGraph is a privacy-first, browser-local scanner and exporter for your own X/Twitter Following list.

## Pain first
X’s Following page is infinite, virtualized, and slow. You cannot sort, filter, or audit it cleanly. Screenshots do not export. Manual scrolling does not scale.

## What FollowGraph does
- Streams accounts out of the live Following page
- Recovers from interrupted scans using checkpoints
- Resolves profile data from captured page API responses plus local API lanes
- Preserves rest IDs and activity metadata
- Exports JSON and CSV
- Keeps everything in your browser: no server access, no OAuth, no tracking

## Why it exists
I kept losing track of accounts I followed, and existing export options either required fragile third-party scrapers or forced sharing account-related data with a remote service. FollowGraph is the local alternative I wanted.

## Install
1. Download `public/downloads/followgraph-extension.zip`
2. Unzip anywhere
3. Load `extension/` as unpacked in Chrome or Edge
4. Open your `https://x.com/<you>/following` page
5. Use the extension to scan and export

## Proof
- Acceptance report: `reports/latest.json`
- Synthetic benchmark: 7.5K accounts, 1088 profiles/min modeled run
- Real-world speed depends on session health, API availability, and rate limits

## Reporting issues
Open an issue on GitHub. Include browser, OS, and whether the scan stopped on a specific account or selector.

## License
MIT
