# Cron Package: Offline-Ready FollowGraph Campaign Jobs

## Note
Real cron jobs in this Windows/Hermes environment are not autorunnable without explicit environment trust. These are deploy-ready prompt/script packages so the campaign can activate immediately once authorized.

## Job 1: Daily Launch and Engagement Sweep
- Posts remaining scheduled launch variants
- Checks and engages on HN/Reddit/X conversations
- Captures daily campaign snapshot

## Job 2: Weekly Feedback Digest
- Pulls latest GitHub signals and feedback notes
- Generates a summary for rapid copy/docs iteration

## Job 3: Beta Tester Follow-Up
- Sends follow-up templates to opted-in testers
- Tracks completion status in campaign logs

## Deployment Pattern
Use Hermes cron with GPT-5.4 mini via OpenAI Codex provider once browser/git/network execution trusts are confirmed. Each job should run from `C:/Users/Shango/followgraph` and read/write only inside `campaign/`.
