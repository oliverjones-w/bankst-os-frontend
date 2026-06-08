/**
 * finra-flow.js — Animated Particle Network for Talent Flow Visualization
 *
 * Architecture:
 * 1. Data preprocessing: Stitch Firm A → Inactive → Firm B into direct paths
 * 2. Force-directed layout: D3.js simulation with high repulsion
 * 3. Particle animation: requestAnimationFrame loop with particle positions
 * 4. Interactive controls: Speed, garden leave filter, toggle Inactive, hover highlight
 */

import { escapeHtml } from "../utils.js";

export const FINRA_FLOW_VIEW_ID = "finra.flow";

export function createFinraFlowView(finraGet) {
  return {
    id: FINRA_FLOW_VIEW_ID,
    label: "FINRA Talent Flow",
    section: "Monitors",
    endpoint: "/api/finra/changes, /api/finra/runs",

    load: async () => {
      const [changes, runs] = await Promise.all([
        finraGet("/changes?limit=500"),
        finraGet("/runs"),
      ]);

      const changesArray = Array.isArray(changes) ? changes : [];
      console.log(`[FINRA Flow] Loaded ${changesArray.length} raw changes`);

      return {
        changes: changesArray,
        runs: Array.isArray(runs) ? runs : [],
        animationSpeed: 1.0,
        gardenLeaveMinDays: 0,
        showInactive: true,
      };
    },

    render: (data) => data ? renderRoot(data) : renderLoading(),

    afterRender: (data) => {
      setTimeout(() => initializeParticleGraph(data), 0);
    },

    handleClick(event, data, rerender) {
      // Animation speed slider
      const speedInput = event.target.closest("input[data-speed]");
      if (speedInput) {
        data.animationSpeed = parseFloat(speedInput.value);
        return;
      }

      // Garden leave filter
      const leaveInput = event.target.closest("input[data-garden-leave]");
      if (leaveInput) {
        data.gardenLeaveMinDays = parseInt(leaveInput.value);
        rerender();
        return;
      }

      // Toggle Inactive
      const inactiveToggle = event.target.closest("[data-toggle-inactive]");
      if (inactiveToggle) {
        data.showInactive = !data.showInactive;
        rerender();
        return;
      }

      // Highlight path on hover (see event delegation in initializeParticleGraph)
    },
  };
}

function renderLoading() {
  return `<div class="view-wrapper"><div class="view-empty">Loading…</div></div>`;
}

