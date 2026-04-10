/**
 * Metadata extractor for Claude Code session markdowns.
 *
 * Scans a session file and pulls out structured signals:
 * file paths, git info, errors, tools, commands, dependencies, URLs, languages.
 *
 * Zero external dependencies.
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------------------

const PATTERNS = {
  // Absolute and common relative file paths
  filePaths:
    /(?:\/[\w.\-]+){2,}(?:\.\w+)?|(?:\.\.?\/[\w.\-]+(?:\/[\w.\-]+)*(?:\.\w+)?)/g,

  // Git branch names — from commands AND natural language references
  gitBranches: [
    /(?:checkout|switch|branch|push|pull|merge|rebase)\s+(?:-[a-zA-Z]\s+)*([\w.\-\/]+)/g,
    /(?:branch|Branch)\s+`([^`]+)`/g,
    /(?:on|from|to|into)\s+(?:branch\s+)?`([^`]+)`/g,
    /(?:branch|Branch):\s*(\S+)/g,
    /(?:->|→)\s*([\w.\-\/]+)/g,
  ],

  // Git remote/repo references
  gitRepos:
    /(?:github\.com|gitlab\.com|bitbucket\.org)[/:]([^\s"']+?)(?:\.git)?(?=[\s"']|$)/g,

  // Error patterns — stack traces, common error prefixes
  errors: [
    /(?:Error|ERROR|TypeError|ReferenceError|SyntaxError|RangeError):\s*(.+)/g,
    /(?:ENOENT|EACCES|EEXIST|EPERM|EISDIR|ENOTDIR|ECONNREFUSED|ETIMEDOUT):\s*(.+)/g,
    /(?:fatal|FATAL):\s*(.+)/g,
    /(?:panic|PANIC):\s*(.+)/g,
    /command not found:\s*(.+)/g,
    /Cannot find module\s+'([^']+)'/g,
    /Module not found:\s*(.+)/g,
    /failed with exit code\s+(\d+)/g,
  ],

  // Claude Code tool names (from tool call patterns in session markdown)
  tools:
    /(?:^|\s)(?:Tool|Using|Called|Calling|tool_use)[\s:]*\b(Bash|Read|Edit|Write|Grep|Glob|Agent|Architect|FileRead|FileEdit|FileWrite|GrepTool|GlobTool|BashTool|lsTool|NotebookRead|NotebookEdit|MCPTool|ThinkTool|TodoWrite|WebFetch|WebSearch|MemoryRead|MemoryWrite)\b/gi,

  // Shell commands (first word after $ or > prompt, or common command names)
  commands:
    /(?:^|\n)\s*(?:\$|>)\s*([\w.\-]+)|(?:Running|Executing|run|exec)\s+`?(npm|npx|node|yarn|pnpm|git|docker|make|cargo|pip|python|ruby|go|rustc|gcc|curl|wget|ssh|scp|rsync|kubectl|terraform|aws|gcloud|az)\b/g,

  // Package/dependency references — code imports AND natural language mentions
  dependencies: [
    /require\(['"]([^'"./][^'"]*)['"]\)/g,
    /from\s+['"]([^'"./][^'"]*)['"]/g,
    /import\s+['"]([^'"./][^'"]*)['"]/g,
    /(?:npm|yarn|pnpm)\s+(?:install|add|i)\s+(?:-[DSdg]\s+)*([^\s-][^\s]*)/g,
    /pip\s+install\s+([^\s-][^\s]*)/g,
    /cargo\s+add\s+([^\s-][^\s]*)/g,
    /[Dd]ependenc(?:y|ies):?\s*[`"']?([^`"'\n,]+)[`"']?(?:\s*,\s*[`"']?([^`"'\n,]+)[`"']?)*/g,
    /`([@\w][\w.\-/]*)`\s+(?:package|module|library|dep)/g,
    /(?:package|module|library|dep)\s+`([@\w][\w.\-/]*)`/g,
  ],

  // URLs
  urls: /https?:\/\/[^\s"'<>\])+]+/g,

  // Fenced code block language hints
  languages: /```(\w+)/g,
};

// Normalize an extracted value for consistent matching
function normalize(str) {
  return str.trim().toLowerCase();
}

// Deduplicate an array of strings (case-insensitive)
function unique(arr) {
  const seen = new Set();
  return arr.filter((item) => {
    const key = normalize(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Run a regex (or array of regexes) and collect capture-group-1 matches
function collectMatches(text, pattern) {
  const results = [];
  const regexes = Array.isArray(pattern) ? pattern : [pattern];
  for (const re of regexes) {
    // Reset and clone so we can reuse
    const regex = new RegExp(re.source, re.flags);
    let m;
    while ((m = regex.exec(text)) !== null) {
      const val = m[1] || m[0];
      if (val) results.push(val.trim());
    }
  }
  return unique(results);
}

// Full-match collection (group 0)
function collectFullMatches(text, pattern) {
  const regex = new RegExp(pattern.source, pattern.flags);
  const results = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    results.push(m[0].trim());
  }
  return unique(results);
}

// ---------------------------------------------------------------------------
// Main extractor
// ---------------------------------------------------------------------------

/**
 * Extract metadata from a single session markdown string.
 * Returns a structured object with all detected signals.
 */
function extractMetadata(content, filePath) {
  const name = filePath ? path.basename(filePath, path.extname(filePath)) : "unknown";

  const filePaths = collectFullMatches(content, PATTERNS.filePaths).filter(
    // Filter out things that are clearly not file paths
    (p) => !p.startsWith("http") && p.length > 3
  );

  const gitBranches = collectMatches(content, PATTERNS.gitBranches);
  const gitRepos = collectMatches(content, PATTERNS.gitRepos);
  const errors = collectMatches(content, PATTERNS.errors);
  const tools = collectMatches(content, PATTERNS.tools).map((t) =>
    t.replace(/Tool$/i, "")
  );
  const commands = collectMatches(content, PATTERNS.commands).filter(
    (c) => c.length > 1
  );
  const dependencies = collectMatches(content, PATTERNS.dependencies).map(
    (d) => d.split("/")[0] // normalize scoped packages like @scope/pkg → @scope/pkg but strip subpaths
  );
  const urls = collectFullMatches(content, PATTERNS.urls);
  const languages = collectMatches(content, PATTERNS.languages);

  // Derive error "signatures" — normalized short form for matching
  const errorSignatures = errors.map((e) => {
    return e
      .replace(/['"][^'"]+['"]/g, "<STR>") // normalize string literals
      .replace(/\/[\w.\-/]+/g, "<PATH>") // normalize paths
      .replace(/\d+/g, "<N>") // normalize numbers
      .substring(0, 120);
  });

  return {
    name,
    filePath: filePath || null,
    filePaths: unique(filePaths),
    gitBranches: unique(gitBranches),
    gitRepos: unique(gitRepos),
    errors,
    errorSignatures: unique(errorSignatures),
    tools: unique(tools),
    commands: unique(commands),
    dependencies: unique(dependencies),
    urls: unique(urls),
    languages: unique(languages),
    wordCount: content.split(/\s+/).length,
  };
}

/**
 * Extract metadata from a file on disk.
 */
function extractFromFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  return extractMetadata(content, filePath);
}

/**
 * Scan a directory for markdown files and extract metadata from each.
 * Returns an array of metadata objects.
 */
function scanDirectory(dirPath, opts = {}) {
  const { recursive = true, extensions = [".md", ".markdown"] } = opts;
  const results = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip hidden dirs and node_modules
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        if (recursive) walk(fullPath);
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        results.push(extractFromFile(fullPath));
      }
    }
  }

  walk(dirPath);
  return results;
}

module.exports = { extractMetadata, extractFromFile, scanDirectory, normalize };
