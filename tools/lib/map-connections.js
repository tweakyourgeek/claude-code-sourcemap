/**
 * Connection layering for Claude Code session markdowns.
 *
 * Instead of a single "related/not related" check, this maps connections
 * across distinct layers:
 *
 *   FILES      — sessions touching the same files
 *   ERRORS     — sessions hitting the same error patterns
 *   TOOLS      — sessions using the same tool combinations
 *   PROJECTS   — sessions on the same repos/branches
 *   COMMANDS   — sessions running the same commands
 *   DEPS       — sessions involving the same packages
 *   LANGUAGES  — sessions working in the same languages
 *
 * Cross-layer analysis reveals non-obvious links like "these 5 sessions
 * all hit the same error but were in different projects."
 */

const { normalize } = require("./extract-metadata");

// ---------------------------------------------------------------------------
// Layer definitions
// ---------------------------------------------------------------------------

const LAYERS = {
  files: {
    label: "Files",
    description: "Sessions touching the same files",
    field: "filePaths",
    minOverlap: 1,
  },
  errors: {
    label: "Errors",
    description: "Sessions hitting the same error patterns",
    field: "errorSignatures",
    minOverlap: 1,
  },
  tools: {
    label: "Tools",
    description: "Sessions using the same tool combinations",
    field: "tools",
    minOverlap: 2, // most sessions share at least 1 tool, require 2+
  },
  projects: {
    label: "Projects",
    description: "Sessions on the same repos/branches",
    field: "gitBranches",
    secondaryField: "gitRepos",
    minOverlap: 1,
  },
  commands: {
    label: "Commands",
    description: "Sessions running the same commands",
    field: "commands",
    minOverlap: 2,
  },
  deps: {
    label: "Dependencies",
    description: "Sessions involving the same packages",
    field: "dependencies",
    minOverlap: 1,
  },
  languages: {
    label: "Languages",
    description: "Sessions working in the same languages",
    field: "languages",
    minOverlap: 1,
  },
};

// ---------------------------------------------------------------------------
// Layer mapping
// ---------------------------------------------------------------------------

/**
 * Find shared items between two arrays (case-insensitive).
 * Returns the shared items.
 */
function findOverlap(a, b) {
  const setB = new Set(b.map(normalize));
  return a.filter((item) => setB.has(normalize(item)));
}

/**
 * Build a single layer's connection graph.
 * Returns { edges: [ { a, b, shared } ], clusters: [ [names] ] }
 */
