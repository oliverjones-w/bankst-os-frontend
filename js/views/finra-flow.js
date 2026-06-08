/**
 * finra-flow.js — Animated Particle Network for Talent Flow
 * ============================================================================
 * A force-directed network of financial firms where edges carry *animated
 * particles* representing people who moved between firms. The goal is
 * competitive-intelligence signal (who poaches from whom, how long people sit
 * on garden leave) rather than a static point-in-time snapshot.
 *
 * The module is split into three clearly-separated concerns:
 *   1. DATA TRANSFORM   — canonicalize + "stitch" raw FINRA change records
 *   2. PHYSICS / LAYOUT — D3 force simulation that positions the nodes
 *   3. ANIMATION LOOP   — a single requestAnimationFrame loop drawing particles
 *
 * ----------------------------------------------------------------------------
 * Host-framework constraints (see js/app-os.js) that shape this design:
 *   • `afterRender(data)` runs after every render; its RETURN VALUE IS IGNORED
 *     and there is no unmount hook. So cleanup cannot rely on a returned fn.
 *   • The generic delegated dispatch only routes *click* events to a view's
 *     handleClick. `input` (range sliders) and `mouseenter` (hover) are NOT
 *     routed. Therefore every interactive control is wired with its own
 *     listener inside afterRender.
 *   • To avoid leaking RAF loops / simulations across re-renders and view
 *     switches, the animation loop SELF-TERMINATES the moment its <canvas>
 *     detaches from the DOM, and each fresh mount tears down the prior one.
 *
 * Animation speed is a *live* variable the loop reads each frame — changing it
 * never triggers a re-render. Topology-changing controls (garden-leave filter,
 * show/hide arrivals) rebuild the graph imperatively and keep the same loop.
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
        // Control state lives on `data` so it survives a cache-backed remount.
        controls: { speed: 1.0, gardenLeaveMinDays: 0, showInactive: true },
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
 * Raw FINRA records are per-person status changes: { finra_id, old_status,
 * new_status, detected_at, ... }. A real job change often shows up as TWO
 * records: "Firm A → Inactive" then later "Inactive → Firm B". This collapses
 * such pairs into a single direct path A → B and records how long the person
 * sat Inactive (garden leave) as `inactiveDuration` (days).
 *
 * Output: a flat list of "move" objects, each representing ONE person's move:
 *   { from, to, person, kind, inactiveDuration }
 *   kind ∈ "direct" | "stitched" | "departure" | "arrival"
 *
 * Rules:
 *   • A→Inactive immediately followed (next event for that person) by
 *     Inactive→B  ⟹  one "stitched" move A→B with inactiveDuration set.
 *   • A terminal "X → Inactive" with no following arrival ⟹ "departure".
 *   • A leading "Inactive → Y" with no preceding departure ⟹ "arrival".
 *   • Any "X → Y" where neither side is Inactive ⟹ "direct".
 */
