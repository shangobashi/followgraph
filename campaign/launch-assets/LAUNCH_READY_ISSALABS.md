# Launch Package: FollowGraph Traction Campaign
## IssaLabs / Shango Bashi

## Positioning
Headline: **Don’t scroll your way out of a messy Following list.**
Subline: **Scan it, resolve it, export it.**
Evidence line: **Local-only. No server touch. CSV + JSON.**

## Why it lands
- Real pain: X/Twitter’s Following page is an infinite virtualized list, so users can’t intuitively export, inspect, or clean their own graph.
- Real difference: FollowGraph runs completely in the browser, captures page API data, stores `restId`/activity locally, checkpoints and resumes scans, and exports CSV/JSON.
- Real trust signal: MIT licensed, no OAuth, no tracking, no third-party account access, no server upload.
- IssaLabs branding: independent project by Shango Bashi under IssaLabs.

## Audience
1. Creators/operators auditing their own attention graph
2. Growth operators inspecting prospect or community connections
3. Researchers/journalists needing reproducible local export artifacts
4. Power users/tool builders comparing X data tooling

## Copy Angles
- Privacy: “Your following graph never leaves your browser.”
- Engineering/survival: “Built for X’s virtualized list, captured API data, and flaky load states.”
- Tool craft: “Fast enough for large lists, but rough enough to improve.”

## Assets To Prepare
- README/launch refresh with install proof and screenshots
- Hacker News Show HN post
- Reddit thread options with value-first framing
- Twitter/X messaging focused on local workflow and trust
- Beta tester outreach templates

## Live Launch Authorization
All posts below are authorized for live publication under IssaLabs / Shango Bashi identity.

## Approved Launch Payloads

### Hacker News Show HN
Title: Show HN: FollowGraph – local scanner/export for X/Twitter Following lists
Body:
Built after failing to find a sensible export path for my own Following list.

What it does:
- scans your Following page, not a public profile
- exports CSV/JSON
- handles React virtualized scrolling and scan failures
- resolves accounts through captured page API data where possible
- checkpoints/resumes scans

It's open source, MIT, and nothing leaves your browser.

I'd especially like feedback on the resume/recovery behavior and whether the first-session UX is clear for non-devs.
Link: https://github.com/shangobashi/followgraph
Site: https://followgraph.issalabs.xyz

### Reddit r/Twitter
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

## Beta Outreach Template
> Hey, saw you posted about cleaning up Twitter follows. I shipped a local-only scanner for X Following lists: no OAuth, no server upload, exports CSV/JSON. If you want, I can send the download link. — IssaLabs / Shango Bashi

## Sign-off usage
Use “IssaLabs / Shango Bashi” or “IssaLabs” in all live publication identities.