function buildLayer(metadataList, layerDef) {
  const edges = [];
  const adjacency = new Map();

  for (const meta of metadataList) {
    adjacency.set(meta.name, new Set());
  }

  for (let i = 0; i < metadataList.length; i++) {
    for (let j = i + 1; j < metadataList.length; j++) {
      const a = metadataList[i];
      const b = metadataList[j];

      let shared = findOverlap(a[layerDef.field] || [], b[layerDef.field] || []);

      // Include secondary field if defined (e.g., gitRepos for projects layer)
      if (layerDef.secondaryField) {
        const secondaryShared = findOverlap(
          a[layerDef.secondaryField] || [],
          b[layerDef.secondaryField] || []
        );
        shared = [...new Set([...shared, ...secondaryShared])];
      }

      if (shared.length >= layerDef.minOverlap) {
        edges.push({ a: a.name, b: b.name, shared });
        adjacency.get(a.name).add(b.name);
        adjacency.get(b.name).add(a.name);
      }
    }
  }

  // Find connected clusters via BFS
  const visited = new Set();
  const clusters = [];

  for (const name of adjacency.keys()) {
    if (visited.has(name)) continue;
    if (adjacency.get(name).size === 0) continue;

    const cluster = [];
    const queue = [name];
    visited.add(name);

    while (queue.length > 0) {
      const current = queue.shift();
      cluster.push(current);
      for (const neighbor of adjacency.get(current)) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    if (cluster.length > 1) {
      clusters.push(cluster.sort());
    }
  }

  return { edges, clusters };
}

/**
 * Build all layers and perform cross-layer analysis.
 *
 * Returns:
 *   {
 *     layers: { [layerName]: { label, edges, clusters } },
 *     crossLayer: [ { sessions, sharedLayers, insight } ],
 *     sessionProfiles: Map<name, { layers, totalConnections }>
 *   }
 */
function mapConnections(metadataList) {
  const layers = {};

  for (const [name, def] of Object.entries(LAYERS)) {
    const { edges, clusters } = buildLayer(metadataList, def);
    layers[name] = {
      label: def.label,
      description: def.description,
      edges,
      clusters,
      edgeCount: edges.length,
      clusterCount: clusters.length,
    };
  }

  // Build per-session profiles: which layers is each session active in?
  const sessionProfiles = new Map();

  for (const meta of metadataList) {
    sessionProfiles.set(meta.name, {
      meta,
      layers: {},
      totalConnections: 0,
    });
  }

  for (const [layerName, layer] of Object.entries(layers)) {
    for (const edge of layer.edges) {
      const profileA = sessionProfiles.get(edge.a);
      const profileB = sessionProfiles.get(edge.b);

      if (!profileA.layers[layerName]) profileA.layers[layerName] = new Set();
      if (!profileB.layers[layerName]) profileB.layers[layerName] = new Set();

      profileA.layers[layerName].add(edge.b);
      profileB.layers[layerName].add(edge.a);
      profileA.totalConnections++;
      profileB.totalConnections++;
    }
  }

  // Cross-layer analysis: find pairs connected in multiple layers
  const crossLayer = [];
  const pairsSeen = new Set();

  for (let i = 0; i < metadataList.length; i++) {
    for (let j = i + 1; j < metadataList.length; j++) {
      const a = metadataList[i].name;
      const b = metadataList[j].name;
      const key = `${a}||${b}`;
      if (pairsSeen.has(key)) continue;
      pairsSeen.add(key);

      const sharedLayers = [];
      for (const [layerName, layer] of Object.entries(layers)) {
        const hasEdge = layer.edges.some(
          (e) => (e.a === a && e.b === b) || (e.a === b && e.b === a)
        );
        if (hasEdge) {
          const edge = layer.edges.find(
            (e) => (e.a === a && e.b === b) || (e.a === b && e.b === a)
          );
          sharedLayers.push({ layer: layerName, shared: edge.shared });
        }
      }

      if (sharedLayers.length >= 2) {
        const insight = generateInsight(a, b, sharedLayers);
        crossLayer.push({ sessions: [a, b], sharedLayers, insight });
      }
    }
  }

  // Sort cross-layer by number of shared layers (most interesting first)
  crossLayer.sort((a, b) => b.sharedLayers.length - a.sharedLayers.length);

  return { layers, crossLayer, sessionProfiles };
}

// ---------------------------------------------------------------------------
// Insight generation
// ---------------------------------------------------------------------------

function generateInsight(a, b, sharedLayers) {
  const layerNames = sharedLayers.map((l) => l.layer);

  // Special cases for interesting combinations
  if (layerNames.includes("errors") && layerNames.includes("projects")) {
    return `Same project, same errors — likely related debugging sessions`;
  }
  if (layerNames.includes("errors") && !layerNames.includes("projects")) {
    return `Same error patterns in DIFFERENT projects — possible systemic issue or shared dependency bug`;
  }
  if (layerNames.includes("files") && layerNames.includes("deps")) {
    return `Same files and dependencies — likely iterating on the same feature`;
  }
  if (layerNames.includes("projects") && layerNames.includes("commands")) {
    return `Same project, same workflow commands — continuation of work`;
  }
  if (sharedLayers.length >= 4) {
    return `Strong multi-layer connection (${sharedLayers.length} layers) — highly related sessions`;
  }
  if (sharedLayers.length >= 3) {
    return `Connected across ${sharedLayers.length} layers: ${layerNames.join(", ")}`;
  }

  return `Linked via ${layerNames.join(" and ")}`;
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

/**
 * Generate a markdown report of connection layering results.
 */
function generateConnectionReport(results, metadataList) {
  const { layers, crossLayer, sessionProfiles } = results;
  const lines = [];

  lines.push("# Connection Layer Report");
  lines.push("");
  lines.push(`**Total sessions analyzed:** ${metadataList.length}`);
  lines.push("");

  // --- Layer summary ---
  lines.push("## Layer Summary");
  lines.push("");
  lines.push("| Layer | Connections | Clusters | Description |");
  lines.push("|-------|-------------|----------|-------------|");
  for (const [name, layer] of Object.entries(layers)) {
    lines.push(
      `| **${layer.label}** | ${layer.edgeCount} | ${layer.clusterCount} | ${layer.description} |`
    );
  }
  lines.push("");

  // --- Per-layer detail ---
  for (const [name, layer] of Object.entries(layers)) {
    if (layer.edgeCount === 0) continue;

    lines.push(`## ${layer.label} Layer`);
    lines.push("");
    lines.push(`_${layer.description}_`);
    lines.push("");

    // Clusters
    if (layer.clusters.length > 0) {
      lines.push("### Clusters");
      lines.push("");
      for (let i = 0; i < layer.clusters.length; i++) {
        const cluster = layer.clusters[i];
        lines.push(`**Cluster ${i + 1}** (${cluster.length} sessions):`);
        for (const session of cluster) {
          lines.push(`- ${session}`);
        }
        lines.push("");
      }
    }

    // Top connections (strongest shared items)
    const topEdges = layer.edges
      .sort((a, b) => b.shared.length - a.shared.length)
      .slice(0, 10);

    if (topEdges.length > 0) {
      lines.push("### Strongest Connections");
      lines.push("");
      for (const edge of topEdges) {
        const sharedStr =
          edge.shared.length <= 5
            ? edge.shared.map((s) => `\`${s}\``).join(", ")
            : `${edge.shared
                .slice(0, 5)
                .map((s) => `\`${s}\``)
                .join(", ")} +${edge.shared.length - 5} more`;
        lines.push(
          `- **${edge.a}** <-> **${edge.b}**: ${sharedStr}`
        );
      }
      lines.push("");
    }
  }

  // --- Cross-layer insights ---
  if (crossLayer.length > 0) {
    lines.push("## Cross-Layer Insights");
    lines.push("");
    lines.push(
      "These session pairs are connected across multiple layers — the most interesting relationships."
    );
    lines.push("");

    for (const item of crossLayer.slice(0, 30)) {
      const [a, b] = item.sessions;
      const layerList = item.sharedLayers
        .map((l) => `**${l.layer}** (${l.shared.length} shared)`)
        .join(", ");
      lines.push(`### ${a} <-> ${b}`);
      lines.push(`- **Layers:** ${layerList}`);
      lines.push(`- **Insight:** ${item.insight}`);
      lines.push("");
    }
  }

  // --- Session profiles (most connected) ---
  const profiles = [...sessionProfiles.values()].sort(
    (a, b) => b.totalConnections - a.totalConnections
  );

  lines.push("## Session Connectivity Profiles");
  lines.push("");
  lines.push("| Session | Total Links | Active Layers |");
  lines.push("|---------|-------------|---------------|");
  for (const profile of profiles.slice(0, 30)) {
    const activeLayers = Object.keys(profile.layers).join(", ") || "none";
    lines.push(
      `| ${profile.meta.name} | ${profile.totalConnections} | ${activeLayers} |`
    );
  }
  lines.push("");

  return lines.join("\n");
}

module.exports = { mapConnections, buildLayer, generateConnectionReport, LAYERS };