function stitchTalentFlows(rawChanges) {
  // Group every record by its stable person id (CRD), keeping the timeline.
  const byPerson = new Map();
  for (const ch of rawChanges) {
    const pid = ch.finra_id || ch.name; // finra_id preferred; name as fallback
    if (!pid) continue;
    if (!byPerson.has(pid)) byPerson.set(pid, []);
    byPerson.get(pid).push(ch);
  }

  const moves = [];

  for (const [person, records] of byPerson) {
    // Chronological order so "A→Inactive" can be paired with the *next* event.
    records.sort((a, b) => parseTs(a.detected_at) - parseTs(b.detected_at));

    let i = 0;
    while (i < records.length) {
      const cur = records[i];
      const from = canonicalizeFirm(cur.old_status);
      const to   = canonicalizeFirm(cur.new_status);

      // Skip records we can't place (missing both endpoints, or a no-op).
      if (!from && !to) { i++; continue; }

      const next = records[i + 1];

      // ── Stitch: "→ Inactive" followed by "Inactive →" ─────────────────────
      if (
        isInactive(to) && next &&
        isInactive(canonicalizeFirm(next.old_status))
      ) {
        const landedAt = canonicalizeFirm(next.new_status);
        const days = daysBetween(cur.detected_at, next.detected_at);
        if (from && landedAt && from !== landedAt) {
          moves.push({
            from, to: landedAt, person,
            kind: "stitched", inactiveDuration: days,
          });
        }
        i += 2; // consume both halves
        continue;
      }

      // ── Terminal departure: "X → Inactive" (no arrival follows) ───────────
      if (isInactive(to) && from) {
        moves.push({ from, to: INACTIVE_LABEL, person, kind: "departure", inactiveDuration: null });
        i++;
        continue;
      }

      // ── Leading arrival: "Inactive → Y" (not consumed by a stitch) ────────
      if (isInactive(from) && to) {
        moves.push({ from: INACTIVE_LABEL, to, person, kind: "arrival", inactiveDuration: null });
        i++;
        continue;
      }

      // ── Direct firm-to-firm move ──────────────────────────────────────────
      if (from && to && from !== to) {
        moves.push({ from, to, person, kind: "direct", inactiveDuration: null });
      }
      i++;
    }
  }

  return moves;
}

/**
 * buildGraphData — apply the live filters and aggregate moves into a graph.
 * Recomputed cheaply on every control change.
 *
 * @returns { nodes, links, stats }
 *   nodes: [{ id, label, isInactive, inflow, outflow, total, net, radius, color }]
 *   links: [{ key, from, to, count, kind, viaInactive, avgInactiveDuration, people }]
 *   stats: { pathCount, firmCount, moveCount, avgGardenLeave }
 */
function buildGraphData(moves, { showInactive, gardenLeaveMinDays }) {
  // ── Filter at the individual-move level ──────────────────────────────────
  const kept = moves.filter((m) => {
    if (!showInactive && (m.kind === "departure" || m.kind === "arrival")) return false;
    // Garden-leave threshold only applies to stitched paths (the only ones
    // that carry a measured inactive duration).
    if (m.kind === "stitched" && m.inactiveDuration != null &&
        m.inactiveDuration < gardenLeaveMinDays) return false;
    return true;
  });

  // ── Aggregate identical (from → to) moves into weighted edges ────────────
  const linkMap = new Map();
  for (const m of kept) {
    const key = `${m.from}=>${m.to}`;
    let link = linkMap.get(key);
    if (!link) {
      link = { key, from: m.from, to: m.to, count: 0, people: [], durations: [],
               viaInactive: m.from === INACTIVE_LABEL || m.to === INACTIVE_LABEL };
      linkMap.set(key, link);
    }
    link.count += 1;
    if (m.person) link.people.push(m.person);
    if (m.inactiveDuration != null) link.durations.push(m.inactiveDuration);
  }
  const links = [...linkMap.values()].map((l) => ({
    ...l,
    avgInactiveDuration: l.durations.length
      ? Math.round(l.durations.reduce((a, b) => a + b, 0) / l.durations.length)
      : null,
  }));

  // ── Derive per-firm inflow / outflow / net to size & color the nodes ─────
  const agg = new Map(); // id → { inflow, outflow }
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
      // Node size scales with total historical volume (sqrt keeps it sane).
      radius: clamp(9 + Math.sqrt(total) * 6, 14, 46),
      // Color STRICTLY by net flow (req. 2). Inactive is neutral — it is a
      // holding pool, not a competitor, so coloring it green/red would mislead.
      color: inactive ? COLOR_INACTIVE
           : net > 0 ? COLOR_NET_POSITIVE
           : net < 0 ? COLOR_NET_NEGATIVE
           : COLOR_BALANCED,
    };
  });

  // ── Headline stats (exclude the Inactive pool from "firms") ──────────────
  const allDurations = kept.filter((m) => m.inactiveDuration != null).map((m) => m.inactiveDuration);
  const stats = {
    pathCount: links.filter((l) => !l.viaInactive).length,
    firmCount: nodes.filter((n) => !n.isInactive).length,
    moveCount: kept.reduce((s) => s + 1, 0),
    avgGardenLeave: allDurations.length
      ? Math.round(allDurations.reduce((a, b) => a + b, 0) / allDurations.length)
      : null,
  };

  return { nodes, links, stats };
}

