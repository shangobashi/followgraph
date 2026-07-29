# IssaLabs Launch Prompt Pack

## HN Show HN (copy-paste)
Title: Show HN: FollowGraph – local scanner/export for X/Twitter Following lists
Body:
Built after failing to find a sensible export path for my own Following list.
- scans your Following page, not a public profile
- exports CSV/JSON
- handles React virtualized scrolling and scan failures
- resolves accounts through captured page API data where possible
- checkpoints/resumes scans
Open source, MIT, nothing leaves your browser.
Feedback wanted on resume/recovery behavior and non-dev first-session clarity.
Repo: https://github.com/shangobashi/followgraph
Site: https://followgraph.issalabs.xyz

## Reddit r/Twitter
Title: I made a privacy-first way to export my full X/Twitter Following list
Body:
Same issue: following count rises, X offers no clean export, and hosted tools ask for too much access for a local dataset.
I built a Chrome/Edge extension that scans your own Following page and exports CSV/JSON from the browser.
- no server upload
- no OAuth
- checkpoint/resume after interruptions
- uses captured page API data where available
Repo and zip below. Feedback on first-run clarity for non-devs welcome.
Link: https://followgraph.issalabs.xyz

## Reddit r/socialmedia
Title: A local-only way to audit your own X/Twitter following graph
Body:
If you manage presence on X, cleanup and audits are painful because the Following UI is not built for export.
I built a Chrome/Edge extension that exports your Following data into CSV/JSON without uploading it anywhere.
It also resumes after interruptions and enriches profile activity locally.
Useful for creators, operators, and researchers who need clean data without privacy tradeoffs.
Proof run: 3,303 accounts, ~2 minutes, no server touch.
Link: https://followgraph.issalabs.xyz

## Reddit r/startups
Title: Tooling note: I rebuilt personal X following export as a local-first workflow
Body:
When doing audience intelligence, I kept hitting a wall: no clean export path for my own following relationships, and hosted tools felt like overreach for a personal dataset.
I made a local Chrome/Edge scanner instead.
Use case: founders/operators inspecting connections before outreach.
Proof: real live scan, 3,303 accounts, ~2 minutes, no server touch.
Link: https://followgraph.issalabs.xyz

## Reddit r/SideProject
Title: Show SideProject: FollowGraph, local X/Twitter Following scanner/exporter
Body:
I wanted to audit my own following graph without fragile scrapers or sharing credentials with a hosted service.
Runs in Chrome/Edge, exports JSON/CSV, keeps everything local.
Real proof: 3,303 accounts in about 2 minutes; enrichment runs locally after scan.
Looking for testers and feedback on install/setup flow.
Repo: https://github.com/shangobashi/followgraph
Site: https://followgraph.issalabs.xyz

## Reddit r/selfhosted
Title: Self-hosted-friendly local X/Twitter following exporter, no servers needed
Body:
Most X/Twitter export workflows need remote scraping or account access.
FollowGraph is client-side only.
Chrome/Edge extension, local scan, checkpoint/resume, JSON/CSV export.
Everything runs in your browser; nothing leaves your machine.
Real scan: 3,303 accounts, helper-tab enrichment.
Repo: https://github.com/shangobashi/followgraph
Site: https://followgraph.issalabs.xyz

## Reddit r/privacy
Title: A client-side X/Twitter following exporter with no server touch and no OAuth
Body:
I wanted to export my own Following data without trusting a third-party with credentials or storage.
FollowGraph is a Chrome/Edge extension that scans the live Following page and exports locally.
No server upload, no tracking, no OAuth.
Proof run: 3,303 accounts in about 2 minutes; enrichment stays local in a helper tab.
Repo: https://github.com/shangobashi/followgraph
Site: https://followgraph.issalabs.xyz

## X/Twitter Thread
1/ The X/Twitter Following page is not designed for cleanup.
2/ I needed a way to extract my own follows without giving any service my login flow.
3/ FollowGraph is a local Chrome/Edge scanner for your Following list.
4/ It streams the virtualized list, checkpoints progress, resolves using captured page API data, and exports CSV/JSON.
5/ No server touch, no tracking, no separate OAuth.
6/ Proof: real live run exported 3,303 accounts in about 2 minutes; enrichment continued locally in a helper tab.
7/ Repo: https://github.com/shangobashi/followgraph
8/ Download: https://followgraph.issalabs.xyz
9/ If you’ve manually exported before, tell me the one thing that always breaks.

## Beta Outreach
> Hey, saw you posted about cleaning up Twitter follows. I shipped a local-only scanner for X Following lists: no OAuth, no server upload, exports CSV/JSON. If you want, I can send the download link. — IssaLabs / Shango Bashi

## Identity
Sign all posts as “IssaLabs / Shango Bashi” or “IssaLabs.”
