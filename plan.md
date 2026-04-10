# Plan: `/analyze-sessions` Slash Command

## Context
The user uses Claude Code on the web to manage session markdowns in repos. They want orphan detection and connection layering as a `/command` they can invoke directly in a Claude Code session — not a standalone Node.js script they run manually.

## What Already Exists (from premature implementation)
- `tools/lib/extract-metadata.js` — extracts file paths, git branches, errors, tools, commands, deps, languages from session markdown
- `tools/lib/detect-orphans.js` — scores pairwise connections, flags sessions below threshold
- `tools/lib/map-connections.js` — builds 7 connection layers, does cross-layer analysis
- `tools/analyze-sessions.js` — CLI entry point (markdown/JSON output)

These work but are designed as terminal scripts, not as a slash command.

## Plan

### Step 1: Create custom slash command
Create `.claude/commands/analyze-sessions.md` — a project-level custom command that appears as `/project:analyze-sessions` in Claude Code.

The command prompt will:
- Accept an optional path argument (defaults to current directory)
- Instruct Claude to run the analysis scripts via Bash
- Present orphan report and connection layer report in the conversation
- Highlight actionable insights (orphans to investigate, cross-layer patterns)

### Step 2: Refactor scripts for command-friendly output
The existing scripts write to stdout/files. Adjust so they work cleanly when invoked from a slash command:
- Ensure `--json` mode works well for Claude to parse and summarize
- Keep `--output` mode for when users want reports saved to repo
- Make sure the scripts work with relative paths (important for web sessions)

### Step 3: Add command variations
Create focused sub-commands as separate command files:
- `.claude/commands/find-orphans.md` — just orphan detection (`/project:find-orphans`)
- `.claude/commands/map-connections.md` — just connection layering (`/project:map-connections`)
- `.claude/commands/analyze-sessions.md` — runs both (`/project:analyze-sessions`)

### Step 4: Test on actual session markdowns
- Run against markdowns in this repo (or a test set)
- Verify output is readable and actionable in a Claude Code web session
- Confirm the slash commands resolve correctly

## File Changes

### New files:
- `.claude/commands/analyze-sessions.md` — full analysis command
- `.claude/commands/find-orphans.md` — orphan-only command  
- `.claude/commands/map-connections.md` — layers-only command

### Modified files:
- `tools/analyze-sessions.js` — minor tweaks for slash command invocation (cleaner exit codes, relative path handling)

### No changes to:
- `tools/lib/*` — analysis engine stays as-is
- `README.md` — no docs changes (user didn't ask for docs)

## Why This Approach
- **Custom slash commands** (`.claude/commands/`) work on Claude Code web — no build step, no source modification
- **Node.js scripts stay as the engine** — Claude invokes them via Bash, reads the output, and presents findings conversationally
- **Separation of concerns** — prompt templates handle UX, scripts handle analysis logic
- **Three commands** give flexibility: full analysis or targeted runs
