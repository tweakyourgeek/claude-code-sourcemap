Map connections between sessions across multiple layers (files, errors, tools, projects, commands, deps, languages).

Run connection layering against the provided path (or current directory if none given).

## Instructions

1. Run the analyzer in layers-only JSON mode:
```
node tools/analyze-sessions.js $ARGUMENTS --layers --json 2>/dev/null || node "$(git rev-parse --show-toplevel)/tools/analyze-sessions.js" $ARGUMENTS --layers --json 2>/dev/null
```

If no path argument was provided, use the current working directory: `node tools/analyze-sessions.js . --layers --json`

2. Parse the JSON and present findings by importance:

**Cross-layer insights first** (most valuable):
- These are session pairs connected across multiple layers
- Highlight the non-obvious ones: same errors in different projects, same deps but different branches
- Explain what each insight means practically

**Clusters next:**
- Group sessions that form connected clusters within each layer
- Focus on the files, projects, and errors layers (most actionable)
- Skip the languages layer unless it reveals something surprising

**Layer summary:**
- Show which layers have the most connections
- If a layer is empty, briefly note why (e.g., "no shared error patterns found")

3. Focus on what's actionable:
- Clusters in the files layer = sessions iterating on the same code
- Clusters in the errors layer = recurring problems worth investigating
- Cross-project error matches = possible systemic issues

4. If the analyzer script is not found, tell the user to check that `tools/analyze-sessions.js` exists in the repo root.
