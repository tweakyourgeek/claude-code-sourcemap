Find orphaned sessions — markdowns with no meaningful connections to other sessions.

Run orphan detection against the provided path (or current directory if none given).

## Instructions

1. Run the analyzer in orphan-only JSON mode:
```
node tools/analyze-sessions.js $ARGUMENTS --orphans --json 2>/dev/null || node "$(git rev-parse --show-toplevel)/tools/analyze-sessions.js" $ARGUMENTS --orphans --json 2>/dev/null
```

If no path argument was provided, use the current working directory: `node tools/analyze-sessions.js . --orphans --json`

2. Parse the JSON and present orphans grouped by severity:

**Completely isolated** (zero connections):
- These sessions share nothing with any other session
- Flag whether they look like one-off questions, abandoned explorations, or misplaced sessions

**Weakly connected** (below threshold but have some signal):
- Show what their closest match is and why the link is weak
- Suggest whether they should be connected to something specific

3. End with a quick summary: X orphans out of Y total sessions (Z% orphan rate).

4. If the orphan rate is high (>50%), note that the threshold might need adjusting (`--threshold` flag) or the sessions might just be diverse.

5. If the analyzer script is not found, tell the user to check that `tools/analyze-sessions.js` exists in the repo root.
