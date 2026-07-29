# LAUNCH_READY PROOF PACKAGE

## Verified Proof
Real scan screenshot: `C:\Users\Shango\Pictures\Screenshots\Screenshot 2026-06-30 172830.png`
- Extracted unique: 3303
- Rounds: 196
- Idle rounds: 10
- Delay: 420ms
- Elapsed: 2:02
- Status: Scan complete; activity enrichment running in helper tab
- Privacy line: No data leaves your browser

## One-liner
Don’t scroll your way out of a messy Following list. Scan it, resolve it, export it.

## Channel Posts

### Hacker News
Title: Show HN: FollowGraph – local X/Twitter Following exporter with checkpoint/resume
Body:
Built after failing to find a sensible export path for my own Following list.
- streams from the live Following page
- handles X’s virtualized loading
- checkpoint/resume between runs
- CSV and JSON export
- runs fully locally
MIT, source: https://github.com/shangobashi/followgraph
Site: https://followgraph.issalabs.xyz
Proof: real scan exported 3,303 accounts in about 2 minutes; enrichment runs locally in a helper tab; no server touch.
Feedback wanted on recovery behavior, non-dev install clarity, and whether the mental model is clear.

### Reddit r/Twitter
Title: I made a privacy-first way to export my full X/Twitter Following list
Body:
I hit the same issue every few months: my following count keeps rising, X offers no clean export, and most third-party tools want way too much access for what should be a local operation.
I built a Chrome/Edge extension that scans your own Following page and exports CSV/JSON from the browser.
- no server upload
- no OAuth
- checkpoint/resume after interruptions
- uses captured page API data where available
Real proof: a 3,303-account scan completed in about 2 minutes, with enrichment continuing locally in a helper tab.
Repo and zip are linked below.
I’m looking for honest feedback on whether the first-run instructions are clear enough for non-devs.
Link: https://followgraph.issalabs.xyz

### Reddit r/socialmedia
Title: A local-only way to audit your own X/Twitter following graph
Body:
If you manage presence on X, cleanup and network audits are painful because the Following UI is not built for export.
I built a small Chrome/Edge extension that exports your actual Following data into CSV/JSON without uploading it anywhere.
It also resumes after interruptions and enriches profile activity locally.
I’m testing whether this is useful for creators, operators, and researchers who need clean data without privacy tradeoffs.
Proof artifact included; feedback welcome.
Link: https://followgraph.issalabs.xyz

### Reddit r/startups
Title: Tooling note: I rebuilt personal X following export as a local-first workflow
Body:
When building audience intelligence, I kept hitting a wall: no clean export path for my own following relationships, and every hosted tool felt like overreach for a personal dataset.
I made a local Chrome/Edge scanner instead.
Use case: founders/operators inspecting connections before outreach.
Proof: real live scan, 3,303 accounts, ~2 minutes, no server touch.
Open to feedback from anyone doing social graph work.
Link: https://followgraph.issalabs.xyz

### Reddit r/SideProject
Title: Show SideProject: FollowGraph, local X/Twitter Following scanner/exporter
Body:
I built this because I wanted to audit my own following graph without using fragile scrapers or sharing credentials with a hosted service.
It runs in Chrome/Edge, exports JSON/CSV, and keeps everything local.
Real run proof: 3,303 unique accounts scanned in about 2 minutes; enrichment runs locally even after the main scan finishes.
Looking for testers and feedback on the install/setup flow.
Repo: https://github.com/shangobashi/followgraph
Site: https://followgraph.issalabs.xyz

### Reddit r/selfhosted
Title: Self-hosted-friendly local X/Twitter following exporter, no servers needed
Body:
Most export workflows for X data require remote scraping or account access. I built a client-side only alternative.
Chrome/Edge extension, local scan, checkpoint/resume, JSON/CSV export.
Everything runs in your browser; nothing leaves your machine.
Real scan: 3,303 follows resolved with helper-tab enrichment.
Good fit if you wanted reproducible local exports instead of hosted scrapers.
Repo: https://github.com/shangobashi/followgraph
Site: https://followgraph.issalabs.xyz

### Reddit r/privacy
Title: A client-side X/Twitter following exporter with no server touch and no OAuth
Body:
I wanted a way to export my own Following data without trusting a third-party with credentials or storage.
FollowGraph is a Chrome/Edge extension that scans the live Following page and exports locally.
No server upload, no tracking, no OAuth.
Proof run: 3,303 accounts in about 2 minutes; enrichment stays local in a helper tab.
Repo: https://github.com/shangobashi/followgraph
Site: https://followgraph.issalabs.xyz

### X/Twitter Thread
1/ The X/Twitter Following page is not designed for cleanup.
2/ I needed a way to extract my own follows without giving any service my login flow.
3/ FollowGraph is a local Chrome/Edge scanner for your Following list.
4/ It streams the virtualized list, checkpoints progress, resolves using captured page API data, and exports CSV/JSON.
5/ No server touch, no tracking, no separate OAuth.
6/ Proof: real live run exported 3,303 accounts in about 2 minutes; enrichment continued locally in a helper tab.
7/ Repo: https://github.com/shangobashi/followgraph
8/ Download: https://followgraph.issalabs.xyz
9/ If you’ve manually exported before, tell me the one thing that always breaks.

## Beta Tester Intake
GitHub issue template: `campaign/repo-patches/BETA_ISSUE_TEMPLATE.md`
Fields:
- Job you’re trying to do
- Following count range
- First-run clarity rating 1-5
- One thing that almost made you quit
- Permission to quote anonymously

## Ready To Publish
All posts above are ready to copy-paste once account access is available.