/** Top firm-to-firm paths by volume (Inactive flows excluded). */
function topPaths(links, limit = 10) {
  return links
    .filter((l) => !l.viaInactive)
    .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from))
    .slice(0, limit);
}

// ── Firm-name canonicalization ───────────────────────────────────────────────
// FINRA status strings are raw legal entity names ("MORGAN STANLEY & CO. LLC").
// Collapse them to clean, comparable firm labels so one firm = one node.

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

  // 1) Known-firm alias match wins (handles "CITIGROUP GLOBAL MARKETS INC.").
  for (const [pattern, name] of FIRM_ALIASES) {
    if (pattern.test(raw)) return name;
  }

  // 2) Fallback: strip legal-entity noise, collapse punctuation, Title Case.
  const cleaned = raw
    .replace(/[.,]/g, " ")
    .replace(LEGAL_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
  const base = cleaned || raw;
  return base
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function isInactive(label) {
  return label === INACTIVE_LABEL;
}

// ── Time helpers (FINRA timestamps use a space separator) ─────────────────────
function parseTs(s) {
  if (!s) return 0;
  // Convert "2026-06-08 14:23:59" → ISO so Safari/Firefox parse it reliably.
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
  // Build an initial graph just to populate stats + the paths table on first
  // paint; the canvas itself is filled in by mountGraph().
  const { stats, links } = buildGraphData(data.moves, c);

  return `
    <div class="view-wrapper flow-view">
      <div class="flow-controls">
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
          <span>Show arrivals / departures</span>
        </label>

        <div class="flow-stats" data-flow-stats>
          ${renderStats(stats)}
        </div>
      </div>

      <div class="flow-stage">
        <div id="finra-flow-graph" class="flow-canvas-wrap">
          <canvas id="finra-flow-canvas"></canvas>
        </div>

        <aside class="flow-side">
          <div class="flow-legend">
            <span><i style="background:${COLOR_NET_POSITIVE}"></i>Net inflow</span>
            <span><i style="background:${COLOR_NET_NEGATIVE}"></i>Net outflow</span>
            <span><i style="background:${COLOR_BALANCED}"></i>Balanced</span>
            <span><i style="background:${COLOR_INACTIVE}"></i>Inactive pool</span>
          </div>
          <h3>Top paths by volume</h3>
          <table class="flow-paths">
            <thead><tr><th>From</th><th>To</th><th>n</th><th>Leave</th></tr></thead>
            <tbody data-flow-paths>${renderPathRows(topPaths(links))}</tbody>
          </table>
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

function renderPathRows(paths) {
  if (!paths.length) {
    return `<tr><td colspan="4" class="flow-paths-empty">No firm-to-firm paths in range</td></tr>`;
  }
  return paths.map((p) => `
    <tr data-path-key="${escapeHtml(p.key)}">
      <td>${escapeHtml(p.from)}</td>
      <td>${escapeHtml(p.to)}</td>
      <td class="flow-num">${p.count}</td>
      <td class="flow-num">${p.avgInactiveDuration != null ? `${p.avgInactiveDuration}d` : "—"}</td>
    </tr>`).join("");
}

// ════════════════════════════════════════════════════════════════════════════
// MOUNT — wires canvas, simulation, animation loop, and controls together
// ════════════════════════════════════════════════════════════════════════════

function mountGraph(data) {
  // Tear down any prior instance first (re-render / refresh safety).
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
  // Resolve theme colors ONCE here. (Canvas can't read CSS variables — the
  // previous version's `ctx.fillStyle = "var(--bg-secondary)"` was a no-op bug.)
  const css = getComputedStyle(document.documentElement);
  const palette = {
    edge:  (css.getPropertyValue("--border-color") || "#3a3a3a").trim(),
    label: (css.getPropertyValue("--text-primary") || "#e6e6e6").trim(),
    sub:   (css.getPropertyValue("--text-faint") || "#888").trim(),
  };

  // The controller owns all mutable state the animation loop reads each frame.
  const controller = {
    canvas, ctx, palette, data,
    controls: data.controls,
    graph: null,         // { nodes, links } — swapped on rebuild
    particles: new Map(), // linkKey → [{ phase }]
    nodeById: new Map(),
    highlightKey: null,  // path row currently hovered
    width: 0, height: 0, dpr: 1,
    simulation: null,
    rafId: 0,
    resizeObserver: null,
    listeners: [],       // [{ el, type, fn }] for clean teardown
    leaveTimer: 0,
  };
  ACTIVE = controller;

  sizeCanvas(controller);
  rebuildGraph(controller);          // build graph + simulation + particles
  wireControls(controller, wrap);    // sliders / toggle / hover
  observeResize(controller, wrap);
  startAnimation(controller);
}

/** Rebuild graph data + physics + particle pools from current control state. */
function rebuildGraph(controller) {
  const { data, width, height } = controller;
  const graph = buildGraphData(data.moves, controller.controls);
  controller.graph = graph;
  controller.nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  setupSimulation(controller, width, height);
  buildParticles(controller);
  syncSidePanels(controller); // refresh stats + paths table to match filters
}

// ════════════════════════════════════════════════════════════════════════════
// 2. PHYSICS / LAYOUT  (D3 force-directed)
// ════════════════════════════════════════════════════════════════════════════

/**
 * setupSimulation — position nodes with a force-directed layout.
 *
 * High many-body repulsion spreads nodes out and prevents the hub-and-spoke
 * clustering you get when one firm has many edges. We settle the simulation
 * synchronously (tick a fixed number of times) then stop it, so the animation
 * loop can read static node.x / node.y without the layout fighting the RAF.
 */
function setupSimulation(controller, width, height) {
  const d3 = window.d3;
  if (controller.simulation) controller.simulation.stop();

  const { nodes, links } = controller.graph;

  // D3 mutates node objects in place (adds x/y/vx/vy) and rewrites link
  // source/target from ids to node refs — operate on shallow clones so a
  // rebuild always starts from clean data.
  const simNodes = nodes.map((n) => ({ ...n }));
  const simLinks = links.map((l) => ({ ...l, source: l.from, target: l.to }));

  const sim = d3.forceSimulation(simNodes)
    .force("charge", d3.forceManyBody().strength(-900).distanceMax(520))
    .force("link", d3.forceLink(simLinks).id((d) => d.id)
      .distance((l) => 90 + (l.viaInactive ? 60 : 0))
      .strength(0.25))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide((d) => d.radius + 14).strength(0.9))
    .force("x", d3.forceX(width / 2).strength(0.04))
    .force("y", d3.forceY(height / 2).strength(0.04))
    .stop();

  // Settle synchronously, then freeze.
  const ticks = Math.min(400, 120 + simNodes.length * 6);
  for (let i = 0; i < ticks; i++) sim.tick();

  // Clamp into the viewport so nothing renders off-canvas.
  for (const n of simNodes) {
    n.x = clamp(n.x, n.radius + 6, width - n.radius - 6);
    n.y = clamp(n.y, n.radius + 6, height - n.radius - 6);
  }

  // Push the settled coordinates back onto the render nodes.
  const pos = new Map(simNodes.map((n) => [n.id, n]));
  for (const n of controller.graph.nodes) {
    const p = pos.get(n.id);
    n.x = p ? p.x : width / 2;
    n.y = p ? p.y : height / 2;
  }
  // Pre-compute each link's curved geometry for drawing + particle travel.
  for (const l of controller.graph.links) {
    l._from = controller.nodeById.get(l.from);
    l._to   = controller.nodeById.get(l.to);
  }
  controller.simulation = sim;
}

// ════════════════════════════════════════════════════════════════════════════
// 3. ANIMATION LOOP  (Canvas particles)
// ════════════════════════════════════════════════════════════════════════════

/**
 * buildParticles — seed each edge with a particle pool whose SIZE is
 * proportional to the number of people who made that move. More movers ⇒ a
 * denser, more obviously "busy" stream.
 */
function buildParticles(controller) {
  const next = new Map();
  for (const l of controller.graph.links) {
    // ~1.4 particles per person, capped, at least 1 so every edge animates.
    const n = clamp(Math.round(l.count * 1.4), 1, 14);
    const arr = [];
    for (let k = 0; k < n; k++) {
      arr.push({ phase: (k + 0.5) / n }); // evenly staggered along the curve
    }
    next.set(l.key, arr);
  }
  controller.particles = next;
}

/**
 * startAnimation — the single requestAnimationFrame loop.
 *
 * Reads `controller.graph` / `controller.particles` / `controller.controls`
 * every frame, so imperative rebuilds take effect without restarting the loop.
 * SELF-TERMINATES when the canvas leaves the DOM (view switch / re-render),
 * which is how we clean up without an unmount hook.
 */
function startAnimation(controller) {
  const { ctx, canvas } = controller;

  const frame = () => {
    // Stop if our canvas was replaced (another view rendered, or a refresh).
    if (!canvas.isConnected || ACTIVE !== controller) return;

    const { width, height } = controller;
    const speed = controller.controls.speed;
    ctx.clearRect(0, 0, width, height);

    const links = controller.graph.links;
    const nodes = controller.graph.nodes;

    // ── Edges: faint, unbundled quadratic-bezier curves ─────────────────────
    for (const l of links) {
      if (!l._from || !l._to) continue;
      const hot = controller.highlightKey === l.key;
      const geo = curveGeometry(l);
      ctx.beginPath();
      ctx.moveTo(geo.x0, geo.y0);
      ctx.quadraticCurveTo(geo.cx, geo.cy, geo.x1, geo.y1);
      ctx.strokeStyle = hexA(paletteOrFallback(controller, hot), hot ? 0.55 : (l.viaInactive ? 0.10 : 0.18));
      ctx.lineWidth = hot ? 2 : 1;
      ctx.stroke();
    }

    // ── Particles travel ALONG each curve (same geometry as the edge) ───────
    for (const l of links) {
      if (!l._from || !l._to) continue;
      const parts = controller.particles.get(l.key);
      if (!parts) continue;

      const hot = controller.highlightKey === l.key;
      // Arrivals/departures (to/from the Inactive pool) are dimmer & slower.
      const vMul = l.viaInactive ? 0.45 : 1.0;
      const baseOpacity = l.viaInactive ? 0.30 : 0.7;
      const opacity = hot ? 1.0 : baseOpacity;
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

    // ── Nodes + labels ───────────────────────────────────────────────────────
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const n of nodes) {
      // Inactive pool drawn as a rounded square to read as "not a competitor".
      if (n.isInactive) {
        roundRect(ctx, n.x - n.radius, n.y - n.radius, n.radius * 2, n.radius * 2, 6);
        ctx.fillStyle = n.color;
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.fill();
      }

      // Label under the node, truncated to keep the canvas uncluttered.
      ctx.fillStyle = controller.palette.label;
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText(truncate(n.label, 22), n.x, n.y + n.radius + 9);
      // Net flow figure inside larger nodes.
      if (!n.isInactive && n.radius >= 20) {
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.font = "bold 11px system-ui, sans-serif";
        ctx.fillText(n.net > 0 ? `+${n.net}` : `${n.net}`, n.x, n.y);
      }
    }

    controller.rafId = requestAnimationFrame(frame);
  };

  controller.rafId = requestAnimationFrame(frame);
}

/* Quadratic-bezier geometry for a link, with a perpendicular bow so that
 * A→B and B→A don't overlap. The bow direction is stable per key. */
function curveGeometry(l) {
  const x0 = l._from.x, y0 = l._from.y, x1 = l._to.x, y1 = l._to.y;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const dx = x1 - x0, dy = y1 - y0;
  const dist = Math.hypot(dx, dy) || 1;
  const bow = Math.min(40, dist * 0.18) * (keyBowSign(l.key));
  // Perpendicular unit vector × bow.
  const cx = mx + (-dy / dist) * bow;
  const cy = my + (dx / dist) * bow;
  return { x0, y0, x1, y1, cx, cy };
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

function paletteOrFallback(controller, hot) {
  return hot ? controller.palette.label : controller.palette.edge || "#888";
}

// ════════════════════════════════════════════════════════════════════════════
// 4. CONTROLS & STATE  (own listeners — framework doesn't route these)
// ════════════════════════════════════════════════════════════════════════════

function wireControls(controller, wrap) {
  const root = wrap.closest(".flow-view") || document;
  const on = (el, type, fn, opts) => {
    if (!el) return;
    el.addEventListener(type, fn, opts);
    controller.listeners.push({ el, type, fn });
  };

  // Animation speed — LIVE variable, no rebuild, no re-render.
  const speed = root.querySelector("[data-flow-speed]");
  const speedOut = root.querySelector("[data-flow-speed-out]");
  on(speed, "input", () => {
    controller.controls.speed = parseFloat(speed.value);
    if (speedOut) speedOut.textContent = `${controller.controls.speed.toFixed(1)}×`;
  });

  // Garden-leave threshold — changes topology; debounce the rebuild slightly.
  const leave = root.querySelector("[data-flow-leave]");
  const leaveOut = root.querySelector("[data-flow-leave-out]");
  on(leave, "input", () => {
    const v = parseInt(leave.value, 10) || 0;
    controller.controls.gardenLeaveMinDays = v;
    if (leaveOut) leaveOut.textContent = `${v}d`;
    clearTimeout(controller.leaveTimer);
    controller.leaveTimer = setTimeout(() => rebuildGraph(controller), 90);
  });

  // Show/hide arrivals & departures — mounts/unmounts the Inactive pool.
  const toggle = root.querySelector("[data-flow-inactive]");
  on(toggle, "change", () => {
    controller.controls.showInactive = !!toggle.checked;
    rebuildGraph(controller);
  });

  // Hover a path row → highlight its edge. mouseover/out bubble (delegated).
  const paths = root.querySelector("[data-flow-paths]");
  on(paths, "mouseover", (e) => {
    const row = e.target.closest("[data-path-key]");
    if (row) controller.highlightKey = row.dataset.pathKey;
  });
  on(paths, "mouseout", (e) => {
    const row = e.target.closest("[data-path-key]");
    if (row) controller.highlightKey = null;
  });
}

/** Refresh the stats block and paths table to match the current filters. */
function syncSidePanels(controller) {
  const root = controller.canvas.closest(".flow-view") || document;
  const statsEl = root.querySelector("[data-flow-stats]");
  if (statsEl) statsEl.innerHTML = renderStats(controller.graph.stats);
  const pathsEl = root.querySelector("[data-flow-paths]");
  if (pathsEl) pathsEl.innerHTML = renderPathRows(topPaths(controller.graph.links));
}

// ── Canvas sizing (HiDPI aware) ───────────────────────────────────────────────
function sizeCanvas(controller) {
  const { canvas } = controller;
  const wrap = canvas.parentElement;
  const rect = wrap.getBoundingClientRect();
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
      // Re-center & re-settle the existing graph for the new dimensions.
      setupSimulation(controller, controller.width, controller.height);
    }, 120);
  });
  ro.observe(wrap);
  controller.resizeObserver = ro;
}

// ── Teardown ──────────────────────────────────────────────────────────────────
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

/** Apply an alpha to a #rrggbb (or named/var-resolved) color. */
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
  // Fallback for short hex / unexpected formats.
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
