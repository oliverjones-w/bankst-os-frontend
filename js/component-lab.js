import { UI_STATES } from "./ui-states.js";

// ── Playground fixtures ───────────────────────────────────────────────────────

const FIXTURES = {
  firms: [
    { name: "Millennium Management",          strategy: "Rates RV",      aum: "$68.4B" },
    { name: "Balyasny Asset Management",      strategy: "Macro",         aum: "$21.0B" },
    { name: "LS Power Equity Advisors LLC",   strategy: "Power & Gas",   aum: "$4.2B"  },
    { name: "Acadian Asset Management",       strategy: "Quant",         aum: "$91.0B" },
  ],
  people: [
    { name: "David Flowerdew",                       fn: "PM",      product: "Agency MBS" },
    { name: "Alexandria-Christina van der Hoeven",   fn: "Trader",  product: "Rates Options" },
    { name: "K. Li",                                 fn: "Analyst", product: "IG Credit" },
    { name: null,                                    fn: "PM",      product: null },        // null data
  ],
  edge: {
    longName:    "Goldman Sachs Asset Management International Holdings Ltd.",
    veryLong:    "Veritas Capital Fund Management LLC — Special Opportunities Vehicle IV",
    missingData: null,
    bigNumber:   "$1,204,500,000,000",
    tinyNumber:  "$0.00",
    errorMsg:    "Failed to load — connection refused (ECONNREFUSED 127.0.0.1:8003)",
    emptyList:   [],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function e(str) {
  if (str == null) return '<span style="color:var(--text-faint);font-style:italic;">—</span>';
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function stateDemo(state, content, opts = {}) {
  const cls = ["state-demo", opts.cls].filter(Boolean).join(" ");
  return `
    <div class="${cls}" ${state !== "default" ? `data-force="${state}"` : ""}>
      ${content}
    </div>
  `;
}

function stateGrid(states, renderFn, opts = {}) {
  const cols = states.map(state => `
    <div class="state-col ${opts.wide ? "state-col--wide" : ""}">
      <div class="state-label">${state}</div>
      ${stateDemo(state, renderFn(state), opts)}
    </div>
  `).join("");
  return `<div class="state-grid">${cols}</div>`;
}

function subsection(label, content) {
  return `
    <div class="cl-subsection">
      <div class="cl-subsection-label">${label}</div>
      ${content}
    </div>
  `;
}

function section(id, title, desc, content) {
  return `
    <section class="cl-section" id="section-${id}">
      <div class="cl-section-header">
        <h2 class="cl-section-title">${title}</h2>
        ${desc ? `<p class="cl-section-desc">${desc}</p>` : ""}
      </div>
      ${content}
    </section>
  `;
}

// ── Component renderers ───────────────────────────────────────────────────────

function renderButtonPrimary() {
  return stateGrid(UI_STATES.button, (state) =>
    `<button class="button-solid-norm" ${state === "disabled" ? "disabled" : ""}>
      Primary Action
    </button>`
  );
}

function renderIconButton() {
  return stateGrid(UI_STATES.button, (state) =>
    `<button class="icon-button" ${state === "disabled" ? "disabled" : ""}>⌕</button>
     <button class="icon-button" ${state === "disabled" ? "disabled" : ""}>⚙</button>`
  );
}

function renderToolbarButton() {
  return stateGrid(UI_STATES.button, (state) =>
    `<button class="toolbar-button ${state === "active" ? "is-active" : ""}"
       ${state === "disabled" ? "disabled" : ""}>Table</button>
     <button class="toolbar-button ${state === "active" ? "is-active" : ""}"
       ${state === "disabled" ? "disabled" : ""}>Detail</button>`
  );
}

function renderNavItems() {
  return stateGrid(UI_STATES.navItem, (state) =>
    `<button class="nav-item ${state === "active" ? "is-active" : ""}"
       ${state === "disabled" ? "disabled" : ""} style="width:160px;">
      <span class="nav-icon">◉</span>
      <span class="nav-label">People</span>
    </button>`,
    { cls: "state-demo--surface" }
  );
}

function renderTags() {
  const categories = ["function", "strategy", "product"];
  return categories.map(cat => `
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <span class="lab-tag" data-category="${cat}">${cat}</span>
    </div>
  `).join("");
}

function renderStatusDots() {
  return UI_STATES.statusDot.map(state => `
    <div class="dot-row" style="margin-right:16px;">
      <div class="status-dot dot--${state}"></div>
      <span>${state}</span>
    </div>
  `).join("");
}

function renderTableRows() {
  const header = `
    <div class="cl-table-header">
      <div>Name</div><div>Strategy</div><div>AUM</div><div>Status</div>
    </div>
  `;

  const rows = stateGrid(["default", "hover", "selected", "error"], (state) => {
    const firm = state === "error"
      ? { name: FIXTURES.edge.longName, strategy: "Rates RV", aum: FIXTURES.edge.bigNumber }
      : FIXTURES.firms[0];
    return `
      <div class="cl-table">
        ${header}
        <div class="cl-table-row">
          <div class="cl-table-cell">${e(firm.name)}</div>
          <div class="cl-table-cell cl-table-cell--secondary">${e(firm.strategy)}</div>
          <div class="cl-table-cell cl-table-cell--faint">${e(firm.aum)}</div>
          <div class="cl-table-cell">
            <div class="dot-row">
              <div class="status-dot dot--active"></div>
              <span>Active</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }, { cls: "state-demo--flush", wide: true });

  return rows;
}

function renderTableFixtures() {
  const header = `
    <div class="cl-table-header">
      <div>Name</div><div>Function</div><div>Product</div>
    </div>
  `;
  const rowsHTML = FIXTURES.people.map(p => `
    <div class="cl-table-row">
      <div class="cl-table-cell">${e(p.name)}</div>
      <div class="cl-table-cell cl-table-cell--secondary">${e(p.fn)}</div>
      <div class="cl-table-cell cl-table-cell--faint">${e(p.product)}</div>
    </div>
  `).join("");
  return `
    <div class="cl-table">
      ${header}
      ${rowsHTML}
    </div>
  `;
}

function renderSkeletonRows() {
  const rows = Array(4).fill(0).map(() => `
    <div class="skeleton-row">
      <div class="skeleton skeleton-cell" style="width:70%;"></div>
      <div class="skeleton skeleton-cell" style="width:55%;"></div>
      <div class="skeleton skeleton-cell" style="width:40%;"></div>
      <div class="skeleton skeleton-cell" style="width:30%;"></div>
    </div>
  `).join("");
  return `
    <div class="cl-table" style="border-top:var(--divider-anchor);">
      ${rows}
    </div>
  `;
}

function renderCards() {
  return stateGrid(UI_STATES.card, (state) =>
    `<div class="cl-card">
      <div class="cl-card-title">David Flowerdew</div>
      <div class="cl-card-meta">PM · Agency MBS · Millennium</div>
    </div>`
  );
}

function renderInputs() {
  return stateGrid(UI_STATES.input, (state) =>
    `<input
      class="cl-input"
      type="text"
      placeholder="Search people…"
      value="${state === "focus" || state === "error" ? "Flowerd" : ""}"
      ${state === "disabled" ? "disabled" : ""}
      style="width:160px;"
    />`
  );
}

function renderCommandTrigger() {
  return stateGrid(["default", "hover"], (state) =>
    `<button class="command-trigger" style="max-width:220px;">
      <span class="command-trigger-label">Search or jump to…</span>
      <span style="font-family:var(--font-monospace);font-size:11px;">⌘K</span>
    </button>`,
    { cls: "state-demo--surface" }
  );
}

function renderEmptyState() {
  return `
    <div class="state-demo state-demo--surface" style="min-height:120px;width:100%;">
      <div class="cl-empty">
        <div class="cl-empty-label">No results found</div>
      </div>
    </div>
    <div class="state-demo state-demo--surface" style="min-height:120px;width:100%;margin-top:8px;">
      <div class="cl-empty">
        <div class="cl-empty-label">Signals</div>
        <div style="font-size:10px;color:var(--text-faint);opacity:0.6;font-style:italic;">
          Context will appear here when an entity is open
        </div>
      </div>
    </div>
  `;
}

function renderEdgeCases() {
  return `
    <div class="cl-table" style="border-top:var(--divider-anchor);">
      <div class="cl-table-header">
        <div>Case</div><div>Value</div><div>Notes</div>
      </div>
      <div class="cl-table-row">
        <div class="cl-table-cell">Long firm name</div>
        <div class="cl-table-cell cl-table-cell--secondary" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e(FIXTURES.edge.veryLong)}</div>
        <div class="cl-table-cell"><span class="fixture-note">truncate</span></div>
      </div>
      <div class="cl-table-row">
        <div class="cl-table-cell">Missing data</div>
        <div class="cl-table-cell">${e(FIXTURES.edge.missingData)}</div>
        <div class="cl-table-cell"><span class="fixture-note">null → —</span></div>
      </div>
      <div class="cl-table-row">
        <div class="cl-table-cell">Large number</div>
        <div class="cl-table-cell cl-table-cell--faint">${e(FIXTURES.edge.bigNumber)}</div>
        <div class="cl-table-cell"><span class="fixture-note">font-data</span></div>
      </div>
      <div class="cl-table-row">
        <div class="cl-table-cell">Error message</div>
        <div class="cl-table-cell" style="color:var(--color-red);font-family:var(--font-monospace);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e(FIXTURES.edge.errorMsg)}</div>
        <div class="cl-table-cell"><span class="fixture-note">error</span></div>
      </div>
    </div>
  `;
}

// ── Section definitions ───────────────────────────────────────────────────────

const SECTIONS = [
  {
    id: "buttons",
    title: "Buttons",
    desc: "All button variants across every interactive state.",
    render: () => [
      subsection("button-solid-norm — Primary action", renderButtonPrimary()),
      subsection("icon-button — Topbar / toolbar icons", renderIconButton()),
      subsection("toolbar-button — View mode switcher", renderToolbarButton()),
    ].join(""),
  },
  {
    id: "nav",
    title: "Navigation",
    desc: "Left rail nav items with icon + label.",
    render: () => [
      subsection("nav-item — all states", renderNavItems()),
    ].join(""),
  },
  {
    id: "tags",
    title: "Tags & Status",
    desc: "Category pills and FINRA status dot system.",
    render: () => [
      subsection("lab-tag — category variants", renderTags()),
      subsection("status-dot — active / inactive / null / error", `<div style="display:flex;flex-wrap:wrap;gap:4px 24px;padding:12px;">${renderStatusDots()}</div>`),
    ].join(""),
  },
  {
    id: "rows",
    title: "Table Rows",
    desc: "Data rows across interactive states. Fixtures test real data shapes.",
    render: () => [
      subsection("row states", renderTableRows()),
      subsection("fixture data — people (null, long name)", renderTableFixtures()),
      subsection("skeleton — loading state", renderSkeletonRows()),
    ].join(""),
  },
  {
    id: "cards",
    title: "Cards",
    desc: "Context cards and floating card variants.",
    render: () => [
      subsection("cl-card — default / focused / dragging", renderCards()),
    ].join(""),
  },
  {
    id: "inputs",
    title: "Inputs",
    desc: "Text inputs and command trigger across all states.",
    render: () => [
      subsection("cl-input — text input", renderInputs()),
      subsection("command-trigger", renderCommandTrigger()),
    ].join(""),
  },
  {
    id: "empty",
    title: "Empty States",
    desc: "No-data and context-empty patterns.",
    render: () => renderEmptyState(),
  },
  {
    id: "edge",
    title: "Edge Cases",
    desc: "Long names, null values, large numbers, error strings. Catch layout failures early.",
    render: () => renderEdgeCases(),
  },
];

// ── Nav + render ──────────────────────────────────────────────────────────────

function buildNav() {
  const nav = document.getElementById("clNav");
  nav.innerHTML = SECTIONS.map((s, i) => `
    <button class="cl-nav-item ${i === 0 ? "is-active" : ""}"
      data-section="${s.id}">${s.title}</button>
  `).join("");

  nav.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-section]");
    if (!btn) return;
    nav.querySelectorAll(".cl-nav-item").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    const target = document.getElementById(`section-${btn.dataset.section}`);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function buildPreview() {
  const preview = document.getElementById("clPreview");
  preview.innerHTML = SECTIONS.map(s =>
    section(s.id, s.title, s.desc, s.render())
  ).join("");
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  buildNav();
  buildPreview();
});
