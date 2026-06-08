/**
 * finra-flow.js — Animated Particle Network for Talent Flow
 * ============================================================================
 * A force-directed network of financial firms where edges carry *animated
 * particles* representing people who moved between firms. The goal is
 * competitive-intelligence signal (who poaches from whom, in which desk, and
 * who exactly moved) rather than a static point-in-time snapshot.
 *
 * Concerns are split into clearly-separated sections:
 *   1. DATA TRANSFORM   — canonicalize + "stitch" raw FINRA change records,
 *                         enriched with name / function / desk for drill-down
 *   2. PHYSICS / LAYOUT — D3 force simulation that positions the nodes
 *   3. ANIMATION LOOP   — a single requestAnimationFrame loop drawing particles
 *   4. CONTROLS & DRILL — lenses (desk + function) and people drill-down
 *
 * ----------------------------------------------------------------------------
 * Host-framework constraints (see js/app-os.js) that shape this design:
 *   • `afterRender(data)` runs after every render; its RETURN VALUE IS IGNORED
 *     and there is no unmount hook.
 *   • The generic delegated dispatch only routes *click* events to handleClick.
 *     `input` (sliders), `change` (selects), and hover are NOT routed — so all
 *     interactive controls are wired with their own listeners in afterRender.
 *   • The animation loop SELF-TERMINATES the moment its <canvas> detaches from
 *     the DOM, and each fresh mount tears down the prior one — no leaked RAF
 *     loops / simulations across re-renders or view switches.
 *
 * Animation speed is a *live* variable the loop reads each frame. Topology /
 * filter changes rebuild the graph imperatively and keep the same loop. The
 * detail panel and selection state are updated imperatively too — this view
 * never calls the framework's re-render after the initial paint.
 * ============================================================================
 */

import { escapeHtml } from "../utils.js";

export const FINRA_FLOW_VIEW_ID = "finra.flow";

/* The single live controller for the mounted graph. Module-level so a new
 * mount can tear down a previous one even though the framework gives us no
 * unmount hook. */
let ACTIVE = null;

// ── Visual constants ────────────────────────────────────────────────────────
const COLOR_NET_POSITIVE = "#4CAF50"; // net inflow  (gaining talent)
const COLOR_NET_NEGATIVE = "#F44336"; // net outflow (losing talent)
const COLOR_BALANCED     = "#999999"; // equal in/out
const COLOR_INACTIVE     = "#6b7280"; // the "Inactive" pool node — not a competitor
const INACTIVE_LABEL     = "Inactive";
const ALL                = "__all__"; // sentinel for "no lens filter"

