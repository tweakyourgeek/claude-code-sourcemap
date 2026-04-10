#!/usr/bin/env node

/**
 * Claude Code Session Analyzer
 *
 * Scans a directory of Claude Code session markdowns and runs:
 *   - Orphan detection: finds sessions with no meaningful connections
 *   - Connection layering: maps relationships across files, errors, projects, etc.
 *
 * Usage:
 *   node analyze-sessions.js <path-to-sessions-dir> [options]
 *
 * Options:
 *   --orphans          Run only orphan detection
 *   --layers           Run only connection layering
 *   --threshold <n>    Orphan detection threshold (default: 3)
 *   --output <dir>     Write reports to this directory (default: stdout)
 *   --json             Output raw JSON instead of markdown
 *   --verbose          Show per-session metadata extraction details
 *
 * Examples:
 *   node analyze-sessions.js ~/my-sessions
 *   node analyze-sessions.js ~/my-sessions --orphans --threshold 5
 *   node analyze-sessions.js ~/my-sessions --output ./reports
 *   node analyze-sessions.js ~/my-sessions --json > analysis.json
 */

const fs = require("fs");
const path = require("path");
const { scanDirectory } = require("./lib/extract-metadata");
const { detectOrphans, generateOrphanReport } = require("./lib/detect-orphans");
const {
  mapConnections,
  generateConnectionReport,
} = require("./lib/map-connections");

// ---------------------------------------------------------------------------
// Argument parsing (no dependencies)
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    dir: null,
    orphansOnly: false,
    layersOnly: false,
    threshold: 3,
    output: null,
    json: false,
    verbose: false,
  };

  const positional = [];

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--orphans":
        args.orphansOnly = true;
        break;
      case "--layers":
        args.layersOnly = true;
        break;
      case "--threshold":
        args.threshold = parseFloat(argv[++i]) || 3;
        break;
      case "--output":
        args.output = argv[++i];
        break;
      case "--json":
        args.json = true;
        break;
      case "--verbose":
        args.verbose = true;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
        break;
      default:
        if (!arg.startsWith("-")) {
          positional.push(arg);
        } else {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }

  args.dir = positional[0] || null;
  return args;
}

function printUsage() {
  console.log(`
Claude Code Session Analyzer

Usage:
  node analyze-sessions.js <path-to-sessions-dir> [options]

Options:
  --orphans          Run only orphan detection
  --layers           Run only connection layering
  --threshold <n>    Orphan detection threshold (default: 3)
  --output <dir>     Write reports to this directory
  --json             Output raw JSON instead of markdown
  --verbose          Show extraction details per session
  -h, --help         Show this help

Examples:
  node analyze-sessions.js ~/my-sessions
  node analyze-sessions.js ~/my-sessions --orphans --threshold 5
  node analyze-sessions.js ~/my-sessions --layers --output ./reports
`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv);

  if (!args.dir) {
    args.dir = ".";
  }

  const dirPath = path.resolve(args.dir);

  if (!fs.existsSync(dirPath)) {
    console.error(`Error: Directory not found: ${dirPath}`);
    process.exit(1);
  }

  // --- Scan & extract ---
  console.error(`Scanning ${dirPath} for session markdowns...`);
  const metadataList = scanDirectory(dirPath);

  if (metadataList.length === 0) {
    console.error("No markdown files found. Check your directory path.");
    process.exit(1);
  }

  console.error(`Found ${metadataList.length} sessions.`);

  if (args.verbose) {
    console.error("\n--- Extraction Summary ---");
    for (const meta of metadataList) {
      console.error(`  ${meta.name}:`);
      console.error(`    files: ${meta.filePaths.length}, branches: ${meta.gitBranches.length}, errors: ${meta.errors.length}`);
      console.error(`    tools: ${meta.tools.join(", ") || "none"}, commands: ${meta.commands.join(", ") || "none"}`);
      console.error(`    deps: ${meta.dependencies.length}, langs: ${meta.languages.join(", ") || "none"}`);
    }
    console.error("");
  }

  // --- Run analyses ---
  const runOrphans = !args.layersOnly;
  const runLayers = !args.orphansOnly;

  let orphanResults = null;
  let connectionResults = null;

  if (runOrphans) {
    console.error("Running orphan detection...");
    orphanResults = detectOrphans(metadataList, {
      threshold: args.threshold,
    });
    console.error(
      `  Found ${orphanResults.orphans.length} orphans, ${orphanResults.connected.length} connected sessions.`
    );
  }

  if (runLayers) {
    console.error("Running connection layering...");
    connectionResults = mapConnections(metadataList);
    const layerSummary = Object.entries(connectionResults.layers)
      .map(([name, l]) => `${l.label}: ${l.edgeCount}`)
      .join(", ");
    console.error(`  Layer connections: ${layerSummary}`);
    console.error(
      `  Cross-layer insights: ${connectionResults.crossLayer.length}`
    );
  }

  // --- Output ---
  if (args.json) {
    const output = {};
    if (orphanResults) {
      output.orphans = {
        orphanCount: orphanResults.orphans.length,
        connectedCount: orphanResults.connected.length,
        orphans: orphanResults.orphans.map((o) => ({
          name: o.meta.name,
          filePath: o.meta.filePath,
          bestScore: o.bestScore,
          bestMatch: o.bestMatch,
        })),
        connected: orphanResults.connected.map((c) => ({
          name: c.meta.name,
          bestScore: c.bestScore,
          bestMatch: c.bestMatch,
          connectionCount: c.connectionCount,
        })),
      };
    }
    if (connectionResults) {
      output.layers = {};
      for (const [name, layer] of Object.entries(connectionResults.layers)) {
        output.layers[name] = {
          label: layer.label,
          edgeCount: layer.edgeCount,
          clusterCount: layer.clusterCount,
          clusters: layer.clusters,
          topEdges: layer.edges.slice(0, 20).map((e) => ({
            a: e.a,
            b: e.b,
            shared: e.shared,
          })),
        };
      }
      output.crossLayer = connectionResults.crossLayer.slice(0, 50).map((c) => ({
        sessions: c.sessions,
        layers: c.sharedLayers.map((l) => l.layer),
        insight: c.insight,
      }));
    }
    if (args.output) {
      const outPath = path.join(args.output, "analysis.json");
      fs.mkdirSync(args.output, { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
      console.error(`JSON report written to ${outPath}`);
    } else {
      console.log(JSON.stringify(output, null, 2));
    }
    return;
  }

  // Markdown output
  const reports = [];

  if (orphanResults) {
    reports.push(generateOrphanReport(orphanResults, metadataList));
  }

  if (connectionResults) {
    reports.push(generateConnectionReport(connectionResults, metadataList));
  }

  const fullReport = reports.join("\n\n---\n\n");

  if (args.output) {
    fs.mkdirSync(args.output, { recursive: true });

    if (orphanResults) {
      const orphanPath = path.join(args.output, "orphan-report.md");
      fs.writeFileSync(
        orphanPath,
        generateOrphanReport(orphanResults, metadataList)
      );
      console.error(`Orphan report written to ${orphanPath}`);
    }

    if (connectionResults) {
      const layerPath = path.join(args.output, "connection-report.md");
      fs.writeFileSync(
        layerPath,
        generateConnectionReport(connectionResults, metadataList)
      );
      console.error(`Connection report written to ${layerPath}`);
    }
  } else {
    console.log(fullReport);
  }

  console.error("\nDone.");
}

main();
