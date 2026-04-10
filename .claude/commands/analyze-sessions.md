Analyze session markdowns for orphan detection and connection layering.

Run the session analyzer against the provided path (or current directory if none given). Present findings conversationally — don't just dump raw output.

## Instructions

1. Run the analyzer in JSON mode:
```
node tools/analyze-sessions.js $ARGUMENTS --json 2>/dev/null || node "$(git rev-parse --show-toplevel)/tools/analyze-sessions.js" $ARGUMENTS --json 2>/dev/null
```

If no path argument was provided, use the current working directory: `node tools/analyze-sessions.js . --json`

2. Parse the JSON output and present findings in this order:

**Orphans first:**
- List each orphaned session with WHY it's orphaned (no shared files? no branch? pure conversation?)
- For orphans with weak links, mention what the closest connection is
- Suggest what the user might want to do: link it to something, archive it, or investigate

**Connection layers next:**
- Highlight the most interesting cross-layer insights first (e.g., "same error in different projects")
- Show clusters of related sessions
- Call out which layers have the most activity

**Session profiles last:**
- Briefly note the most and least connected sessions

3. Keep it actionable. Don't just report — suggest what to investigate or connect.

4. If the analyzer script is not found, tell the user to check that `tools/analyze-sessions.js` exists in the repo root.
