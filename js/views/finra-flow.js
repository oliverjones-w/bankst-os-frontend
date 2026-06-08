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

      return {
        changes: Array.isArray(changes) ? changes : [],
        runs: Array.isArray(runs) ? runs : [],
        dateFilter: getDefaultDateRange(runs),
        selectedFunction: "all",
      };
    },

    render: (data) => data ? renderRoot(data) : renderLoading(),

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
    const chDate = ch.detected_at?.split(" ")?.[0];
    const inDateRange = !dateFilter.start || chDate >= dateFilter.start;
    const hasFunction = selectedFunc === "all" || ch.function === selectedFunc;
    return inDateRange && hasFunction && isFlowMove(ch);
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

      <div id="finra-flow-graph" class="flow-graph" style="width:100%;height:600px;">
        ${network.firms.length === 0 ? '<div style="padding: 2rem; text-align: center; color: var(--text-faint);">No firm-to-firm movements in selected date range</div>' : ''}
      </div>

      <div class="flow-legend">
        <div><span style="color:#4CAF50;font-weight:bold;">●</span> Net Inflow (Gaining talent)</div>
        <div><span style="color:#F44336;font-weight:bold;">●</span> Net Outflow (Losing talent)</div>
        <div><span style="color:#999;font-weight:bold;">●</span> Balanced (Equal in/out)</div>
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

      <script>
        (async function() {
          const container = document.getElementById('finra-flow-graph');
          if (!container || !window.cytoscape) return;

          const cy = window.cytoscape({
            container: container,
            style: [
              {
                selector: 'node',
                css: {
                  'content': 'data(label)',
                  'text-valign': 'center',
                  'text-halign': 'center',
                  'width': 'data(size)',
                  'height': 'data(size)',
                  'background-color': 'data(color)',
                  'font-size': '10px',
                  'color': '#fff',
                  'text-outline-width': 1,
                  'text-outline-color': '#333',
                  'z-index': 10,
                }
              },
              {
                selector: 'edge',
                css: {
                  'width': 'data(thickness)',
                  'line-color': 'data(color)',
                  'target-arrow-color': 'data(color)',
                  'target-arrow-shape': 'triangle',
                  'curve-style': 'bezier',
                  'opacity': 0.6,
                }
              },
              {
                selector: 'node:hover',
                css: {
                  'z-index': 20,
                  'width': 'data(hoverSize)',
                  'height': 'data(hoverSize)',
                }
              },
              {
                selector: 'edge:hover',
                css: {
                  'opacity': 1,
                  'width': 'data(hoverThickness)',
                }
              }
            ],
            elements: ${JSON.stringify(buildCytoscapeElements(network))},
            layout: {
              name: 'cose',
              directed: true,
              animate: true,
              animationDuration: 500,
              avoidOverlap: true,
              nodeSpacing: 20,
            }
          });

          cy.fit();
        })();
      </script>
    </div>
  `;
}

function isFlowMove(change) {
  // Only show actual firm-to-firm moves (not to/from inactive)
  const from = change.old_status || "";
  const to = change.new_status || "";
  return from !== "Inactive" && to !== "Inactive" && from.length > 0 && to.length > 0;
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

  const largestInflow = Object.entries(inflows).reduce((a, b) => b[1] > a[1] ? { firm: b[0], count: b[1] } : a, { firm: null, count: 0 });
  const largestOutflow = Object.entries(outflows).reduce((a, b) => b[1] > a[1] ? { firm: b[0], count: b[1] } : a, { firm: null, count: 0 });

  return {
    firmCount: network.firms.length,
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
    const inf = inflows[firm] || 0;
    const out = outflows[firm] || 0;
    const net = inf - out;
    const baseSize = 40 + Math.sqrt(inf + out) * 8;

    let color = "#999"; // Balanced
    if (net > 5) color = "#4CAF50"; // Inflow (green)
    else if (net < -5) color = "#F44336"; // Outflow (red)

    return {
      data: {
        id: firm,
        label: firm.split(" ").slice(0, 2).join("\n"),
        size: Math.max(40, baseSize),
        hoverSize: Math.max(50, baseSize + 20),
        color,
        net,
      }
    };
  });

  // Build edges
  const edges = network.flows.map(flow => {
    const thickness = Math.min(10, Math.max(1, flow.count * 0.5));
    return {
      data: {
        id: `${flow.from}→${flow.to}`,
        source: flow.from,
        target: flow.to,
        thickness,
        hoverThickness: thickness * 1.5,
        color: "#3f51b5",
        label: `${flow.count} moves`,
      }
    };
  });

  return [...nodes, ...edges];
}

function normalizeFirm(status) {
  if (!status || status === "Inactive") return null;
  return status.trim();
}

function escapeFirm(status) {
  const firm = normalizeFirm(status);
  if (!firm) return "—";
  return escapeHtml(firm.split(" ").slice(0, 3).join(" "));
}

function getDefaultDateRange(runs) {
  if (!Array.isArray(runs) || runs.length === 0) {
    return { start: "" };
  }

  // Find earliest run date for better default range
  const earliest = runs[runs.length - 1];
  if (!earliest.started_at) return { start: "" };

  const date = new Date(earliest.started_at);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return { start: `${year}-${month}-${day}` }; // Show all data from earliest run
}

function rowsFrom(data) {
  return Array.isArray(data) ? data : [];
}
