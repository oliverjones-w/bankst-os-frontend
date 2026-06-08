/**
 * finra-flow.js — FINRA Talent Flow Visualization
 *
 * Network graph showing firm-to-firm talent movements.
 * - Nodes = firms (size = flow volume, color = net gain/loss)
 * - Edges = people moving between firms (thickness = count)
 * - Time slider to see flows by date range
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

      // Telemetry: log data pipeline
      const changesArray = Array.isArray(changes) ? changes : [];
      const flowMoves = changesArray.filter(isFlowMove);
      console.log(`[FINRA Flow] Data pipeline: ${changesArray.length} changes → ${flowMoves.length} flow moves`);
      if (changesArray.length > 0) {
        const rejected = changesArray.filter(ch => !isFlowMove(ch)).slice(0, 3);
        console.log(`[FINRA Flow] Sample rejected changes:`, rejected);
      }

      return {
        changes: changesArray,
        runs: Array.isArray(runs) ? runs : [],
        dateFilter: getDefaultDateRange(runs),
        selectedFunction: "all",
      };
    },

    render: (data) => data ? renderRoot(data) : renderLoading(),

    afterRender: (data) => {
      // Initialize Cytoscape after DOM insertion (fixes issue #1)
      // Use setTimeout to ensure layout has calculated
      setTimeout(() => initializeCytoscape(data), 0);
    },

    handleClick(event, data, rerender) {
      // Date range slider
      const dateInput = event.target.closest("input[data-flow-date]");
      if (dateInput) {
        data.dateFilter.start = dateInput.value;
        rerender();
        return;
      }

      // Function filter
      const funcBtn = event.target.closest("[data-flow-func]");
      if (funcBtn) {
        data.selectedFunction = funcBtn.dataset.flowFunc;
        rerender();
        return;
      }
    },
  };
}

function renderLoading() {
  return `<div class="view-wrapper"><div class="view-empty">Loading…</div></div>`;
}

function renderRoot(data) {
  const changes = Array.isArray(data?.changes) ? data.changes : [];
  const runs = Array.isArray(data?.runs) ? data.runs : [];
  const dateFilter = data?.dateFilter || {};
  const selectedFunc = data?.selectedFunction || "all";

  // Filter changes by date and function
  const filtered = changes.filter(ch => {
    const hasFunction = selectedFunc === "all" || ch.function === selectedFunc;
    if (!isFlowMove(ch)) return false;
    // Date range filter (if specified)
    if (dateFilter.start) {
      const chDate = ch.detected_at?.split(" ")?.[0];
      if (!chDate || chDate < dateFilter.start) return false;
    }
    return hasFunction;
  });

  // Build network data
  const network = buildNetwork(filtered);
  const stats = calculateStats(network);

  // Get unique functions for filter buttons
  const functions = ["all", ...new Set(changes.map(ch => ch.function).filter(Boolean))];

  return `
    <div class="view-wrapper flow-view">
      <div class="flow-header">
        <div class="flow-controls">
          <div class="control-group">
            <label>Date Range Start:</label>
            <input type="date" data-flow-date value="${dateFilter.start || ""}" />
            <small>${runs[0]?.started_at?.split(" ")?.[0] || ""} onwards</small>
          </div>

          <div class="control-group">
            <label>Function:</label>
            <div class="button-group">
              ${functions.map(f => `
                <button class="btn-small ${selectedFunc === f ? "active" : ""}" data-flow-func="${f}">
                  ${f === "all" ? "All" : f}
                </button>
              `).join("")}
            </div>
          </div>
        </div>

        <div class="flow-stats">
          <div class="stat">
            <span class="label">Total Moves:</span>
            <span class="value">${filtered.length}</span>
          </div>
          <div class="stat">
            <span class="label">Firms Involved:</span>
            <span class="value">${stats.firmCount}</span>
          </div>
          <div class="stat">
            <span class="label">Largest Outflow:</span>
            <span class="value">${stats.largestOutflow.firm || "—"} (${stats.largestOutflow.count})</span>
          </div>
          <div class="stat">
            <span class="label">Largest Inflow:</span>
            <span class="value">${stats.largestInflow.firm || "—"} (${stats.largestInflow.count})</span>
          </div>
        </div>
      </div>

      <div id="finra-flow-graph" class="flow-graph">
        ${network.firms.length === 0 ? '<div style="padding: 2rem; text-align: center; color: var(--text-faint);">No firm-to-firm movements in selected date range</div>' : ''}
      </div>

      <div class="flow-legend">
        <div><span style="color:#4CAF50;font-weight:bold;">●</span> Net Inflow (Gaining talent)</div>
        <div><span style="color:#F44336;font-weight:bold;">●</span> Net Outflow (Losing talent)</div>
        <div><span style="color:#999;font-weight:bold;">●</span> Balanced (Equal in/out)</div>
        <div style="border-bottom: 2px dashed #999;">⊸ Arrivals/Departures (Inactive)</div>
      </div>

      <div class="flow-table">
        <h3>Top Movements</h3>
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>From</th>
              <th>To</th>
              <th>Role</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.slice(0, 10).map(ch => `
              <tr>
                <td>${escapeHtml(ch.name || "")}</td>
                <td>${escapeFirm(ch.old_status)}</td>
                <td>${escapeFirm(ch.new_status)}</td>
                <td>${escapeHtml(ch.function || "")}</td>
                <td>${ch.detected_at?.split(" ")?.[0] || ""}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function initializeCytoscape(data) {
  if (typeof window.cytoscape !== "function") {
    console.warn("[FINRA Flow] Cytoscape not loaded");
    return;
  }

  const container = document.getElementById("finra-flow-graph");
  if (!container) {
    console.warn("[FINRA Flow] Graph container not found");
    return;
  }

  const changes = Array.isArray(data?.changes) ? data.changes : [];
  const dateFilter = data?.dateFilter || {};
  const selectedFunc = data?.selectedFunction || "all";

  // Filter changes (same logic as renderRoot)
  const filtered = changes.filter(ch => {
    const hasFunction = selectedFunc === "all" || ch.function === selectedFunc;
    if (!isFlowMove(ch)) return false;
    if (dateFilter.start) {
      const chDate = ch.detected_at?.split(" ")?.[0];
      if (!chDate || chDate < dateFilter.start) return false;
    }
    return hasFunction;
  });

  const network = buildNetwork(filtered);
  const elements = buildCytoscapeElements(network);

  if (elements.length === 0) {
    console.log("[FINRA Flow] No elements to render");
    return;
  }

  const cy = window.cytoscape({
    container: container,
    style: [
      {
        selector: "node",
        css: {
          content: "data(label)",
          "text-valign": "bottom",
          "text-halign": "center",
          "text-margin-y": 6,
          "text-wrap": "wrap",
          "text-max-width": "80px",
          width: "data(size)",
          height: "data(size)",
          "background-color": "data(color)",
          "font-size": "11px",
          color: "#ccc",
          "text-outline-width": 0,
          "z-index": 10,
          shape: "data(shape)",
        }
      },
      {
        selector: "node[shape = 'rectangle']",
        css: {
          shape: "rectangle",
          width: "data(size)",
          height: "data(size)",
          "border-width": 2,
          "border-color": "#999",
        }
      },
      {
        selector: "edge",
        css: {
          width: "data(thickness)",
          "line-color": "data(color)",
          "target-arrow-color": "data(color)",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          opacity: 0.6,
        }
      },
      {
        selector: "edge.inactive-flow",
        css: {
          "line-style": "dashed",
          opacity: 0.3,
        }
      },
      {
        selector: "node:hover",
        css: {
          "z-index": 20,
          width: "data(hoverSize)",
          height: "data(hoverSize)",
        }
      },
      {
        selector: "edge:hover",
        css: {
          opacity: 1,
          width: "data(hoverThickness)",
        }
      }
    ],
    elements: elements,
    layout: {
      name: "cose",
      directed: true,
      animate: true,
      animationDuration: 500,
      avoidOverlap: true,
      nodeSpacing: 20,
    }
  });

  cy.fit();
  cy.resize(); // Fix issue #4: ensure canvas is properly sized
  console.log(`[FINRA Flow] Initialized with ${elements.filter(e => e.data.id).length} nodes and ${elements.filter(e => e.data.source).length} edges`);
}

function isFlowMove(change) {
  // Allow Inactive, but ensure we have valid strings and an actual movement occurred
  const from = change.old_status || "";
  const to = change.new_status || "";
  return from.length > 0 && to.length > 0 && from !== to;
}

function buildNetwork(changes) {
  const flows = {};
  const firms = new Set();

  changes.forEach(ch => {
    const from = normalizeFirm(ch.old_status);
    const to = normalizeFirm(ch.new_status);

    if (!from || !to || from === to) return;

    firms.add(from);
    firms.add(to);

    const key = `${from}→${to}`;
    if (!flows[key]) {
      flows[key] = { from, to, count: 0, people: [] };
    }
    flows[key].count += 1;
    flows[key].people.push(ch.name);
  });

  return {
    flows: Object.values(flows),
    firms: Array.from(firms),
  };
}

function calculateStats(network) {
  const inflows = {};
  const outflows = {};

  network.flows.forEach(flow => {
    inflows[flow.to] = (inflows[flow.to] || 0) + flow.count;
    outflows[flow.from] = (outflows[flow.from] || 0) + flow.count;
  });

  // Exclude "Inactive" from competitive statistics
  const largestInflow = Object.entries(inflows)
    .filter(([firm]) => firm !== "Inactive")
    .reduce((a, b) =>
      b[1] > a.count ? { firm: b[0], count: b[1] } : a,
      { firm: null, count: 0 }
    );

  const largestOutflow = Object.entries(outflows)
    .filter(([firm]) => firm !== "Inactive")
    .reduce((a, b) =>
      b[1] > a.count ? { firm: b[0], count: b[1] } : a,
      { firm: null, count: 0 }
    );

  // Exclude "Inactive" from firm count (it's not a real competitor)
  const firmCount = network.firms.filter(f => f !== "Inactive").length;

  return {
    firmCount,
    largestInflow,
    largestOutflow,
  };
}

function buildCytoscapeElements(network) {
  const inflows = {};
  const outflows = {};

  // Calculate net flow for each firm
  network.flows.forEach(flow => {
    inflows[flow.to] = (inflows[flow.to] || 0) + flow.count;
    outflows[flow.from] = (outflows[flow.from] || 0) + flow.count;
  });

  // Build nodes
  const nodes = network.firms.map(firm => {
    const isInactive = firm === "Inactive";
    const inf = inflows[firm] || 0;
    const out = outflows[firm] || 0;
    const net = inf - out;
    const baseSize = 40 + Math.sqrt(inf + out) * 8;

    let color = "#555555"; // Default muted grey for Inactive
    let shape = "ellipse"; // Default circle

    if (!isInactive) {
      color = "#999"; // Balanced for active firms
      if (net > 0) color = "#4CAF50"; // Inflow (green)
      else if (net < 0) color = "#F44336"; // Outflow (red)
    } else {
      shape = "rectangle"; // Inactive is a rectangle
    }

    // Cap size for Inactive to prevent dominating the graph
    const size = isInactive ? 50 : Math.max(40, baseSize);

    return {
      data: {
        id: firm,
        label: isInactive ? "Inactive" : firm.split(" ").slice(0, 2).join("\n"),
        size,
        hoverSize: size + 20,
        color,
        net: isInactive ? 0 : net,
        shape,
      }
    };
  });

  // Build edges
  const edges = network.flows.map(flow => {
    const thickness = Math.min(10, Math.max(1, flow.count * 0.5));
    const isInactiveFlow = flow.from === "Inactive" || flow.to === "Inactive";

    return {
      data: {
        id: `${flow.from}→${flow.to}`,
        source: flow.from,
        target: flow.to,
        thickness,
        hoverThickness: thickness * 1.5,
        color: isInactiveFlow ? "#999" : "#3f51b5",
        label: `${flow.count} moves`,
        classes: isInactiveFlow ? "inactive-flow" : "",
      }
    };
  });

  return [...nodes, ...edges];
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

function getDefaultDateRange(runs) {
  // Default to showing all data (no date filter)
  return { start: "" };
}

function rowsFrom(data) {
  return Array.isArray(data) ? data : [];
}
