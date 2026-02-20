#!/usr/bin/env node

/**
 * Seed script for local AutoMem development.
 * Creates deterministic memories and relationships for graph-viewer testing.
 *
 * Usage:
 *   node scripts/seed.mjs                          # seed against localhost:8001
 *   node scripts/seed.mjs --reset                  # clear all, then seed
 *   node scripts/seed.mjs --api-url http://host:port --token my-token
 */

import { parseArgs } from 'node:util';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    'api-url': { type: 'string', default: 'http://localhost:8001' },
    token:     { type: 'string', default: 'test-token' },
    reset:     { type: 'boolean', default: false },
  },
});

const API_URL = args['api-url'].replace(/\/+$/, '');
const TOKEN   = args.token;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${TOKEN}`,
};

async function api(method, path, body) {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return json;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Health check with retry
// ---------------------------------------------------------------------------

async function waitForHealth(maxRetries = 15, intervalMs = 2000) {
  console.log(`\nWaiting for AutoMem at ${API_URL} ...`);
  for (let i = 1; i <= maxRetries; i++) {
    try {
      const h = await api('GET', '/health');
      if (h?.status === 'healthy' || h?.status === 'degraded') {
        console.log(`  ✓ healthy (falkordb=${h.falkordb}, qdrant=${h.qdrant}, memories=${h.memory_count})`);
        return h;
      }
    } catch {
      // ignore connection errors during startup
    }
    const wait = Math.min(intervalMs * Math.pow(1.3, i - 1), 10000);
    process.stdout.write(`  attempt ${i}/${maxRetries} — retrying in ${(wait / 1000).toFixed(1)}s\r`);
    await sleep(wait);
  }
  throw new Error(`AutoMem not reachable after ${maxRetries} retries. Is docker compose running?`);
}

// ---------------------------------------------------------------------------
// Reset (delete all existing memories)
// ---------------------------------------------------------------------------

async function resetAll() {
  console.log('\n--reset: clearing all existing memories…');
  const snap = await api('GET', '/graph/snapshot?limit=2000');
  const ids = (snap?.nodes || []).map((n) => n.id);
  if (ids.length === 0) {
    console.log('  (no memories to delete)');
    return;
  }
  console.log(`  deleting ${ids.length} memories…`);
  for (const id of ids) {
    await api('DELETE', `/memory/${id}`);
  }
  console.log(`  ✓ deleted ${ids.length} memories`);
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

// Keys are short aliases used in relationship definitions below.
// Each memory gets its real UUID after creation.
const MEMORIES = {
  // ── Architecture decisions ──────────────────────────────────────────
  arch_graph: {
    content: 'Use FalkorDB as the primary graph store for memory relationships. Property graph model maps naturally to memory-relationship semantics.',
    type: 'Decision', importance: 0.95, tags: ['architecture', 'falkordb', 'database'],
  },
  arch_vector: {
    content: 'Use Qdrant for vector embeddings alongside FalkorDB. Dual-store approach: graph for relationships, vector for semantic search.',
    type: 'Decision', importance: 0.9, tags: ['architecture', 'qdrant', 'embeddings'],
  },
  arch_api: {
    content: 'Flask API with blueprint-based routing. Each domain (memory, graph, recall, admin) gets its own blueprint.',
    type: 'Decision', importance: 0.85, tags: ['architecture', 'flask', 'api'],
  },
  arch_enrichment: {
    content: 'Background enrichment pipeline auto-generates embeddings, extracts entities, and classifies memory types after storage.',
    type: 'Decision', importance: 0.8, tags: ['architecture', 'enrichment', 'pipeline'],
  },

  // ── Dev patterns ────────────────────────────────────────────────────
  pat_conventional: {
    content: 'Use conventional commits for all repos: feat(scope): desc, fix(scope): desc. Release Please handles versioning.',
    type: 'Pattern', importance: 0.85, tags: ['git', 'commits', 'workflow'],
  },
  pat_esm: {
    content: 'Node.js projects default to ESM (type: module). Use .mjs for scripts, native fetch from Node 20+.',
    type: 'Pattern', importance: 0.7, tags: ['node', 'esm', 'javascript'],
  },
  pat_env: {
    content: 'Keep .env.example in sync with .env. Document new env vars inline. Never commit secrets.',
    type: 'Pattern', importance: 0.75, tags: ['config', 'env', 'security'],
  },
  pat_proxy: {
    content: 'Vite dev proxy handles API routing in development. Set VITE_API_TARGET to point to local or remote backend.',
    type: 'Pattern', importance: 0.7, tags: ['vite', 'proxy', 'dev'],
  },

  // ── Preferences ─────────────────────────────────────────────────────
  pref_dark: {
    content: 'Prefer dark mode across all tools and editors. VS Code, terminal, browser dev tools — all dark.',
    type: 'Preference', importance: 0.6, tags: ['ui', 'preferences', 'dark-mode'],
  },
  pref_minimal: {
    content: 'Prefer minimal abstractions. Three similar lines of code is better than a premature abstraction.',
    type: 'Preference', importance: 0.8, tags: ['code-style', 'preferences'],
  },
  pref_typescript: {
    content: 'TypeScript for all frontend projects. Strict mode enabled. Avoid any types.',
    type: 'Preference', importance: 0.75, tags: ['typescript', 'preferences', 'frontend'],
  },
  pref_tailwind: {
    content: 'Tailwind CSS for styling. Utility-first, no custom CSS files unless absolutely necessary.',
    type: 'Preference', importance: 0.7, tags: ['css', 'tailwind', 'preferences'],
  },

  // ── Project context ─────────────────────────────────────────────────
  ctx_automem: {
    content: 'AutoMem is a personal memory service. Graph-based storage with semantic recall. Powers AI agents with persistent context.',
    type: 'Context', importance: 0.9, tags: ['automem', 'project', 'overview'],
  },
  ctx_viewer: {
    content: 'Graph viewer is a standalone React/Three.js app for visualizing AutoMem memory graphs. Extracted from embedded /viewer route.',
    type: 'Context', importance: 0.85, tags: ['graph-viewer', 'project', 'react'],
  },
  ctx_railway: {
    content: 'AutoMem production runs on Railway. Docker-based deployment with FalkorDB and Qdrant services.',
    type: 'Context', importance: 0.7, tags: ['railway', 'deployment', 'production'],
  },
  ctx_agents: {
    content: 'Multiple AI agents consume AutoMem: AutoJack (personal), AutoHub (automation), Claude Code (dev assistant).',
    type: 'Context', importance: 0.75, tags: ['agents', 'consumers', 'automem'],
  },

  // ── Habits ──────────────────────────────────────────────────────────
  hab_morning: {
    content: 'Morning routine: check GitHub notifications, review open PRs, triage issues before deep work.',
    type: 'Habit', importance: 0.5, tags: ['routine', 'morning', 'workflow'],
  },
  hab_branch: {
    content: 'Create feature branches from main. Keep PRs small and focused. Squash merge when landing.',
    type: 'Habit', importance: 0.65, tags: ['git', 'branching', 'workflow'],
  },
  hab_test: {
    content: 'Run tests locally before pushing. CI is a safety net, not the first line of defense.',
    type: 'Habit', importance: 0.6, tags: ['testing', 'ci', 'workflow'],
  },
  hab_cleanup: {
    content: 'End of session: delete tmp files, remove debug console.logs, remove commented-out code.',
    type: 'Habit', importance: 0.55, tags: ['cleanup', 'hygiene', 'workflow'],
  },

  // ── Insights ────────────────────────────────────────────────────────
  ins_graphviz: {
    content: 'Force-directed graph layouts work best with 50-500 nodes. Beyond that, cluster or hierarchical layouts needed.',
    type: 'Insight', importance: 0.7, tags: ['visualization', 'graph', 'performance'],
  },
  ins_embeddings: {
    content: 'Embedding similarity above 0.85 almost always indicates duplicate or near-duplicate content. Good dedup threshold.',
    type: 'Insight', importance: 0.75, tags: ['embeddings', 'dedup', 'threshold'],
  },
  ins_latency: {
    content: 'FalkorDB Cypher queries under 50ms for graphs up to 10K nodes. Qdrant ANN search under 20ms for 100K vectors.',
    type: 'Insight', importance: 0.65, tags: ['performance', 'latency', 'benchmarks'],
  },
  ins_recall: {
    content: 'Hybrid recall (vector + graph expansion) returns more contextually relevant results than pure vector search.',
    type: 'Insight', importance: 0.8, tags: ['recall', 'search', 'hybrid'],
  },

  // ── Style ───────────────────────────────────────────────────────────
  sty_writing: {
    content: 'Writing style: direct, casual, technical but accessible. No corporate fluff. Action-oriented with personality.',
    type: 'Style', importance: 0.7, tags: ['writing', 'communication', 'style'],
  },
  sty_code: {
    content: 'Code comments: only where logic is not self-evident. No JSDoc on obvious functions. Inline comments for tricky bits.',
    type: 'Style', importance: 0.65, tags: ['code-style', 'comments', 'style'],
  },
  sty_naming: {
    content: 'Naming: camelCase for JS/TS variables, kebab-case for files, UPPER_SNAKE for constants. No abbreviations in public APIs.',
    type: 'Style', importance: 0.6, tags: ['naming', 'conventions', 'style'],
  },
  sty_errors: {
    content: 'Error messages should be actionable. Tell the user what went wrong and what to do about it. Never just "An error occurred".',
    type: 'Style', importance: 0.7, tags: ['errors', 'ux', 'style'],
  },
};

// Relationships reference memory aliases above.
const RELATIONSHIPS = [
  // Architecture cluster
  { from: 'arch_graph',       to: 'arch_vector',      type: 'RELATES_TO',   strength: 0.9 },
  { from: 'arch_api',         to: 'arch_graph',       type: 'PART_OF',      strength: 0.7 },
  { from: 'arch_enrichment',  to: 'arch_vector',      type: 'DERIVED_FROM', strength: 0.8 },
  { from: 'arch_enrichment',  to: 'arch_graph',       type: 'LEADS_TO',     strength: 0.6 },

  // Patterns ↔ Architecture
  { from: 'pat_proxy',        to: 'ctx_viewer',       type: 'PART_OF',      strength: 0.7 },
  { from: 'pat_conventional', to: 'hab_branch',       type: 'REINFORCES',   strength: 0.7 },

  // Preferences cluster
  { from: 'pref_minimal',     to: 'sty_code',         type: 'LEADS_TO',     strength: 0.8 },
  { from: 'pref_typescript',  to: 'pref_tailwind',    type: 'RELATES_TO',   strength: 0.5 },
  { from: 'pref_minimal',     to: 'pat_esm',          type: 'EXEMPLIFIES',  strength: 0.6 },

  // Project context cluster
  { from: 'ctx_viewer',       to: 'ctx_automem',      type: 'PART_OF',      strength: 0.9 },
  { from: 'ctx_railway',      to: 'ctx_automem',      type: 'PART_OF',      strength: 0.8 },
  { from: 'ctx_agents',       to: 'ctx_automem',      type: 'RELATES_TO',   strength: 0.85 },

  // Insights ↔ Architecture
  { from: 'ins_graphviz',     to: 'ctx_viewer',       type: 'RELATES_TO',   strength: 0.8 },
  { from: 'ins_embeddings',   to: 'arch_vector',      type: 'DERIVED_FROM', strength: 0.7 },
  { from: 'ins_latency',      to: 'arch_graph',       type: 'REINFORCES',   strength: 0.6 },
  { from: 'ins_recall',       to: 'arch_vector',      type: 'EVOLVED_INTO', strength: 0.7 },

  // Cross-cluster connections
  { from: 'sty_writing',      to: 'sty_errors',       type: 'RELATES_TO',   strength: 0.6 },
  { from: 'hab_cleanup',      to: 'pat_env',          type: 'REINFORCES',   strength: 0.5 },
];

// ---------------------------------------------------------------------------
// Seed runner
// ---------------------------------------------------------------------------

async function seed() {
  const idMap = {};
  const total = Object.keys(MEMORIES).length;
  let created = 0;

  console.log(`\nCreating ${total} memories…`);

  for (const [alias, mem] of Object.entries(MEMORIES)) {
    const res = await api('POST', '/memory', mem);
    idMap[alias] = res.memory_id;
    created++;
    process.stdout.write(`  [${created}/${total}] ${mem.type.padEnd(10)} ${alias}\n`);
  }

  console.log(`\n✓ Created ${created} memories`);

  console.log(`\nCreating ${RELATIONSHIPS.length} relationships…`);
  let linked = 0;

  for (const rel of RELATIONSHIPS) {
    const m1 = idMap[rel.from];
    const m2 = idMap[rel.to];
    if (!m1 || !m2) {
      console.warn(`  ⚠ skipping ${rel.from} → ${rel.to}: missing ID`);
      continue;
    }
    await api('POST', '/associate', {
      memory1_id: m1,
      memory2_id: m2,
      type: rel.type,
      strength: rel.strength,
    });
    linked++;
    process.stdout.write(`  [${linked}/${RELATIONSHIPS.length}] ${rel.from} —${rel.type}→ ${rel.to}\n`);
  }

  console.log(`\n✓ Created ${linked} relationships`);
  return { created, linked };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

async function verify() {
  console.log('\nVerifying via /graph/snapshot…');
  const snap = await api('GET', '/graph/snapshot');
  const s = snap.stats || {};

  const types = {};
  for (const n of snap.nodes || []) {
    types[n.type] = (types[n.type] || 0) + 1;
  }

  const relTypes = {};
  for (const e of snap.edges || []) {
    relTypes[e.type] = (relTypes[e.type] || 0) + 1;
  }

  console.log(`\n  Nodes: ${s.total_nodes || snap.nodes?.length || 0}`);
  console.log(`  Edges: ${s.total_edges || snap.edges?.length || 0}`);
  console.log(`  Types: ${Object.entries(types).map(([t, c]) => `${t}(${c})`).join(', ')}`);
  console.log(`  Relations: ${Object.entries(relTypes).map(([t, c]) => `${t}(${c})`).join(', ')}`);

  return snap;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('AutoMem Graph Viewer — Seed Script');
  console.log(`  api: ${API_URL}`);
  console.log(`  token: ${TOKEN.slice(0, 4)}${'*'.repeat(Math.max(0, TOKEN.length - 4))}`);

  await waitForHealth();

  if (args.reset) {
    await resetAll();
  }

  const { created, linked } = await seed();
  await verify();

  console.log('\n────────────────────────────────────────');
  console.log(`Done! ${created} memories, ${linked} relationships.`);
  console.log(`Open: http://localhost:5173/?token=${TOKEN}`);
  console.log('────────────────────────────────────────\n');
}

main().catch((err) => {
  console.error('\n✗ Seed failed:', err.message);
  process.exit(1);
});
