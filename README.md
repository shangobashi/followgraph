# FollowGraph

A privacy-first, browser-local scanner and exporter for your own X/Twitter Following list.

## The problem
X's Following page is infinite, virtualized, and slow. You cannot sort, filter, or export your own graph cleanly. Screenshots do not export. Manual scrolling does not scale.

## What FollowGraph does
- Streams accounts out of the live Following page
- Recovers from interrupted scans using checkpoints
- Resolves profile data from captured page API responses plus local API lanes
- Preserves rest IDs and activity metadata
- Exports JSON and CSV
- Keeps everything in your browser: no server access, no OAuth, no tracking

## Why local matters
Most export tools require fragile scrapers, shared credentials, or remote storage. FollowGraph runs entirely in your browser. The latest scan lives in local storage. Nothing leaves your machine.

## Proof bundle
- Acceptance report: `reports/latest.json`
- Synthetic benchmark: 7.5K accounts with 1088 profiles/min modeled run
- Real run benchmark: 3,303 unique accounts in about 2 minutes, with enrichment running locally in a helper tab; no data upload

## Install
1. Download `public/downloads/followgraph-extension.zip`
2. Unzip anywhere
3. Load `extension/` as unpacked in Chrome or Edge
4. Open your `https://x.com/<you>/following` page
5. Use the extension to scan and export

## Reporting issues
Open an issue on GitHub. Include browser, OS, following-count range, and whether the scan stopped during extraction or enrichment.

## License
MIT