export function createFinraFlowView(finraGet) {
  return {
    id: FINRA_FLOW_VIEW_ID,
    label: "FINRA Talent Flow",
    section: "Monitors",
    endpoint: "/api/finra/changes",

    /* Fetch once; all interactivity afterward is client-side over this data. */
    load: async () => {
      const changes = await finraGet("/changes?limit=500");
      const raw = Array.isArray(changes) ? changes : [];

      // Pre-compute the stitched move list once — it never changes; only the
      // *filtering* of it changes as the user moves controls.
      const moves = stitchTalentFlows(raw);
      console.log(`[FINRA Flow] ${raw.length} raw changes → ${moves.length} moves`,
        summarizeMoveKinds(moves));

      return {
        moves,
        // Lens facets, derived once for the dropdowns.
        functions: distinctSorted(moves, "function"),
        groups: distinctSorted(moves, "group"),
        // Control state lives on `data` so it survives a cache-backed remount.
        controls: {
          speed: 1.0,
          gardenLeaveMinDays: 0,
          showInactive: true,
          functionFilter: ALL,
          groupFilter: ALL,
        },
      };
    },

    render: (data) => (data ? renderShell(data) : renderLoading()),

    /* The framework calls this after innerHTML is swapped in. We mount the
     * canvas + simulation + listeners here. */
    afterRender: (data) => {
      if (!data) return;
      // Defer one frame so layout has resolved the container's real size.
      requestAnimationFrame(() => mountGraph(data));
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 1. DATA TRANSFORM
// ════════════════════════════════════════════════════════════════════════════

/**
 * stitchTalentFlows — THE pre-processor.
 *
 * Raw FINRA records are per-person status changes: { finra_id, name,
 * old_status, new_status, detected_at, function, group }. A real job change
 * often shows up as TWO records: "Firm A → Inactive" then later
 * "Inactive → Firm B". This collapses such pairs into a single direct path
 * A → B and records the garden-leave gap as `inactiveDuration` (days).
 *
 * Each output "move" is enriched with the mover's identity so edges can be
 * drilled into:
 *   { from, to, person, name, function, group, date, kind, inactiveDuration }
 *   kind ∈ "direct" | "stitched" | "departure" | "arrival"
 *
 * For a stitched move we take the desk/role from the *arrival* record (where
 * they landed) — that's the competitively relevant "what are they building".
 */
function stitchTalentFlows(rawChanges) {
  // Group every record by its stable person id (CRD), keeping the timeline.
  const byPerson = new Map();
  for (const ch of rawChanges) {
    const pid = ch.finra_id || ch.name;
    if (!pid) continue;
    if (!byPerson.has(pid)) byPerson.set(pid, []);
    byPerson.get(pid).push(ch);
  }

  const moves = [];

  for (const [person, records] of byPerson) {
    records.sort((a, b) => parseTs(a.detected_at) - parseTs(b.detected_at));

    let i = 0;
    while (i < records.length) {
      const cur = records[i];
      const from = canonicalizeFirm(cur.old_status);
      const to   = canonicalizeFirm(cur.new_status);
      if (!from && !to) { i++; continue; }

      const next = records[i + 1];

      // ── Stitch: "→ Inactive" followed by "Inactive →" ─────────────────────
      if (isInactive(to) && next && isInactive(canonicalizeFirm(next.old_status))) {
        const landedAt = canonicalizeFirm(next.new_status);
        const days = daysBetween(cur.detected_at, next.detected_at);
        if (from && landedAt && from !== landedAt) {
          moves.push(makeMove(from, landedAt, person, "stitched", days, next, cur));
        }
        i += 2;
        continue;
      }

      // ── Terminal departure: "X → Inactive" ────────────────────────────────
      if (isInactive(to) && from) {
        moves.push(makeMove(from, INACTIVE_LABEL, person, "departure", null, cur));
        i++; continue;
      }

      // ── Leading arrival: "Inactive → Y" ───────────────────────────────────
      if (isInactive(from) && to) {
        moves.push(makeMove(INACTIVE_LABEL, to, person, "arrival", null, cur));
        i++; continue;
      }

      // ── Direct firm-to-firm move ──────────────────────────────────────────
      if (from && to && from !== to) {
        moves.push(makeMove(from, to, person, "direct", null, cur));
      }
      i++;
    }
  }

  return moves;
}

/** Build an enriched move. `rec` is the record that defines desk/role/date;
 *  `fallback` supplies metadata when rec is missing fields (stitched case). */
function makeMove(from, to, person, kind, inactiveDuration, rec, fallback) {
  const meta = rec || {};
  const fb = fallback || {};
  return {
    from, to, person, kind, inactiveDuration,
    name: meta.name || fb.name || "Unknown",
    function: cleanField(meta.function || fb.function),
    group: cleanField(meta.group || fb.group),
    date: (meta.detected_at || fb.detected_at || "").split(" ")[0] || "",
  };
}

/**
 * buildGraphData — apply the live filters and aggregate moves into a graph.
 * Recomputed cheaply on every control change.
 *
 * @returns { nodes, links, stats }
 *   links each retain `moves` (the enriched movers) for drill-down.
 */
function buildGraphData(moves, { showInactive, gardenLeaveMinDays, functionFilter, groupFilter }) {
  // ── Filter at the individual-move level ──────────────────────────────────
  const kept = moves.filter((m) => {
    if (!showInactive && (m.kind === "departure" || m.kind === "arrival")) return false;
    if (m.kind === "stitched" && m.inactiveDuration != null &&
        m.inactiveDuration < gardenLeaveMinDays) return false;
    if (functionFilter !== ALL && m.function !== functionFilter) return false;
    if (groupFilter !== ALL && m.group !== groupFilter) return false;
    return true;
  });

  // ── Aggregate identical (from → to) moves into weighted edges ────────────
  const linkMap = new Map();
  for (const m of kept) {
    const key = `${m.from}=>${m.to}`;
    let link = linkMap.get(key);
    if (!link) {
      link = { key, from: m.from, to: m.to, count: 0, moves: [], durations: [],
               viaInactive: m.from === INACTIVE_LABEL || m.to === INACTIVE_LABEL };
      linkMap.set(key, link);
    }
    link.count += 1;
    link.moves.push(m);
    if (m.inactiveDuration != null) link.durations.push(m.inactiveDuration);
  }
  const links = [...linkMap.values()].map((l) => ({
    ...l,
    avgInactiveDuration: l.durations.length
      ? Math.round(l.durations.reduce((a, b) => a + b, 0) / l.durations.length)
      : null,
  }));

  // ── Derive per-firm inflow / outflow / net to size & color the nodes ─────
  const agg = new Map();
  const touch = (id) => { if (!agg.has(id)) agg.set(id, { inflow: 0, outflow: 0 }); return agg.get(id); };
  for (const l of links) {
    touch(l.from).outflow += l.count;
    touch(l.to).inflow   += l.count;
  }

  const nodes = [...agg.keys()].map((id) => {
    const { inflow, outflow } = agg.get(id);
    const total = inflow + outflow;
    const net = inflow - outflow;
    const inactive = isInactive(id);
    return {
      id,
      label: inactive ? INACTIVE_LABEL : id,
      isInactive: inactive,
      inflow, outflow, total, net,
      radius: clamp(9 + Math.sqrt(total) * 6, 14, 46),
      color: inactive ? COLOR_INACTIVE
           : net > 0 ? COLOR_NET_POSITIVE
           : net < 0 ? COLOR_NET_NEGATIVE
           : COLOR_BALANCED,
    };
  });

  const allDurations = kept.filter((m) => m.inactiveDuration != null).map((m) => m.inactiveDuration);
  const stats = {
    pathCount: links.filter((l) => !l.viaInactive).length,
    firmCount: nodes.filter((n) => !n.isInactive).length,
    moveCount: kept.length,
    avgGardenLeave: allDurations.length
      ? Math.round(allDurations.reduce((a, b) => a + b, 0) / allDurations.length)
      : null,
  };

  return { nodes, links, stats };
}

/** Top firm-to-firm paths by volume (Inactive flows excluded). */
function topPaths(links, limit = 12) {
  return links
    .filter((l) => !l.viaInactive)
    .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from))
    .slice(0, limit);
}

// ── Firm-name canonicalization ───────────────────────────────────────────────
const FIRM_ALIASES = [
  [/morgan\s+stanley/i,           "Morgan Stanley"],
  [/goldman\s+sachs/i,            "Goldman Sachs"],
  [/^citigroup|citibank|^citi\b/i, "Citigroup"],
  [/bofa|bank of america|merrill/i, "Bank of America"],
  [/j\.?\s*p\.?\s*morgan|jpmorgan|jp\s+morgan/i, "JPMorgan"],
  [/deutsche\s+bank/i,            "Deutsche Bank"],
  [/credit\s+suisse/i,            "Credit Suisse"],
  [/barclays/i,                   "Barclays"],
  [/\bnomura/i,                   "Nomura"],
  [/\bubs\b/i,                    "UBS"],
  [/\brbc\b|royal bank of canada/i, "RBC Capital Markets"],
  [/\btd\b|toronto[- ]dominion/i, "TD Securities"],
  [/scotia/i,                     "Scotiabank"],
  [/\bbmo\b|bank of montreal/i,   "BMO Capital Markets"],
  [/wells\s+fargo/i,              "Wells Fargo"],
  [/jefferies/i,                  "Jefferies"],
  [/\bhsbc/i,                     "HSBC"],
  [/\bbnp\b|paribas/i,            "BNP Paribas"],
  [/societe\s+generale|soc\s*gen/i, "Société Générale"],
  [/mizuho/i,                     "Mizuho"],
  [/cantor/i,                     "Cantor Fitzgerald"],
];
const LEGAL_SUFFIXES = /\b(inc|incorporated|llc|l\.l\.c|lp|l\.p|ltd|limited|plc|co|corp|corporation|company|securities|capital|markets|group|global|international|usa|na|n\.a|and|&)\b/gi;

function canonicalizeFirm(status) {
  if (status == null) return null;
  const raw = String(status).trim();
  if (!raw) return null;
  if (raw.toLowerCase() === "inactive") return INACTIVE_LABEL;
  for (const [pattern, name] of FIRM_ALIASES) if (pattern.test(raw)) return name;
  const cleaned = raw.replace(/[.,]/g, " ").replace(LEGAL_SUFFIXES, " ").replace(/\s+/g, " ").trim();
  const base = cleaned || raw;
  return base.toLowerCase().split(" ").filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function isInactive(label) { return label === INACTIVE_LABEL; }
function cleanField(v) { const s = (v == null ? "" : String(v)).trim(); return s || "Unknown"; }

function distinctSorted(moves, key) {
  const set = new Set();
  for (const m of moves) if (m[key] && m[key] !== "Unknown") set.add(m[key]);
  return [...set].sort((a, b) => a.localeCompare(b));
}

// ── Time helpers (FINRA timestamps use a space separator) ─────────────────────
function parseTs(s) {
  if (!s) return 0;
  const t = new Date(String(s).replace(" ", "T")).getTime();
  return Number.isFinite(t) ? t : 0;
}
function daysBetween(a, b) {
  const ms = parseTs(b) - parseTs(a);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round(ms / 86_400_000);
}
function summarizeMoveKinds(moves) {
  return moves.reduce((acc, m) => { acc[m.kind] = (acc[m.kind] || 0) + 1; return acc; }, {});
}

// ════════════════════════════════════════════════════════════════════════════
// HTML SHELL
// ════════════════════════════════════════════════════════════════════════════

function renderLoading() {
  return `<div class="view-wrapper"><div class="view-empty">Loading…</div></div>`;
}

function renderShell(data) {
  const c = data.controls;
  const { stats, links } = buildGraphData(data.moves, c);

  const optionList = (values, selected) =>
    [`<option value="${ALL}"${selected === ALL ? " selected" : ""}>All</option>`]
      .concat(values.map((v) =>
        `<option value="${escapeHtml(v)}"${selected === v ? " selected" : ""}>${escapeHtml(v)}</option>`))
      .join("");

  return `
    <div class="view-wrapper flow-view">
      <div class="flow-controls">
        <label class="flow-control">
          <span>Desk</span>
          <select data-flow-group>${optionList(data.groups, c.groupFilter)}</select>
        </label>

        <label class="flow-control">
          <span>Function</span>
          <select data-flow-function>${optionList(data.functions, c.functionFilter)}</select>
        </label>

        <label class="flow-control">
          <span>Animation speed</span>
          <input type="range" data-flow-speed min="0" max="3" step="0.1" value="${c.speed}" />
          <small data-flow-speed-out>${c.speed.toFixed(1)}×</small>
        </label>

        <label class="flow-control">
          <span>Min garden leave</span>
          <input type="range" data-flow-leave min="0" max="180" step="5" value="${c.gardenLeaveMinDays}" />
          <small data-flow-leave-out>${c.gardenLeaveMinDays}d</small>
        </label>

        <label class="flow-control flow-control--toggle">
          <input type="checkbox" data-flow-inactive ${c.showInactive ? "checked" : ""} />
          <span>Arrivals / departures</span>
        </label>

        <div class="flow-stats" data-flow-stats>${renderStats(stats)}</div>
      </div>

      <div class="flow-stage">
        <div id="finra-flow-graph" class="flow-canvas-wrap">
          <canvas id="finra-flow-canvas"></canvas>
          <div class="flow-hint">Click a firm or a path for the people behind the move</div>
        </div>

        <aside class="flow-side">
          <div class="flow-legend">
            <span><i style="background:${COLOR_NET_POSITIVE}"></i>Net inflow</span>
            <span><i style="background:${COLOR_NET_NEGATIVE}"></i>Net outflow</span>
            <span><i style="background:${COLOR_BALANCED}"></i>Balanced</span>
            <span><i style="background:${COLOR_INACTIVE}"></i>Inactive pool</span>
          </div>
          <div class="flow-detail" data-flow-detail>${renderTopPaths(links)}</div>
        </aside>
      </div>
    </div>
  `;
}

function renderStats(stats) {
  const cell = (label, value) => `
    <div class="flow-stat"><span class="flow-stat-v">${value}</span><span class="flow-stat-l">${label}</span></div>`;
  return [
    cell("Paths", stats.pathCount),
    cell("Firms", stats.firmCount),
    cell("Moves", stats.moveCount),
    cell("Avg leave", stats.avgGardenLeave != null ? `${stats.avgGardenLeave}d` : "—"),
  ].join("");
}

// ── Detail panel renderers (default → path → firm) ────────────────────────────

function renderTopPaths(links) {
  const paths = topPaths(links);
  const rows = paths.length
    ? paths.map((p) => `
        <tr data-path-key="${escapeHtml(p.key)}">
          <td>${escapeHtml(p.from)}</td>
          <td class="flow-arrow">→</td>
          <td>${escapeHtml(p.to)}</td>
          <td class="flow-num">${p.count}</td>
          <td class="flow-num">${p.avgInactiveDuration != null ? `${p.avgInactiveDuration}d` : "—"}</td>
        </tr>`).join("")
    : `<tr><td colspan="5" class="flow-empty">No firm-to-firm paths in range</td></tr>`;

  return `
    <h3 class="flow-detail-title">Top paths by volume</h3>
    <table class="flow-paths">
      <thead><tr><th>From</th><th></th><th>To</th><th class="flow-num">n</th><th class="flow-num">Leave</th></tr></thead>
      <tbody data-flow-rows>${rows}</tbody>
    </table>`;
}

function renderPathDetail(link) {
  const sub = link.avgInactiveDuration != null
    ? `${link.count} ${plural(link.count, "move")} · avg garden leave ${link.avgInactiveDuration}d`
    : `${link.count} ${plural(link.count, "move")}`;
  return `
    <button class="flow-back" data-flow-back>← Top paths</button>
    <h3 class="flow-detail-title">${escapeHtml(link.from)} → ${escapeHtml(link.to)}</h3>
    <div class="flow-detail-sub">${escapeHtml(sub)}</div>
    ${renderPeople(link.moves)}`;
}

function renderFirmDetail(node, links) {
  const inflow = [];
  const outflow = [];
  for (const l of links) {
    if (l.to === node.id && l.from !== node.id) inflow.push(...l.moves.map((m) => ({ ...m, counterparty: m.from })));
    if (l.from === node.id && l.to !== node.id) outflow.push(...l.moves.map((m) => ({ ...m, counterparty: m.to })));
  }
  const netLabel = node.net > 0 ? `+${node.net} net` : node.net < 0 ? `${node.net} net` : "balanced";
  return `
    <button class="flow-back" data-flow-back>← Top paths</button>
    <h3 class="flow-detail-title">${escapeHtml(node.label)}</h3>
    <div class="flow-detail-sub">${node.inflow} in · ${node.outflow} out · ${escapeHtml(netLabel)}</div>
    <h4 class="flow-group-title flow-group-title--in">Gained (${inflow.length})</h4>
    ${renderPeople(inflow, "from")}
    <h4 class="flow-group-title flow-group-title--out">Lost (${outflow.length})</h4>
    ${renderPeople(outflow, "to")}`;
}

/** Shared people list. `cpKey` (optional) shows the counterparty firm. */
function renderPeople(moves, cpKey) {
  if (!moves.length) return `<div class="flow-empty">None</div>`;
  const sorted = moves.slice().sort((a, b) => parseTs(b.date) - parseTs(a.date));
  return `<ul class="flow-people">${sorted.map((m) => {
    const meta = [m.function, m.group].filter((x) => x && x !== "Unknown").join(" · ");
    const cp = cpKey ? `<span class="flow-person-cp">${escapeHtml(m.counterparty || "")}</span>` : "";
    const leave = m.inactiveDuration != null ? ` · ${m.inactiveDuration}d leave` : "";
    return `
      <li class="flow-person">
        <span class="flow-person-name">${escapeHtml(m.name)}</span>
        ${cp}
        <span class="flow-person-meta">${escapeHtml(meta)}${escapeHtml(m.date ? ` · ${m.date}` : "")}${escapeHtml(leave)}</span>
      </li>`;
  }).join("")}</ul>`;
}

function plural(n, word) { return n === 1 ? word : `${word}s`; }

// ════════════════════════════════════════════════════════════════════════════
// MOUNT
// ════════════════════════════════════════════════════════════════════════════

function mountGraph(data) {
  teardown(ACTIVE);
  ACTIVE = null;

  const wrap = document.getElementById("finra-flow-graph");
  const canvas = document.getElementById("finra-flow-canvas");
  if (!wrap || !canvas) return;

  if (typeof window.d3 !== "object") {
    wrap.innerHTML = `<div class="flow-canvas-msg">D3.js failed to load — cannot render graph.</div>`;
    return;
  }

  const ctx = canvas.getContext("2d");
  const css = getComputedStyle(document.documentElement);
  const palette = {
    edge:  (css.getPropertyValue("--border-color") || "#3a3a3a").trim(),
    label: (css.getPropertyValue("--text-primary") || "#e6e6e6").trim(),
    sub:   (css.getPropertyValue("--text-faint") || "#888").trim(),
  };

  const controller = {
    canvas, ctx, palette, data,
    controls: data.controls,
    graph: null,
    particles: new Map(),
    nodeById: new Map(),
    highlightKey: null,           // edge hovered in the paths table
    selection: null,              // { type: 'path'|'firm', key|id }
    selectedKey: null,            // resolved from selection for the loop
    focusNodeId: null,            // resolved from selection for the loop
    width: 0, height: 0, dpr: 1,
    simulation: null, rafId: 0, resizeObserver: null,
    listeners: [], leaveTimer: 0,
  };
  ACTIVE = controller;

  sizeCanvas(controller);
  rebuildGraph(controller);
  wireControls(controller, wrap);
  observeResize(controller, wrap);
  startAnimation(controller);
}

function rebuildGraph(controller) {
  const graph = buildGraphData(controller.data.moves, controller.controls);
  controller.graph = graph;
  controller.nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  setupSimulation(controller, controller.width, controller.height);
  buildParticles(controller);
  syncStats(controller);
  renderDetail(controller); // re-resolves selection against the new graph
}

// ════════════════════════════════════════════════════════════════════════════
// 2. PHYSICS / LAYOUT
// ════════════════════════════════════════════════════════════════════════════

function setupSimulation(controller, width, height) {
  const d3 = window.d3;
  if (controller.simulation) controller.simulation.stop();
  const { nodes, links } = controller.graph;

  const simNodes = nodes.map((n) => ({ ...n }));
  const simLinks = links.map((l) => ({ ...l, source: l.from, target: l.to }));

  const sim = d3.forceSimulation(simNodes)
    .force("charge", d3.forceManyBody().strength(-900).distanceMax(520))
    .force("link", d3.forceLink(simLinks).id((d) => d.id)
      .distance((l) => 90 + (l.viaInactive ? 60 : 0)).strength(0.25))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide((d) => d.radius + 14).strength(0.9))
    .force("x", d3.forceX(width / 2).strength(0.04))
    .force("y", d3.forceY(height / 2).strength(0.04))
    .stop();

  const ticks = Math.min(400, 120 + simNodes.length * 6);
  for (let i = 0; i < ticks; i++) sim.tick();
  for (const n of simNodes) {
    n.x = clamp(n.x, n.radius + 6, width - n.radius - 6);
    n.y = clamp(n.y, n.radius + 6, height - n.radius - 6);
  }

  const pos = new Map(simNodes.map((n) => [n.id, n]));
  for (const n of controller.graph.nodes) {
    const p = pos.get(n.id);
    n.x = p ? p.x : width / 2;
    n.y = p ? p.y : height / 2;
  }
  for (const l of controller.graph.links) {
    l._from = controller.nodeById.get(l.from);
    l._to   = controller.nodeById.get(l.to);
  }
  controller.simulation = sim;
}

// ════════════════════════════════════════════════════════════════════════════
// 3. ANIMATION LOOP
// ════════════════════════════════════════════════════════════════════════════

function buildParticles(controller) {
  const next = new Map();
  for (const l of controller.graph.links) {
    const n = clamp(Math.round(l.count * 1.4), 1, 14);
    const arr = [];
    for (let k = 0; k < n; k++) arr.push({ phase: (k + 0.5) / n });
    next.set(l.key, arr);
  }
  controller.particles = next;
}

function startAnimation(controller) {
  const { ctx, canvas } = controller;

  const frame = () => {
    if (!canvas.isConnected || ACTIVE !== controller) return;

    const { width, height } = controller;
    const speed = controller.controls.speed;
    ctx.clearRect(0, 0, width, height);

    const links = controller.graph.links;
    const nodes = controller.graph.nodes;
    // Focus+context: when something is selected/hovered, dim the rest.
    const hasFocus = !!(controller.selectedKey || controller.focusNodeId || controller.highlightKey);
    const isHot = (l) =>
      controller.highlightKey === l.key ||
      controller.selectedKey === l.key ||
      (controller.focusNodeId && (l.from === controller.focusNodeId || l.to === controller.focusNodeId));

    // ── Edges ────────────────────────────────────────────────────────────────
    for (const l of links) {
      if (!l._from || !l._to) continue;
      const hot = isHot(l);
      const dim = hasFocus && !hot;
      const geo = curveGeometry(l);
      ctx.beginPath();
      ctx.moveTo(geo.x0, geo.y0);
      ctx.quadraticCurveTo(geo.cx, geo.cy, geo.x1, geo.y1);
      const base = hot ? 0.55 : (l.viaInactive ? 0.10 : 0.18);
      ctx.strokeStyle = hexA(hot ? controller.palette.label : controller.palette.edge, dim ? base * 0.3 : base);
      ctx.lineWidth = hot ? 2 : 1;
      ctx.stroke();
    }

    // ── Particles ─────────────────────────────────────────────────────────────
    for (const l of links) {
      if (!l._from || !l._to) continue;
      const parts = controller.particles.get(l.key);
      if (!parts) continue;
      const hot = isHot(l);
      const dim = hasFocus && !hot;
      const vMul = l.viaInactive ? 0.45 : 1.0;
      let opacity = l.viaInactive ? 0.30 : 0.7;
      if (hot) opacity = 1.0; else if (dim) opacity *= 0.25;
      const radius = hot ? 3.2 : (l.viaInactive ? 1.8 : 2.4);
      const geo = curveGeometry(l);
      for (const p of parts) {
        p.phase += 0.0016 * speed * vMul;
        if (p.phase >= 1) p.phase -= 1;
        const pt = quadPoint(geo, p.phase);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = hexA(l._to.color, opacity);
        ctx.fill();
      }
    }

    // ── Nodes + labels ─────────────────────────────────────────────────────────
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const n of nodes) {
      const focused = controller.focusNodeId === n.id;
      const touches = controller.focusNodeId &&
        links.some((l) => (l.from === controller.focusNodeId || l.to === controller.focusNodeId) &&
                          (l.from === n.id || l.to === n.id));
      const dim = hasFocus && controller.focusNodeId && !focused && !touches;
      ctx.globalAlpha = dim ? 0.3 : 1;

      if (n.isInactive) {
        roundRect(ctx, n.x - n.radius, n.y - n.radius, n.radius * 2, n.radius * 2, 6);
        ctx.fillStyle = n.color; ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = n.color; ctx.fill();
      }
      if (focused) { ctx.lineWidth = 2; ctx.strokeStyle = controller.palette.label; ctx.stroke(); }

      ctx.fillStyle = controller.palette.label;
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText(truncate(n.label, 22), n.x, n.y + n.radius + 9);
      if (!n.isInactive && n.radius >= 20) {
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.font = "bold 11px system-ui, sans-serif";
        ctx.fillText(n.net > 0 ? `+${n.net}` : `${n.net}`, n.x, n.y);
      }
      ctx.globalAlpha = 1;
    }

    controller.rafId = requestAnimationFrame(frame);
  };

  controller.rafId = requestAnimationFrame(frame);
}

