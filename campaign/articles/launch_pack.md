# Social Launch Pack

## Short platform notes
- Keep lead with pain on X/Twitter/Reddit
- Lead with privacy first
- Lead with proof second
- Add one artifact or screenshot third

## X/Twitter thread
1. The X/Twitter Following page is not designed for cleanup.
2. I needed a way to extract my own follows without giving any service my login flow.
3. FollowGraph is a local Chrome/Edge scanner for your Following list.
4. It streams the virtualized list, checkpoints progress, resolves using captured page API data, and exports CSV/JSON.
5. No server touch, no tracking, no separate OAuth.
6. Repo: https://github.com/shangobashi/followgraph
7. Download: https://followgraph.issalabs.xyz/downloads/followgraph-extension.zip
8. If you’ve manually exported before, tell me the one thing that always breaks.

## Reddit starter
Title: I made a privacy-first way to export my full X/Twitter Following list
Body:
I hit the same issue every few months: my following count keeps rising, X offers no clean export, and most third-party tools want way too much access for what should be a local operation.
I built a Chrome/Edge extension that scans your own Following page and exports CSV/JSON from the browser.
- no server upload
- no OAuth
- checkpoint/resume after interruptions
- uses captured page API data where available
Repo and zip are linked below.
I’m looking for honest feedback on whether the first-run instructions are clear enough for non-devs.
Link: https://followgraph.issalabs.xyz

## Hacker News headline
Show HN: FollowGraph – local X/Twitter Following exporter with checkpoint/resume
Body:
Built after failing to find a sensible export path for my own Following list.
Features:
- streams from the live Following page
- handles X’s virtualized loading
- checkpoint/resume between runs
- CSV and JSON export
- runs fully locally
MIT, with source at https://github.com/shangobashi/followgraph
Feedback appreciated on recovery behavior, non-dev install clarity, and whether the mental model is clear.
