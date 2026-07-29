Title: Show HN: FollowGraph – local scanner/export for X/Twitter Following lists
Body:
I built this because I couldn't find a sensible way to extract and work with my own Following list.

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