function curveGeometry(l) {
  const x0 = l._from.x, y0 = l._from.y, x1 = l._to.x, y1 = l._to.y;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const dx = x1 - x0, dy = y1 - y0;
  const dist = Math.hypot(dx, dy) || 1;
  const bow = Math.min(40, dist * 0.18) * keyBowSign(l.key);
  return { x0, y0, x1, y1, cx: mx + (-dy / dist) * bow, cy: my + (dx / dist) * bow };
}
function quadPoint(g, t) {
  const u = 1 - t;
  return {
    x: u * u * g.x0 + 2 * u * t * g.cx + t * t * g.x1,
    y: u * u * g.y0 + 2 * u * t * g.cy + t * t * g.y1,
  };
}
function keyBowSign(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return h % 2 === 0 ? 1 : -1;
}

// ════════════════════════════════════════════════════════════════════════════
// 4. CONTROLS & DRILL-DOWN
// ════════════════════════════════════════════════════════════════════════════

function wireControls(controller, wrap) {
  const root = wrap.closest(".flow-view") || document;
  const on = (el, type, fn, opts) => {
    if (!el) return;
    el.addEventListener(type, fn, opts);
    controller.listeners.push({ el, type, fn });
  };

  // Animation speed — LIVE variable, no rebuild.
  const speed = root.querySelector("[data-flow-speed]");
  const speedOut = root.querySelector("[data-flow-speed-out]");
  on(speed, "input", () => {
    controller.controls.speed = parseFloat(speed.value);
    if (speedOut) speedOut.textContent = `${controller.controls.speed.toFixed(1)}×`;
  });

  // Garden-leave threshold — debounced rebuild (keeps selection).
  const leave = root.querySelector("[data-flow-leave]");
  const leaveOut = root.querySelector("[data-flow-leave-out]");
  on(leave, "input", () => {
    const v = parseInt(leave.value, 10) || 0;
    controller.controls.gardenLeaveMinDays = v;
    if (leaveOut) leaveOut.textContent = `${v}d`;
    clearTimeout(controller.leaveTimer);
    controller.leaveTimer = setTimeout(() => rebuildGraph(controller), 90);
  });

  // Desk + function lenses — reset drill-down selection, then rebuild.
  const group = root.querySelector("[data-flow-group]");
  on(group, "change", () => {
    controller.controls.groupFilter = group.value;
    controller.selection = null;
    rebuildGraph(controller);
  });
  const fn = root.querySelector("[data-flow-function]");
  on(fn, "change", () => {
    controller.controls.functionFilter = fn.value;
    controller.selection = null;
    rebuildGraph(controller);
  });

  // Show/hide arrivals & departures.
  const toggle = root.querySelector("[data-flow-inactive]");
  on(toggle, "change", () => {
    controller.controls.showInactive = !!toggle.checked;
    controller.selection = null;
    rebuildGraph(controller);
  });

  // Detail panel: hover highlights an edge; click drills into a path; back.
  const detail = root.querySelector("[data-flow-detail]");
  on(detail, "mouseover", (e) => {
    const row = e.target.closest("[data-path-key]");
    if (row) controller.highlightKey = row.dataset.pathKey;
  });
  on(detail, "mouseout", (e) => {
    if (e.target.closest("[data-path-key]")) controller.highlightKey = null;
  });
  on(detail, "click", (e) => {
    if (e.target.closest("[data-flow-back]")) {
      controller.selection = null;
      renderDetail(controller);
      return;
    }
    const row = e.target.closest("[data-path-key]");
    if (row) {
      controller.selection = { type: "path", key: row.dataset.pathKey };
      renderDetail(controller);
    }
  });

  // Canvas click → hit-test a node → drill into that firm (or clear).
  on(controller.canvas, "click", (e) => {
    const rect = controller.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const hit = controller.graph.nodes.find((n) => Math.hypot(x - n.x, y - n.y) <= n.radius + 3);
    controller.selection = hit ? { type: "firm", id: hit.id } : null;
    renderDetail(controller);
  });
  // Pointer affordance when hovering a node.
  on(controller.canvas, "mousemove", (e) => {
    const rect = controller.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const over = controller.graph.nodes.some((n) => Math.hypot(x - n.x, y - n.y) <= n.radius + 3);
    controller.canvas.style.cursor = over ? "pointer" : "default";
  });
}

