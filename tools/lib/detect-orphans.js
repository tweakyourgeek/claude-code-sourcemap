/**
 * Orphan detection for Claude Code session markdowns.
 *
 * An "orphan" is a session that has no meaningful connections to any other
 * session — it touches no shared files, references no common projects,
 * hits no overlapping errors, and uses no similar tool/command patterns.
 *
 * Connections are scored across multiple signal types. Sessions below
 * a configurable threshold are flagged as orphans.
 */

const { normalize } = require("./extract-metadata");

// ---------------------------------------------------------------------------
// Scoring weights — how much each shared signal contributes to connection
// ---------------------------------------------------------------------------

const WEIGHTS = {
  filePaths: 3, // strongest signal: same files touched
  gitBranches: 4, // very strong: same branch = same feature
  gitRepos: 2, // same repo is relevant but broad
  errorSignatures: 3, // same error pattern is a strong link
  tools: 0.5, // weak: most sessions use similar tools
  commands: 1, // moderate: same commands suggests similar work
  dependencies: 2, // same deps = likely same project area
  languages: 0.5, // weak: many sessions share languages
};

// ---------------------------------------------------------------------------
// Connection scoring
// ---------------------------------------------------------------------------

/**
 * Count shared items between two arrays (case-insensitive).
 */
function countOverlap(a, b) {
  const setB = new Set(b.map(normalize));
  return a.filter((item) => setB.has(normalize(item))).length;
}

/**
 * Compute the connection score between two session metadata objects.
 * Returns { total, breakdown } where breakdown shows per-signal scores.
 */
function connectionScore(metaA, metaB) {
  const breakdown = {};
  let total = 0;

  for (const [signal, weight] of Object.entries(WEIGHTS)) {
    const arrA = metaA[signal] || [];
    const arrB = metaB[signal] || [];
    const overlap = countOverlap(arrA, arrB);
    const score = overlap * weight;
    breakdown[signal] = { overlap, weight, score };
    total += score;
  }

  return { total, breakdown };
}

// ---------------------------------------------------------------------------
// Orphan detection
// ---------------------------------------------------------------------------

/**
 * Analyze an array of session metadata objects and identify orphans.
 *
 * Options:
 *   threshold - minimum total connection score to NOT be an orphan (default: 3)
 *   maxConnections - if a session's best connection is below this, it's an orphan (default: uses threshold)
 *
 * Returns:
 *   {
 *     orphans: [ { meta, bestScore, bestMatch, connections } ],
 *     connected: [ { meta, bestScore, bestMatch, connectionCount } ],
 *     connectionMatrix: Map<name, Map<name, score>>
 *   }
 */