function renderRoot(data) {
  const changes = Array.isArray(data?.changes) ? data.changes : [];
  const animationSpeed = data?.animationSpeed || 1.0;
  const gardenLeaveMinDays = data?.gardenLeaveMinDays || 0;
  const showInactive = data?.showInactive ?? true;

  // Preprocess data: stitch inactive flows
  const stitched = stitchInactiveFlows(changes);
  console.log(`[FINRA Flow] After stitching: ${stitched.directPaths.length} direct paths, ${stitched.terminalInactive.length} terminal Inactive`);

  // Filter by garden leave threshold
  const filtered = stitched.directPaths.filter(path => {
    if (path.inactiveDuration === null) return true;
    return path.inactiveDuration >= gardenLeaveMinDays;
  });

  // Compute network topology
  const network = buildNetwork(filtered, showInactive);
  const commonPaths = computeCommonPaths(filtered, showInactive).slice(0, 10);

  return `
    <div class="view-wrapper flow-view">
      <div class="flow-header">
        <div class="flow-controls">
          <div class="control-group">
            <label>Animation Speed:</label>
            <input type="range" data-speed min="0.1" max="3" step="0.1" value="${animationSpeed}" />
            <small>${(animationSpeed * 100).toFixed(0)}%</small>
          </div>

          <div class="control-group">
            <label>Garden Leave Filter (≥ days):</label>
            <input type="range" data-garden-leave min="0" max="180" step="1" value="${gardenLeaveMinDays}" />
            <small>${gardenLeaveMinDays} days</small>
          </div>

          <div class="control-group">
            <label>
              <input type="checkbox" data-toggle-inactive ${showInactive ? "checked" : ""} />
              Show Arrivals/Departures
            </label>
          </div>
        </div>

        <div class="flow-stats">
          <div class="stat">
            <span class="label">Total Paths:</span>
            <span class="value">${filtered.length}</span>
          </div>
          <div class="stat">
            <span class="label">Firms:</span>
            <span class="value">${network.firms.length}</span>
          </div>
          <div class="stat">
            <span class="label">Total Moves:</span>
            <span class="value">${filtered.reduce((sum, p) => sum + p.count, 0)}</span>
          </div>
          <div class="stat">
            <span class="label">Avg Garden Leave:</span>
            <span class="value">${computeAvgGardenLeave(filtered)} days</span>
          </div>
        </div>
      </div>

      <div id="finra-particle-graph" class="flow-graph-container">
        <canvas id="particle-canvas" style="display: block; width: 100%; height: 100%;"></canvas>
      </div>

      <div class="flow-legend">
        <div><span style="color:#4CAF50;font-weight:bold;">●</span> Net Inflow</div>
        <div><span style="color:#F44336;font-weight:bold;">●</span> Net Outflow</div>
        <div><span style="color:#999;font-weight:bold;">●</span> Balanced</div>
        <div><span style="opacity:0.5;">◆</span> Arrival/Departure (if toggled)</div>
      </div>

      <div class="flow-table">
        <h3>Top Talent Paths</h3>
        <table id="common-paths-table">
          <thead>
            <tr>
              <th>From</th>
              <th>To</th>
              <th>Count</th>
              <th>Avg Leave (days)</th>
            </tr>
          </thead>
          <tbody>
            ${commonPaths.map(path => `
              <tr data-path-id="${escapeHtml(path.from)}→${escapeHtml(path.to)}" style="cursor: pointer;">
                <td>${escapeFirm(path.from)}</td>
                <td>${escapeFirm(path.to)}</td>
                <td><strong>${path.count}</strong></td>
                <td>${path.avgInactiveDuration || "—"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * Data Preprocessing: Stitch Inactive Flows
 *
 * Logic:
 * - Identify individuals with moves: Firm A → Inactive → Firm B
 * - Collapse to single path: Firm A → Firm B
 * - Calculate inactiveDuration (days between moves)
 * - Retain terminal Inactive moves (A → Inactive) only if no arrival found
 */
function stitchInactiveFlows(changes) {
  const changesArray = Array.isArray(changes) ? changes : [];

  // Index: person_name → [sorted moves by detected_at]
  const personMoves = {};
  changesArray.forEach(ch => {
    if (!ch.name) return;
    if (!personMoves[ch.name]) personMoves[ch.name] = [];
    personMoves[ch.name].push(ch);
  });

  // Sort each person's moves by detected_at
  Object.values(personMoves).forEach(moves => {
    moves.sort((a, b) => {
      const aDate = new Date(a.detected_at || 0).getTime();
      const bDate = new Date(b.detected_at || 0).getTime();
      return aDate - bDate;
    });
  });

  const directPaths = [];
  const terminalInactive = [];
  const used = new Set();

  // Identify stitched paths: A → Inactive → B
  Object.entries(personMoves).forEach(([person, moves]) => {
    for (let i = 0; i < moves.length - 1; i++) {
      const current = moves[i];
      const next = moves[i + 1];

      const key1 = `${person}:${i}`;
      const key2 = `${person}:${i + 1}`;

      if (used.has(key1) || used.has(key2)) continue;

      // Check if current → Inactive and next → Firm B
      const toInactive = isInactive(current.new_status);
      const fromInactive = isInactive(next.old_status);

      if (toInactive && fromInactive) {
        // Stitchable path
        const fromFirm = current.old_status;
        const toFirm = next.new_status;
        const durationMs = new Date(next.detected_at).getTime() - new Date(current.detected_at).getTime();
        const durationDays = Math.round(durationMs / (1000 * 60 * 60 * 24));

        directPaths.push({
          from: fromFirm,
          to: toFirm,
          person,
          count: 1,
          inactiveDuration: durationDays,
          people: [person],
        });

        used.add(key1);
        used.add(key2);
      }
    }
  });

  // Collect terminal Inactive moves (A → Inactive with no arrival)
  Object.entries(personMoves).forEach(([person, moves]) => {
    moves.forEach((move, idx) => {
      const key = `${person}:${idx}`;
      if (used.has(key)) return;

      if (isInactive(move.new_status)) {
        // Check if there's a subsequent arrival (next move from Inactive)
        const hasArrival = moves.slice(idx + 1).some(m => isInactive(m.old_status));
        if (!hasArrival) {
          terminalInactive.push(move);
        }
      }
    });
  });

  // Aggregate paths by (from, to)
  const pathMap = {};
  directPaths.forEach(path => {
    const key = `${path.from}→${path.to}`;
    if (!pathMap[key]) {
      pathMap[key] = { from: path.from, to: path.to, count: 0, people: [], durations: [] };
    }
    pathMap[key].count += 1;
    pathMap[key].people.push(path.person);
    if (path.inactiveDuration !== null) {
      pathMap[key].durations.push(path.inactiveDuration);
    }
  });

  // Compute average inactive duration
  const aggregated = Object.values(pathMap).map(path => ({
    from: path.from,
    to: path.to,
    count: path.count,
    people: path.people,
    inactiveDuration: path.durations.length > 0 ? Math.round(path.durations.reduce((a, b) => a + b) / path.durations.length) : null,
  }));

  return { directPaths: aggregated, terminalInactive };
}

function isInactive(status) {
  return status && status.trim().toLowerCase() === "inactive";
}

function buildNetwork(paths, showInactive) {
  const firmSet = new Set();
  const flows = [];

  paths.forEach(path => {
    const from = normalizeFirm(path.from);
    const to = normalizeFirm(path.to);

    if (!from || !to || from === to) return;
    if (!showInactive && (isInactive(from) || isInactive(to))) return;

    firmSet.add(from);
    firmSet.add(to);

    flows.push({
      from,
      to,
      count: path.count,
      inactiveDuration: path.inactiveDuration,
      isInactiveFlow: isInactive(from) || isInactive(to),
    });
  });

  return {
    firms: Array.from(firmSet),
    flows,
  };
}

function computeCommonPaths(paths, showInactive) {
  const pathMap = {};

  paths.forEach(path => {
    if (!showInactive && (isInactive(path.from) || isInactive(path.to))) return;

    const from = normalizeFirm(path.from);
    const to = normalizeFirm(path.to);

    if (!from || !to || from === to) return;

    const key = `${from}→${to}`;
    if (!pathMap[key]) {
      pathMap[key] = { from, to, count: 0, durations: [] };
    }
    pathMap[key].count += path.count;
    if (path.inactiveDuration !== null) {
      pathMap[key].durations.push(path.inactiveDuration);
    }
  });

  return Object.values(pathMap)
    .sort((a, b) => b.count - a.count)
    .map(p => ({
      ...p,
      avgInactiveDuration: p.durations.length > 0 ? Math.round(p.durations.reduce((a, b) => a + b) / p.durations.length) : null,
    }));
}

function computeAvgGardenLeave(paths) {
  const durations = paths
    .filter(p => p.inactiveDuration !== null)
    .map(p => p.inactiveDuration);

  if (durations.length === 0) return "—";
  const avg = Math.round(durations.reduce((a, b) => a + b) / durations.length);
  return avg;
}

/**
 * Initialize Particle-Based Graph
 *
 * Steps:
 * 1. Extract data for network topology
 * 2. Initialize D3 force simulation
 * 3. Setup Canvas for particle rendering
 * 4. Start requestAnimationFrame loop
 * 5. Attach event listeners for hover highlight
 */
function initializeParticleGraph(data) {
  if (typeof window.d3 !== "object") {
    console.warn("[FINRA Flow] D3.js not loaded");
    return;
  }

  const container = document.getElementById("finra-particle-graph");
  const canvas = document.getElementById("particle-canvas");

  if (!container || !canvas) {
    console.warn("[FINRA Flow] Canvas container not found");
    return;
  }

  const changes = Array.isArray(data?.changes) ? data.changes : [];
  const showInactive = data?.showInactive ?? true;
  const animationSpeed = data?.animationSpeed || 1.0;

  // Preprocess
  const stitched = stitchInactiveFlows(changes);
  const network = buildNetwork(stitched.directPaths, showInactive);

  // Setup canvas context
  const rect = container.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  const ctx = canvas.getContext("2d");
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  const width = rect.width;
  const height = rect.height;

  // Compute node metrics (inflow, outflow, net flow)
  const flowMetrics = {};
  network.flows.forEach(flow => {
    if (!flowMetrics[flow.from]) flowMetrics[flow.from] = { inflow: 0, outflow: 0 };
    if (!flowMetrics[flow.to]) flowMetrics[flow.to] = { inflow: 0, outflow: 0 };
    flowMetrics[flow.from].outflow += flow.count;
    flowMetrics[flow.to].inflow += flow.count;
  });

  // Initialize D3 force simulation
  const nodes = network.firms.map(firm => ({
    id: firm,
    firm,
    radius: computeNodeSize(flowMetrics[firm] || { inflow: 0, outflow: 0 }),
  }));

  const links = network.flows.map(flow => ({
    source: flow.from,
    target: flow.to,
    count: flow.count,
    isInactiveFlow: flow.isInactiveFlow,
  }));

  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links)
      .id(d => d.id)
      .distance(100)
      .strength(0.3))
    .force("charge", d3.forceManyBody().strength(-500))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide(d => d.radius + 10));

  // Let simulation stabilize
  simulation.tick(50);

  // Particle animation state
  const particleEmitters = new Map();
  links.forEach(link => {
    const sourceNode = nodes.find(n => n.id === link.source);
    const targetNode = nodes.find(n => n.id === link.target);
    const key = `${link.source}→${link.target}`;

    particleEmitters.set(key, {
      source: sourceNode,
      target: targetNode,
      count: link.count,
      particles: [],
      isInactiveFlow: link.isInactiveFlow,
    });
  });

  // Animation loop
  let animationFrameId = null;
  let time = 0;

  function animate() {
    // Clear canvas
    ctx.fillStyle = "var(--bg-secondary)";
    ctx.fillRect(0, 0, width, height);

    // Draw edges
    ctx.strokeStyle = "rgba(100, 150, 200, 0.15)";
    ctx.lineWidth = 1;
    links.forEach(link => {
      const source = nodes.find(n => n.id === link.source);
      const target = nodes.find(n => n.id === link.target);

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      // Bezier curve
      const mx = (source.x + target.x) / 2;
      const my = (source.y + target.y) / 2;
      const cpx = mx + (target.y - source.y) * 0.2;
      const cpy = my - (target.x - source.x) * 0.2;
      ctx.quadraticCurveTo(cpx, cpy, target.x, target.y);
      ctx.stroke();
    });

    // Update and draw particles
    particleEmitters.forEach((emitter, key) => {
      const emissionRate = emitter.count;
      const targetParticleCount = emissionRate;

      // Spawn particles
      while (emitter.particles.length < targetParticleCount) {
        emitter.particles.push({
          progress: 0,
          seed: Math.random(),
        });
      }

      // Update particles
      emitter.particles = emitter.particles.filter(p => {
        p.progress += (0.003 * animationSpeed);
        return p.progress < 1;
      });

      // Draw particles
      const particleRadius = emitter.isInactiveFlow ? 2 : 2.5;
      const particleOpacity = emitter.isInactiveFlow ? 0.3 : 0.6;
      const particleVelocity = emitter.isInactiveFlow ? 0.8 : 1;

      emitter.particles.forEach(p => {
        const adjustedProgress = p.progress * particleVelocity;
        const px = emitter.source.x + (emitter.target.x - emitter.source.x) * adjustedProgress;
        const py = emitter.source.y + (emitter.target.y - emitter.source.y) * adjustedProgress;

        ctx.fillStyle = `rgba(100, 150, 200, ${particleOpacity})`;
        ctx.beginPath();
        ctx.arc(px, py, particleRadius, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    // Draw nodes
    nodes.forEach(node => {
      const metrics = flowMetrics[node.id] || { inflow: 0, outflow: 0 };
      const net = metrics.inflow - metrics.outflow;

      let color = "#999999";
      if (net > 0) color = "#4CAF50";
      else if (net < 0) color = "#F44336";

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fill();

      // Node label
      ctx.fillStyle = "#ccc";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = isInactive(node.id) ? "Inactive" : node.id.split(" ").slice(0, 2).join(" ");
      ctx.fillText(label, node.x, node.y);
    });

    time += 1;
    animationFrameId = requestAnimationFrame(animate);
  }

  animate();

  // Event delegation for path highlighting
  const table = document.getElementById("common-paths-table");
  if (table) {
    table.addEventListener("mouseenter", (e) => {
      const row = e.target.closest("tr[data-path-id]");
      if (row) {
        const pathId = row.dataset.pathId;
        // Highlight particles for this path
        const emitter = particleEmitters.get(pathId);
        if (emitter) {
          emitter._highlight = true;
        }
      }
    }, true);

    table.addEventListener("mouseleave", (e) => {
      const row = e.target.closest("tr[data-path-id]");
      if (row) {
        particleEmitters.forEach(e => { e._highlight = false; });
      }
    }, true);
  }

  // Cleanup on unmount
  return () => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    simulation.stop();
  };
}

function computeNodeSize(metrics) {
  const totalFlow = (metrics.inflow || 0) + (metrics.outflow || 0);
  return Math.max(20, Math.min(60, 20 + Math.sqrt(totalFlow) * 5));
}

function normalizeFirm(status) {
  if (!status) return null;
  return status.trim();
}

function escapeFirm(status) {
  const firm = normalizeFirm(status);
  if (!firm) return "—";
  return escapeHtml(firm.split(" ").slice(0, 3).join(" "));
}