/** Render the detail panel from the current selection, and sync the loop's
 *  focus/selection keys so the canvas emphasises the right elements. */
function renderDetail(controller) {
  const root = controller.canvas.closest(".flow-view") || document;
  const el = root.querySelector("[data-flow-detail]");
  if (!el) return;

  const sel = controller.selection;
  controller.selectedKey = null;
  controller.focusNodeId = null;

  if (sel?.type === "path") {
    const link = controller.graph.links.find((l) => l.key === sel.key);
    if (link) {
      controller.selectedKey = link.key;
      el.innerHTML = renderPathDetail(link);
      return;
    }
  } else if (sel?.type === "firm") {
    const node = controller.nodeById.get(sel.id);
    if (node) {
      controller.focusNodeId = node.id;
      el.innerHTML = renderFirmDetail(node, controller.graph.links);
      return;
    }
  }
  controller.selection = null;
  el.innerHTML = renderTopPaths(controller.graph.links);
}

function syncStats(controller) {
  const root = controller.canvas.closest(".flow-view") || document;
  const statsEl = root.querySelector("[data-flow-stats]");
  if (statsEl) statsEl.innerHTML = renderStats(controller.graph.stats);
}

// ── Canvas sizing (HiDPI aware) ───────────────────────────────────────────────
function sizeCanvas(controller) {
  const { canvas } = controller;
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  controller.width = Math.max(320, Math.round(rect.width));
  controller.height = Math.max(360, Math.round(rect.height));
  controller.dpr = dpr;
  canvas.width = controller.width * dpr;
  canvas.height = controller.height * dpr;
  canvas.style.width = `${controller.width}px`;
  canvas.style.height = `${controller.height}px`;
  controller.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function observeResize(controller, wrap) {
  if (typeof ResizeObserver !== "function") return;
  let t = 0;
  const ro = new ResizeObserver(() => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (!controller.canvas.isConnected || ACTIVE !== controller) return;
      sizeCanvas(controller);
      setupSimulation(controller, controller.width, controller.height);
    }, 120);
  });
  ro.observe(wrap);
  controller.resizeObserver = ro;
}

function teardown(controller) {
  if (!controller) return;
  if (controller.rafId) cancelAnimationFrame(controller.rafId);
  if (controller.simulation) controller.simulation.stop();
  if (controller.resizeObserver) controller.resizeObserver.disconnect();
  clearTimeout(controller.leaveTimer);
  for (const { el, type, fn } of controller.listeners) el.removeEventListener(type, fn);
  controller.listeners = [];
}

// ── Small utilities ───────────────────────────────────────────────────────────
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function truncate(s, n) { return s.length > n ? `${s.slice(0, n - 1)}…` : s; }

function hexA(color, alpha) {
  const c = String(color).trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(c.replace(/^#/, "#"));
  if (m) {
    const hex = m[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return c || `rgba(136,136,136,${alpha})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