function detectOrphans(metadataList, opts = {}) {
  const { threshold = 3 } = opts;

  // Build pairwise connection scores
  const connectionMatrix = new Map();
  const sessionScores = new Map();

  for (const meta of metadataList) {
    connectionMatrix.set(meta.name, new Map());
    sessionScores.set(meta.name, {
      meta,
      bestScore: 0,
      bestMatch: null,
      connections: [],
      totalScore: 0,
    });
  }

  for (let i = 0; i < metadataList.length; i++) {
    for (let j = i + 1; j < metadataList.length; j++) {
      const a = metadataList[i];
      const b = metadataList[j];
      const { total, breakdown } = connectionScore(a, b);

      connectionMatrix.get(a.name).set(b.name, { total, breakdown });
      connectionMatrix.get(b.name).set(a.name, { total, breakdown });

      if (total > 0) {
        const infoA = sessionScores.get(a.name);
        const infoB = sessionScores.get(b.name);

        infoA.connections.push({ name: b.name, score: total, breakdown });
        infoB.connections.push({ name: a.name, score: total, breakdown });
        infoA.totalScore += total;
        infoB.totalScore += total;

        if (total > infoA.bestScore) {
          infoA.bestScore = total;
          infoA.bestMatch = b.name;
        }
        if (total > infoB.bestScore) {
          infoB.bestScore = total;
          infoB.bestMatch = a.name;
        }
      }
    }
  }

  // Sort connections by score for each session
  for (const info of sessionScores.values()) {
    info.connections.sort((a, b) => b.score - a.score);
  }

  // Classify orphans vs connected
  const orphans = [];
  const connected = [];

  for (const info of sessionScores.values()) {
    if (info.bestScore < threshold) {
      orphans.push(info);
    } else {
      connected.push({
        meta: info.meta,
        bestScore: info.bestScore,
        bestMatch: info.bestMatch,
        connectionCount: info.connections.filter((c) => c.score >= threshold)
          .length,
      });
    }
  }

  // Sort: orphans by score ascending (most isolated first), connected by score descending
  orphans.sort((a, b) => a.bestScore - b.bestScore);
  connected.sort((a, b) => b.bestScore - a.bestScore);

  return { orphans, connected, connectionMatrix };
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

/**
 * Generate a markdown report of orphan detection results.
 */
function generateOrphanReport(results, metadataList) {
  const { orphans, connected } = results;
  const lines = [];

  lines.push("# Orphan Detection Report");
  lines.push("");
  lines.push(`**Total sessions analyzed:** ${metadataList.length}`);
  lines.push(`**Orphaned sessions:** ${orphans.length}`);
  lines.push(`**Connected sessions:** ${connected.length}`);
  lines.push(
    `**Orphan rate:** ${((orphans.length / metadataList.length) * 100).toFixed(1)}%`
  );
  lines.push("");

  // --- Orphans ---
  if (orphans.length > 0) {
    lines.push("## Orphaned Sessions");
    lines.push("");
    lines.push(
      "These sessions have no meaningful connections to other sessions."
    );
    lines.push("");

    for (const orphan of orphans) {
      const m = orphan.meta;
      lines.push(`### ${m.name}`);
      if (m.filePath) lines.push(`- **File:** \`${m.filePath}\``);
      lines.push(`- **Best connection score:** ${orphan.bestScore.toFixed(1)}`);
      if (orphan.bestMatch)
        lines.push(`- **Closest match:** ${orphan.bestMatch}`);
      lines.push(`- **Word count:** ${m.wordCount}`);

      // Show what signals this session has
      const signals = [];
      if (m.filePaths.length) signals.push(`${m.filePaths.length} file paths`);
      if (m.gitBranches.length)
        signals.push(`${m.gitBranches.length} branches`);
      if (m.errors.length) signals.push(`${m.errors.length} errors`);
      if (m.tools.length) signals.push(`tools: ${m.tools.join(", ")}`);
      if (m.commands.length) signals.push(`commands: ${m.commands.join(", ")}`);
      if (m.dependencies.length)
        signals.push(`${m.dependencies.length} dependencies`);
      if (m.languages.length)
        signals.push(`languages: ${m.languages.join(", ")}`);
      if (signals.length) lines.push(`- **Signals:** ${signals.join(" | ")}`);

      // Suggestions
      lines.push("- **Why orphaned:**");
      if (m.filePaths.length === 0 && m.gitBranches.length === 0) {
        lines.push(
          "  - No file paths or git branches detected — may be a conversational/planning session"
        );
      }
      if (orphan.connections.length > 0) {
        const best = orphan.connections[0];
        lines.push(
          `  - Closest connection (${best.name}) scored only ${best.score.toFixed(1)}`
        );
        const topSignal = Object.entries(best.breakdown)
          .filter(([, v]) => v.overlap > 0)
          .sort((a, b) => b[1].score - a[1].score)[0];
        if (topSignal) {
          lines.push(
            `  - Weak link via **${topSignal[0]}** (${topSignal[1].overlap} shared)`
          );
        }
      } else {
        lines.push("  - Zero overlap with any other session");
      }
      lines.push("");
    }
  }

  // --- Summary of connected sessions ---
  if (connected.length > 0) {
    lines.push("## Connected Sessions (Top 20)");
    lines.push("");
    lines.push(
      "| Session | Best Match | Score | Connections |"
    );
    lines.push("|---------|------------|-------|-------------|");
    for (const c of connected.slice(0, 20)) {
      lines.push(
        `| ${c.meta.name} | ${c.bestMatch} | ${c.bestScore.toFixed(1)} | ${c.connectionCount} |`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

module.exports = { detectOrphans, connectionScore, generateOrphanReport };
