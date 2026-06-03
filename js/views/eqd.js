/**
 * EQD Command Center view.
 * Master-detail pattern: people table → click row → full detail page.
 * No drawer. Intelligence fields are editable inline on the detail page.
 */

import { escapeHtml } from "../utils.js?v=3";

export const EQD_VIEW_ID = "eqd.command-center";

let _cy = null;

// ── Canvas drag system ────────────────────────────────────────────────────────
// Module-level — survives re-renders, uses custom events to trigger rerenders.

let _drag        = null;   // current drag state
let _dragReady   = false;  // listeners attached once

function _initCanvasDrag() {
  if (_dragReady) return;
  _dragReady = true;

  document.addEventListener("mousedown", (e) => {
    const listItem = e.target.closest("[data-canvas-add]");
    if (listItem && e.button === 0) {
      e.preventDefault();
      const personId = listItem.dataset.canvasAdd;
      const name = listItem.querySelector(".eqd-clist-name")?.textContent || "…";
      const ghost = _makeGhost(name, e.clientX, e.clientY);
      _drag = { type: "from-list", personId, ghost };
      document.body.classList.add("eqd-dragging");
      return;
    }

    const card = e.target.closest("[data-canvas-card]");
    if (card && e.button === 0 && !e.target.closest("[data-canvas-unpin]")) {
      e.preventDefault();
      const board = document.getElementById("eqd-canvas-board");
      if (!board) return;
      const cr = card.getBoundingClientRect();
      _drag = {
        type:    "move-card",
        personId: card.dataset.canvasCard,
        cardEl:  card,
        boardEl: board,
        ox:      e.clientX - cr.left,
        oy:      e.clientY - cr.top,
      };
      card.style.zIndex = "200";
      document.body.classList.add("eqd-dragging");
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (!_drag) return;
    if (_drag.ghost) {
      _drag.ghost.style.left = `${e.clientX + 12}px`;
      _drag.ghost.style.top  = `${e.clientY - 18}px`;
    }
    if (_drag.type === "move-card" && _drag.cardEl) {
      const br = _drag.boardEl.getBoundingClientRect();
      const x  = Math.max(0, e.clientX - br.left  - _drag.ox);
      const y  = Math.max(0, e.clientY - br.top   - _drag.oy);
      _drag.cardEl.style.left = `${x}px`;
      _drag.cardEl.style.top  = `${y}px`;
    }
  });

  document.addEventListener("mouseup", (e) => {
    if (!_drag) return;
    const d = _drag;
    _drag = null;
    document.body.classList.remove("eqd-dragging");

    if (d.type === "from-list") {
      d.ghost?.remove();
      const board = document.getElementById("eqd-canvas-board");
      if (board) {
        const br = board.getBoundingClientRect();
        if (e.clientX >= br.left && e.clientX <= br.right &&
            e.clientY >= br.top  && e.clientY <= br.bottom) {
          document.dispatchEvent(new CustomEvent("eqd:canvas-place", {
            detail: {
              personId: d.personId,
              x: Math.max(0, e.clientX - br.left - 94),
              y: Math.max(0, e.clientY - br.top  - 32),
            },
          }));
        }
      }
    } else if (d.type === "move-card" && d.cardEl) {
      d.cardEl.style.zIndex = "";
      document.dispatchEvent(new CustomEvent("eqd:canvas-move", {
        detail: {
          personId: d.personId,
          x: parseInt(d.cardEl.style.left)  || 0,
          y: parseInt(d.cardEl.style.top)   || 0,
        },
      }));
    }
  });
}

function _makeGhost(name, cx, cy) {
  const el = document.createElement("div");
  el.className = "eqd-canvas-ghost";
  el.style.cssText =
    `position:fixed;left:${cx + 12}px;top:${cy - 18}px;` +
    `z-index:9999;pointer-events:none;`;
  el.textContent = name;
  document.body.appendChild(el);
  return el;
}

function _canvasLocalKey(firmId) { return `eqd-canvas-${firmId}`; }

function _canvasLoad(firmId) {
  try { return JSON.parse(localStorage.getItem(_canvasLocalKey(firmId)) || "{}"); }
  catch { return {}; }
}

function _canvasSave(firmId, cards) {
  try { localStorage.setItem(_canvasLocalKey(firmId), JSON.stringify(cards)); }
  catch {}
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createEqdView(eqdGet, eqdPost, eqdPatch) {
  return {
    id: EQD_VIEW_ID,
    label: "EQD Command Center",
    section: "Intelligence",
    endpoint: "/api/eqd",

    load: async () => {
      const [peopleRes, firmsRes, summaryRes, notesRes, taxonomyRes] = await Promise.all([
        eqdGet("/people?limit=1000"),
        eqdGet("/firms"),
        eqdGet("/summary"),
        eqdGet("/notes?limit=40"),
        eqdGet("/desk-taxonomy"),
      ]);
      return {
        people:       peopleRes.people,
        firms:        firmsRes.firms.filter(f => f.headcount > 0),
        summary:      summaryRes,
        notes:        notesRes.notes,
        deskTaxonomy: taxonomyRes.desk_taxonomy,
        // Interactive state
        activeTab:          "people",
        query:              "",
        fnFilter:           "",
        selectedPersonId:   null,
        selectedDetail:     null,   // full /people/{id} response
        saveSuccess:        false,
        firmDetail:         null,
        graphFirmId:        null,
      };
    },

    render: (data) => (data ? renderRoot(data) : renderLoading()),

    afterRender: (data) => {
      if (!data) return;
      if (!data.selectedPersonId && data.activeTab === "graph") {
        initOrUpdateGraph(data, eqdGet);
      }
      if (data.firmDetail && data.firmViewMode === "canvas") {
        _initCanvasDrag();
      }
    },

    // ── Actions ───────────────────────────────────────────────────────────

    onTab(tabId, data, rerender) {
      if (tabId === "graph" && _cy) { _cy.destroy(); _cy = null; }
      data.activeTab   = tabId;
      data.selectedPersonId = null;
      data.selectedDetail   = null;
      rerender();
    },

    async onPersonClick(personId, data, rerender) {
      data.selectedPersonId = personId;
      data.selectedDetail   = null;
      data.saveSuccess      = false;
      rerender();
      data.selectedDetail = await eqdGet(`/people/${personId}`);
      rerender();
    },

    onPersonBack(data, rerender) {
      data.selectedPersonId = null;
      data.selectedDetail   = null;
      data.saveSuccess      = false;
      rerender();
    },

    async onIntelligenceSave(roleId, data, rerender) {
      const payload = {
        seniority_tier:   document.getElementById("eqd-field-seniority")?.value   || null,
        role_type:        document.getElementById("eqd-field-role-type")?.value    || null,
        verified_desk_id: document.getElementById("eqd-field-desk")?.value         || null,
        verified_title:   document.getElementById("eqd-field-vtitle")?.value?.trim() || null,
      };
      // empty string → clear the field
      Object.keys(payload).forEach(k => { if (payload[k] === "") payload[k] = null; });
      await eqdPatch(`/roles/${roleId}`, payload);
      data.selectedDetail = await eqdGet(`/people/${data.selectedPersonId}`);
      data.saveSuccess = true;
      rerender();
      setTimeout(() => { data.saveSuccess = false; }, 2000);
    },

    async onPersonNoteSubmit(personId, text, source, data, rerender) {
      if (!text.trim()) return;
      await eqdPost("/notes", {
        entity_type: "person",
        entity_id:   personId,
        note_text:   text.trim(),
        source_type: source || "manual",
      });
      data.selectedDetail = await eqdGet(`/people/${personId}`);
      rerender();
    },

    async onFreeze(personId, data, rerender) {
      const result = await eqdPost(`/people/${personId}/freeze`, {});
      if (result.action === "conflict") {
        alert(`Conflict: ${result.conflict_detail}`);
        return;
      }
      // Update vault_id in every cached people list
      const update = list => list?.forEach(p => {
        if (p.person_id === personId) p.vault_id = result.vault_id;
      });
      update(data.people);
      Object.keys(data).forEach(k => {
        if (k.startsWith("firm:"))      update(data[k]?.people);
        if (k.startsWith("firm-org:"))  data[k]?.groups?.forEach(g => update(g.people));
        if (k.startsWith("firm-floor:")) data[k]?.zones?.forEach(z =>
          z.clusters?.forEach(c => update(c.people))
        );
      });
      if (data.selectedDetail?.person?.person_id === personId) {
        data.selectedDetail.person.vault_id = result.vault_id;
      }
      rerender();
    },

    onSearch(query, data, rerender) {
      data.query = query;
      rerender();
    },

    onFnFilter(fn, data, rerender) {
      data.fnFilter = fn;
      rerender();
    },

    async onFirmClick(firmId, data, rerender) {
      const key = `firm:${firmId}`;
      if (!data[key]) data[key] = await eqdGet(`/firms/${firmId}/people`);
      data.firmDetail   = data[key];
      data.firmViewMode = "floor";
      rerender();
      // load floor data then org in background
      const floorKey = `firm-floor:${firmId}`;
      if (!data[floorKey]) {
        data[floorKey] = await eqdGet(`/firms/${firmId}/floor`);
        rerender();
      }
      const orgKey = `firm-org:${firmId}`;
      if (!data[orgKey]) {
        data[orgKey] = await eqdGet(`/firms/${firmId}/org`);
      }
    },

    onFirmBack(data, rerender) {
      data.firmDetail = null;
      rerender();
    },

    async onFirmViewMode(mode, firmId, data, rerender) {
      data.firmViewMode = mode;
      if (mode === "org") {
        const k = `firm-org:${firmId}`;
        if (!data[k]) data[k] = await eqdGet(`/firms/${firmId}/org`);
      } else if (mode === "floor") {
        const k = `firm-floor:${firmId}`;
        if (!data[k]) data[k] = await eqdGet(`/firms/${firmId}/floor`);
      } else if (mode === "canvas") {
        const k = `firm-floor:${firmId}`;
        if (!data[k]) data[k] = await eqdGet(`/firms/${firmId}/floor`);
        if (!data.canvasCards) data.canvasCards = {};
        if (!data.canvasCards[firmId]) data.canvasCards[firmId] = _canvasLoad(firmId);
      }
      rerender();
    },

    onCanvasPlace(personId, x, y, data, rerender) {
      const firmId = data.firmDetail?.firm?.firm_id;
      if (!firmId) return;
      if (!data.canvasCards)         data.canvasCards = {};
      if (!data.canvasCards[firmId]) data.canvasCards[firmId] = {};
      if (data.canvasCards[firmId][personId]) return; // already placed
      data.canvasCards[firmId][personId] = { x, y };
      _canvasSave(firmId, data.canvasCards[firmId]);
      rerender();
    },

    onCanvasMove(personId, x, y, data) {
      const firmId = data.firmDetail?.firm?.firm_id;
      if (!firmId || !data.canvasCards?.[firmId]?.[personId]) return;
      data.canvasCards[firmId][personId] = { ...data.canvasCards[firmId][personId], x, y };
      _canvasSave(firmId, data.canvasCards[firmId]);
      // No rerender — DOM already updated by drag
    },

    onCanvasUnpin(personId, data, rerender) {
      const firmId = data.firmDetail?.firm?.firm_id;
      if (!firmId || !data.canvasCards?.[firmId]) return;
      delete data.canvasCards[firmId][personId];
      _canvasSave(firmId, data.canvasCards[firmId]);
      rerender();
    },

    async onCanvasSaveToServer(data) {
      const firmId = data.firmDetail?.firm?.firm_id;
      if (!firmId) return;
      const cards = data.canvasCards?.[firmId] || {};
      await eqdPost(`/firms/${firmId}/canvas`, { cards });
    },

    async onNoteSubmit(text, entityType, entityId, sourceType, data, rerender) {
      if (!text.trim()) return;
      await eqdPost("/notes", {
        entity_type: entityType || "general",
        entity_id:   entityId || null,
        note_text:   text.trim(),
        source_type: sourceType || "manual",
      });
      const res  = await eqdGet("/notes?limit=40");
      data.notes = res.notes;
      rerender();
    },

    async onGraphFirmExpand(firmId, data, rerender) {
      data.graphFirmId = firmId;
      rerender();
    },

    onGraphBack(data, rerender) {
      if (_cy) { _cy.destroy(); _cy = null; }
      data.graphFirmId = null;
      rerender();
    },
  };
}

// ── Root ──────────────────────────────────────────────────────────────────────

function renderLoading() {
  return `<div class="eqd-loading">Loading EQD Command Center…</div>`;
}

function renderRoot(d) {
  // Person detail page — replaces the tab view entirely
  if (d.selectedPersonId) return renderPersonDetail(d);

  const filtered = filterPeople(d.people, d.query, d.fnFilter);
  return `
    <div class="eqd-root">
      ${renderTabBar(d, filtered.length)}
      <div class="eqd-body">
        ${d.activeTab === "people" ? renderPeoplePanel(filtered, d)  : ""}
        ${d.activeTab === "firms"  ? renderFirmsPanel(d)             : ""}
        ${d.activeTab === "graph"  ? renderGraphPanel(d)             : ""}
        ${d.activeTab === "notes"  ? renderNotesPanel(d)             : ""}
      </div>
    </div>
  `;
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

function renderTabBar(d, peopleCount) {
  const tabs = [
    { id: "people", label: `People${d.activeTab === "people" ? ` (${peopleCount})` : ""}` },
    { id: "firms",  label: `Firms (${d.firms.length})` },
    { id: "graph",  label: "Graph" },
    { id: "notes",  label: `Notes${d.notes.length ? ` (${d.notes.length})` : ""}` },
  ];
  const t = d.summary?.totals || {};
  return `
    <div class="eqd-tabbar">
      <div class="eqd-tabs">
        ${tabs.map(tab => `
          <button class="eqd-tab${d.activeTab === tab.id ? " is-active" : ""}"
                  data-eqd-tab="${tab.id}">${escapeHtml(tab.label)}</button>
        `).join("")}
      </div>
      <div class="eqd-tabbar-meta">
        <span>${t.people || 0} people</span><span>·</span>
        <span>${t.firms  || 0} firms</span><span>·</span>
        <span>${t.notes  || 0} notes</span>
      </div>
    </div>
  `;
}

// ── People tab ────────────────────────────────────────────────────────────────

function renderPeoplePanel(filtered, d) {
  const fns = ["Trading","Sales","Structuring","Strategy","Research","Solutions",
               "Sales Trading","Sales/Trading","Sales and Trading"];
  return `
    <div class="eqd-panel eqd-panel-people">
      <div class="eqd-toolbar">
        <input class="eqd-search" data-eqd-search
               placeholder="Search name, firm, title…"
               value="${escapeHtml(d.query)}" />
        <select class="eqd-select" data-eqd-fn-filter>
          <option value="">All functions</option>
          ${fns.map(f =>
            `<option${d.fnFilter === f ? " selected" : ""}>${escapeHtml(f)}</option>`
          ).join("")}
        </select>
        <span class="eqd-count">${filtered.length} people</span>
      </div>
      <div class="eqd-table-wrap">
        <table class="eqd-table">
          <thead>
            <tr>
              <th>Name</th><th>Firm</th><th>Title</th>
              <th>Function</th><th>Seniority</th><th>Focus / Prior Firm</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length ? filtered.map(p => `
              <tr class="eqd-row" data-eqd-person="${escapeHtml(p.person_id)}">
                <td class="eqd-td-name">
                  ${escapeHtml(p.full_name)}
                  ${vaultBadge(p.person_id, p.vault_id)}
                </td>
                <td class="eqd-td-firm">${escapeHtml(p.firm_name || "")}</td>
                <td class="eqd-td-title" title="${escapeHtml(p.raw_title || "")}">${escapeHtml(p.raw_title || "—")}</td>
                <td>${fnBadge(p.raw_function)}</td>
                <td>${seniorityPill(p.seniority_tier)}</td>
                <td class="eqd-td-focus">${escapeHtml(p.raw_focus || p.raw_prior_firm || "")}</td>
              </tr>
            `).join("") : `
              <tr><td colspan="6" class="eqd-empty">No people match this filter.</td></tr>
            `}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ── Person detail page ────────────────────────────────────────────────────────

function renderPersonDetail(d) {
  if (!d.selectedDetail) {
    return `
      <div class="eqd-root">
        <div class="eqd-detail-nav">
          <button class="eqd-back-btn" data-eqd-person-back>← People</button>
        </div>
        <div class="eqd-loading">Loading…</div>
      </div>
    `;
  }

  const { person, firm, role, desk_tags, notes: personNotes } = d.selectedDetail;

  return `
    <div class="eqd-root eqd-detail-root">
      <div class="eqd-detail-nav">
        <button class="eqd-back-btn" data-eqd-person-back>← People</button>
        ${fnBadge(role?.raw_function)}
        ${role?.seniority_tier ? seniorityPill(role.seniority_tier) : ""}
      </div>

      <div class="eqd-detail-header">
        <div class="eqd-detail-name">${escapeHtml(person.full_name)}</div>
        <div class="eqd-detail-sub">
          ${escapeHtml(firm?.firm_name || "Unknown firm")}
          ${role?.raw_location ? `<span class="eqd-detail-dot">·</span>${escapeHtml(role.raw_location)}` : ""}
        </div>
      </div>

      <div class="eqd-detail-body">
        ${renderIntelligenceSection(role, d.deskTaxonomy, d.saveSuccess)}
        ${renderSourceSection(role)}
        ${renderDetailNotesSection(personNotes, person.person_id)}
      </div>
    </div>
  `;
}

// ── Intelligence section ──────────────────────────────────────────────────────

const SENIORITY_OPTIONS = [
  ["", "— unset —"],
  ["franchise_leadership", "Franchise Leadership"],
  ["md",                   "Managing Director"],
  ["partner",              "Partner"],
  ["executive_director",   "Executive Director"],
  ["director",             "Director"],
  ["svp",                  "SVP"],
  ["vp",                   "Vice President"],
  ["junior",               "Junior (Associate / Analyst)"],
  ["unknown",              "Unknown"],
];

const ROLE_TYPE_OPTIONS = [
  ["",              "— unset —"],
  ["trading",       "Trading"],
  ["sales",         "Sales"],
  ["sales_trading", "Sales Trading"],
  ["structuring",   "Structuring"],
  ["research",      "Research"],
  ["strategy",      "Strategy"],
  ["solutions",     "Solutions"],
  ["management",    "Management"],
  ["other",         "Other"],
];

function renderIntelligenceSection(role, desks, saveSuccess) {
  const confirmed = !!(role?.seniority_tier || role?.role_type || role?.verified_title || role?.verified_desk_id);
  const statusLabel = confirmed ? "partially confirmed" : "not confirmed";
  const statusCls   = confirmed ? "is-partial" : "is-empty";

  return `
    <div class="eqd-section">
      <div class="eqd-section-header">
        <span class="eqd-section-title">Intelligence</span>
        <span class="eqd-section-status ${statusCls}">${statusLabel}</span>
      </div>

      <table class="eqd-detail-table">
        <tbody>
          <tr>
            <td class="edt-label">Seniority</td>
            <td class="edt-control">
              <select id="eqd-field-seniority" class="eqd-select">
                ${SENIORITY_OPTIONS.map(([val, label]) =>
                  `<option value="${val}"${role?.seniority_tier === val ? " selected" : ""}>${escapeHtml(label)}</option>`
                ).join("")}
              </select>
            </td>
          </tr>
          <tr>
            <td class="edt-label">Role Type</td>
            <td class="edt-control">
              <select id="eqd-field-role-type" class="eqd-select">
                ${ROLE_TYPE_OPTIONS.map(([val, label]) =>
                  `<option value="${val}"${role?.role_type === val ? " selected" : ""}>${escapeHtml(label)}</option>`
                ).join("")}
              </select>
            </td>
          </tr>
          <tr>
            <td class="edt-label">Desk</td>
            <td class="edt-control">
              <select id="eqd-field-desk" class="eqd-select">
                <option value="">— unset —</option>
                ${(desks || []).map(d =>
                  `<option value="${escapeHtml(d.desk_type_id)}"${role?.verified_desk_id === d.desk_type_id ? " selected" : ""}>${escapeHtml(d.desk_type_name)}</option>`
                ).join("")}
              </select>
            </td>
          </tr>
          <tr>
            <td class="edt-label">Verified Title</td>
            <td class="edt-control">
              <input id="eqd-field-vtitle" type="text" class="eqd-input"
                     value="${escapeHtml(role?.verified_title || "")}"
                     placeholder="${escapeHtml(role?.raw_title || "")}" />
            </td>
          </tr>
        </tbody>
      </table>

      <div class="eqd-save-row">
        <button class="eqd-btn-primary"
                data-eqd-intelligence-save="${escapeHtml(role?.role_id || "")}">
          Confirm
        </button>
        ${saveSuccess ? `<span class="eqd-save-ok">✓ Saved</span>` : ""}
      </div>
    </div>
  `;
}

// ── Source section ────────────────────────────────────────────────────────────

function renderSourceSection(role) {
  const always = [
    ["Title",    role?.raw_title],
    ["Function", role?.raw_function],
    ["Group",    role?.raw_group],
    ["Location", role?.raw_location],
    ["Region",   role?.raw_region],
  ];
  const conditional = [
    ["Focus",           role?.raw_focus],
    ["Products",        role?.raw_products],
    ["Sector Coverage", role?.raw_sector_coverage],
    ["Client Coverage", role?.raw_client_coverage],
    ["Client Detail",   role?.raw_client_coverage_details],
    ["Reports To",      role?.raw_reports_to],
    ["Prior Firm",      role?.raw_prior_firm],
    ["Contact",         role?.raw_contact_info],
    ["FINRA ID",        role?.raw_finra_id],
    ["Notes",           role?.raw_notes],
  ].filter(([, v]) => v);

  return `
    <div class="eqd-section">
      <div class="eqd-section-header">
        <span class="eqd-section-title">Source</span>
        <span class="eqd-section-badge">equities map</span>
      </div>
      <table class="eqd-detail-table eqd-source-table">
        <tbody>
          ${[...always, ...conditional].map(([label, value]) => `
            <tr>
              <td class="edt-label">${escapeHtml(label)}</td>
              <td class="edt-value${value ? "" : " is-empty"}">${value ? escapeHtml(value) : "—"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// ── Detail notes section ──────────────────────────────────────────────────────

function renderDetailNotesSection(notes, personId) {
  const sourceOpts = ["call","manual","linkedin","article","email"];
  return `
    <div class="eqd-section">
      <div class="eqd-section-header">
        <span class="eqd-section-title">Notes</span>
      </div>
      <div class="eqd-detail-notes">
        ${notes?.length ? notes.map(n => `
          <div class="eqd-note-card eqd-note-card-sm">
            <div class="eqd-note-meta">
              <span class="eqd-note-source">${escapeHtml(n.source_type || "manual")}</span>
              <span class="eqd-note-time">${fmtDate(n.captured_at)}</span>
            </div>
            <div class="eqd-note-text">${escapeHtml(n.note_text)}</div>
          </div>
        `).join("") : `<div class="eqd-empty" style="margin-bottom:10px">No notes yet.</div>`}
      </div>
      <div class="eqd-add-note">
        <textarea class="eqd-textarea" id="eqd-detail-note-text"
                  placeholder="Add a note…" rows="3"></textarea>
        <div class="eqd-drawer-note-footer">
          <select class="eqd-select" id="eqd-detail-note-source">
            ${sourceOpts.map(s =>
              `<option value="${s}"${s === "manual" ? " selected" : ""}>${s}</option>`
            ).join("")}
          </select>
          <button class="eqd-btn-primary"
                  data-eqd-person-note-submit="${escapeHtml(personId)}">Save Note</button>
        </div>
      </div>
    </div>
  `;
}

// ── Firms panel ───────────────────────────────────────────────────────────────

function renderFirmsPanel(d) {
  if (d.firmDetail) return renderFirmDetail(d.firmDetail, d);
  const max = Math.max(...d.firms.map(f => f.headcount), 1);
  return `
    <div class="eqd-panel eqd-panel-firms">
      <div class="eqd-firms-intro">
        <span class="eqd-count">${d.firms.length} firms — click to drill in</span>
      </div>
      <div class="eqd-firms-grid">
        ${d.firms.map(f => `
          <button class="eqd-firm-card" data-eqd-firm="${escapeHtml(f.firm_id)}">
            <div class="efc-name">${escapeHtml(f.firm_name)}</div>
            <div class="efc-count">${f.headcount}</div>
            <div class="efc-label">people</div>
            <div class="efc-bar">
              <div class="efc-bar-fill" style="width:${Math.round(f.headcount/max*100)}%"></div>
            </div>
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderFirmDetail(detail, d) {
  const { firm, people } = detail;
  const mode    = d.firmViewMode || "org";
  const firmId  = firm.firm_id;
  const orgData = d[`firm-org:${firmId}`];

  const header = `
    <div class="eqd-firm-detail-header">
      <button class="eqd-back-btn" data-eqd-firm-back>← All firms</button>
      <div class="eqd-firm-detail-title-block">
        <div class="eqd-firm-detail-name">${escapeHtml(firm.firm_name)}</div>
        <div class="eqd-firm-detail-meta">${people.length} people · ${escapeHtml(firm.firm_type || "bank")}</div>
      </div>
      <div class="eqd-view-toggle">
        <button class="eqd-view-toggle-btn${mode === "canvas"? " is-active" : ""}"
                data-eqd-firm-view="canvas" data-eqd-firm-view-id="${escapeHtml(firmId)}">Canvas</button>
        <button class="eqd-view-toggle-btn${mode === "floor" ? " is-active" : ""}"
                data-eqd-firm-view="floor" data-eqd-firm-view-id="${escapeHtml(firmId)}">Floor</button>
        <button class="eqd-view-toggle-btn${mode === "org"   ? " is-active" : ""}"
                data-eqd-firm-view="org"   data-eqd-firm-view-id="${escapeHtml(firmId)}">Org</button>
        <button class="eqd-view-toggle-btn${mode === "table" ? " is-active" : ""}"
                data-eqd-firm-view="table" data-eqd-firm-view-id="${escapeHtml(firmId)}">Table</button>
      </div>
    </div>
  `;

  if (mode === "canvas") {
    const floorData  = d[`firm-floor:${firmId}`];
    const canvasCards = (d.canvasCards || {})[firmId] || {};
    if (!floorData) {
      return `<div class="eqd-panel eqd-panel-firm-detail">${header}<div class="eqd-loading">Loading…</div></div>`;
    }
    const pinnedCount = Object.keys(canvasCards).length;
    const canvasHeader = `
      <div class="eqd-canvas-toolbar">
        <span class="eqd-canvas-toolbar-meta">${pinnedCount} on canvas · ${floorData.total_people} total</span>
        <button class="eqd-canvas-save-btn" data-eqd-canvas-save>Save</button>
      </div>
    `;
    return `<div class="eqd-panel eqd-panel-firm-detail eqd-panel-canvas">${header}${canvasHeader}${renderCanvasView(floorData, canvasCards)}</div>`;
  }

  if (mode === "floor") {
    const floorData = d[`firm-floor:${firmId}`];
    if (!floorData) {
      return `<div class="eqd-panel eqd-panel-firm-detail">${header}<div class="eqd-loading">Loading floor view…</div></div>`;
    }
    return `<div class="eqd-panel eqd-panel-firm-detail">${header}${renderFloorView(floorData)}</div>`;
  }

  if (mode === "org") {
    if (!orgData) {
      return `<div class="eqd-panel eqd-panel-firm-detail">${header}<div class="eqd-loading">Loading org view…</div></div>`;
    }
    return `<div class="eqd-panel eqd-panel-firm-detail">${header}${renderOrgGroups(orgData)}</div>`;
  }

  return `
    <div class="eqd-panel eqd-panel-firm-detail">
      ${header}
      <div class="eqd-table-wrap">
        <table class="eqd-table">
          <thead>
            <tr><th>Name</th><th>Title</th><th>Function</th><th>Seniority</th><th>Focus</th><th>Prior Firm</th></tr>
          </thead>
          <tbody>
            ${people.map(p => `
              <tr class="eqd-row" data-eqd-person="${escapeHtml(p.person_id)}">
                <td class="eqd-td-name">${escapeHtml(p.full_name)}</td>
                <td class="eqd-td-title" title="${escapeHtml(p.raw_title || "")}">${escapeHtml(p.raw_title || "—")}</td>
                <td>${fnBadge(p.raw_function)}</td>
                <td>${seniorityPill(p.seniority_tier)}</td>
                <td class="eqd-td-focus">${escapeHtml(p.raw_focus || "")}</td>
                <td class="eqd-td-muted">${escapeHtml(p.raw_prior_firm || "")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ── Org view ──────────────────────────────────────────────────────────────────

const ORG_TIER_LABELS = {
  franchise_leadership: "Franchise",
  md:                   "MD",
  partner:              "Partner",
  executive_director:   "ED",
  director:             "Dir",
  svp:                  "SVP",
  vp:                   "VP",
  junior:               "Analyst",
};

const ORG_SOURCE_LABELS = {
  verified_desk: "verified desk",
  raw_function:  "by function",
  unassigned:    "unassigned",
};

function renderOrgGroups(orgData) {
  const { groups, total_people, unassigned_count } = orgData;

  const assigned = total_people - unassigned_count;
  const coverage = total_people ? Math.round(assigned / total_people * 100) : 0;

  return `
    <div class="eqd-org-summary">
      <span>${total_people} people</span>
      <span class="eqd-org-summary-dot">·</span>
      <span>${groups.length - (unassigned_count > 0 ? 1 : 0)} groups</span>
      <span class="eqd-org-summary-dot">·</span>
      <span class="${coverage < 80 ? "eqd-org-coverage-warn" : "eqd-org-coverage-ok"}">${coverage}% assigned</span>
    </div>
    <div class="eqd-org-groups">
      ${groups.map(g => renderOrgGroup(g)).join("")}
    </div>
  `;
}

function renderOrgGroup(group) {
  const isUnassigned = group.source === "unassigned";
  const sourceLabel  = ORG_SOURCE_LABELS[group.source] || group.source;

  return `
    <div class="eqd-org-group${isUnassigned ? " eqd-org-group--unassigned" : ""}">
      <div class="eqd-org-group-header">
        <span class="eqd-org-group-name">${escapeHtml(group.label)}</span>
        <span class="eqd-org-group-count">${group.people.length}</span>
        <span class="eqd-org-group-source">${sourceLabel}</span>
        ${isUnassigned ? `<span class="eqd-org-unassigned-flag">needs assignment</span>` : ""}
      </div>
      <div class="eqd-org-rows">
        ${group.people.map(p => renderOrgRow(p, isUnassigned)).join("")}
      </div>
    </div>
  `;
}

function renderOrgRow(p, isUnassigned) {
  const tierLabel = ORG_TIER_LABELS[p.seniority_tier] || "?";
  const tierCls   = p.seniority_tier ? `eqd-org-tier--${p.seniority_tier}` : "eqd-org-tier--unknown";
  const titleText = p.raw_title || "—";

  return `
    <div class="eqd-org-row${isUnassigned ? " eqd-org-row--unassigned" : ""}"
         data-eqd-person="${escapeHtml(p.person_id)}">
      <div class="eqd-org-tier ${tierCls}">${escapeHtml(tierLabel)}</div>
      <div class="eqd-org-person">
        <span class="eqd-org-name">${escapeHtml(p.full_name)}</span>
        <span class="eqd-org-title" title="${escapeHtml(p.raw_title || "")}">${escapeHtml(titleText)}</span>
      </div>
      ${p.raw_focus ? `<div class="eqd-org-focus">${escapeHtml(p.raw_focus)}</div>` : ""}
      ${vaultBadge(p.person_id, p.vault_id)}
    </div>
  `;
}

// ── Canvas view ───────────────────────────────────────────────────────────────

function renderCanvasView(floorData, canvasCards) {
  return `
    <div class="eqd-canvas-layout">
      <div class="eqd-canvas-list">${renderCanvasList(floorData, canvasCards)}</div>
      <div class="eqd-canvas-board" id="eqd-canvas-board">
        ${Object.entries(canvasCards).map(([pid, pos]) => {
          const person = _findPersonInFloor(floorData, pid);
          return person ? renderCanvasBoardCard(person, pos) : "";
        }).join("")}
        ${Object.keys(canvasCards).length === 0
          ? `<div class="eqd-canvas-empty">Drag cards from the list to place them here</div>`
          : ""}
      </div>
    </div>
  `;
}

function renderCanvasList(floorData, canvasCards) {
  const placed = new Set(Object.keys(canvasCards));
  return floorData.zones.map(zone => {
    const items = zone.clusters.flatMap(c => c.people).map(p =>
      renderCanvasListItem(p, placed.has(p.person_id))
    ).join("");
    if (!items) return "";
    return `
      <div class="eqd-clist-group">
        <div class="eqd-clist-group-label">${escapeHtml(zone.zone)}</div>
        ${items}
      </div>
    `;
  }).join("");
}

function renderCanvasListItem(p, isPlaced) {
  const tier     = p.seniority_tier;
  const tierCls  = tier ? `eqd-org-tier--${tier}` : "eqd-org-tier--unknown";
  const tierLbl  = ORG_TIER_LABELS[tier] || "?";
  const titleDesc = p.raw_title?.includes(",")
    ? p.raw_title.split(",").slice(1).join(",").trim().slice(0, 32)
    : (p.raw_focus || "");

  return `
    <div class="eqd-clist-item${isPlaced ? " is-placed" : ""}"
         data-canvas-add="${escapeHtml(p.person_id)}"
         title="${escapeHtml(p.raw_title || p.full_name)}">
      <span class="eqd-clist-tier ${tierCls}">${escapeHtml(tierLbl)}</span>
      <span class="eqd-clist-name">${escapeHtml(p.full_name)}</span>
      ${titleDesc ? `<span class="eqd-clist-desc">${escapeHtml(titleDesc)}</span>` : ""}
      ${isPlaced ? `<span class="eqd-clist-pinned" title="On canvas">◆</span>` : ""}
    </div>
  `;
}

function renderCanvasBoardCard(p, pos) {
  const tier    = p.seniority_tier;
  const tierLbl = ORG_TIER_LABELS[tier] || "?";
  const tierCls = tier ? `eqd-org-tier--${tier}` : "eqd-org-tier--unknown";
  const fnKey   = (p.raw_function || "").split("/")[0].split(" ")[0];
  const fnCls   = FLOOR_FN_CLASS[fnKey] || "fn-other";

  const titleDesc = p.raw_title?.includes(",")
    ? p.raw_title.split(",").slice(1).join(",").trim()
    : (p.raw_focus || "");
  const shortDesc = titleDesc.length > 40 ? titleDesc.slice(0, 38) + "…" : titleDesc;

  const chips = (p.keywords || []).slice(0, 2).map(k =>
    `<span class="eqd-kw-chip">${escapeHtml(k)}</span>`
  ).join("");

  return `
    <div class="eqd-canvas-card eqd-card-${escapeHtml(fnCls)}"
         data-canvas-card="${escapeHtml(p.person_id)}"
         style="left:${pos.x}px;top:${pos.y}px">
      <div class="eqd-canvas-card-header">
        <span class="eqd-card-tier ${tierCls}">${escapeHtml(tierLbl)}</span>
        ${vaultBadge(p.person_id, p.vault_id)}
        <button class="eqd-canvas-unpin" data-canvas-unpin="${escapeHtml(p.person_id)}"
                title="Remove from canvas">×</button>
      </div>
      <div class="eqd-card-name">${escapeHtml(p.full_name)}</div>
      ${shortDesc ? `<div class="eqd-card-title">${escapeHtml(shortDesc)}</div>` : ""}
      ${chips ? `<div class="eqd-card-kw">${chips}</div>` : ""}
    </div>
  `;
}

function _findPersonInFloor(floorData, personId) {
  for (const zone of floorData.zones) {
    for (const cluster of zone.clusters) {
      const p = cluster.people.find(p => p.person_id === personId);
      if (p) return p;
    }
  }
  return null;
}

// ── Floor view ────────────────────────────────────────────────────────────────

const FLOOR_FN_CLASS = {
  "Trading":     "fn-trading",
  "Sales":       "fn-sales",
  "Structuring": "fn-structuring",
  "Research":    "fn-research",
  "Solutions":   "fn-solutions",
  "Financing":   "fn-financing",
  "Systematic":  "fn-systematic",
};

function renderFloorView(floorData) {
  const { zones, total_people } = floorData;
  return `
    <div class="eqd-floor">
      <div class="eqd-floor-meta">${total_people} people · ${zones.length} zones</div>
      ${zones.map(z => renderFloorZone(z)).join("")}
    </div>
  `;
}

function renderFloorZone(zone) {
  const totalInZone = zone.clusters.reduce((n, c) => n + c.people.length, 0);
  return `
    <div class="eqd-floor-zone">
      <div class="eqd-floor-zone-header">
        <span class="eqd-floor-zone-name">${escapeHtml(zone.zone)}</span>
        <span class="eqd-floor-zone-count">${totalInZone}</span>
      </div>
      <div class="eqd-floor-zone-clusters">
        ${zone.clusters.map(c => renderFloorCluster(c, zone.zone)).join("")}
      </div>
    </div>
  `;
}

function renderFloorCluster(cluster, zone) {
  const showLabel = cluster.cluster !== zone;
  return `
    <div class="eqd-floor-cluster">
      ${showLabel ? `<div class="eqd-floor-cluster-label">${escapeHtml(cluster.cluster)}</div>` : ""}
      <div class="eqd-floor-cluster-cards">
        ${cluster.people.map(p => renderPersonCard(p)).join("")}
      </div>
    </div>
  `;
}

function renderPersonCard(p) {
  const tier      = p.seniority_tier;
  const tierLabel = ORG_TIER_LABELS[tier] || "?";
  const tierCls   = tier ? `eqd-org-tier--${tier}` : "eqd-org-tier--unknown";
  const fnKey     = (p.raw_function || "").split("/")[0].split(" ")[0];
  const fnCls     = FLOOR_FN_CLASS[fnKey] || FLOOR_FN_CLASS[p.raw_function] || "fn-other";

  let titleLine = "";
  if (p.raw_title && p.raw_title.includes(",")) {
    const desc = p.raw_title.split(",").slice(1).join(",").trim();
    titleLine  = desc.length > 44 ? desc.slice(0, 41) + "…" : desc;
  } else if (p.raw_focus) {
    titleLine = p.raw_focus.length > 44 ? p.raw_focus.slice(0, 41) + "…" : p.raw_focus;
  }

  const chips = (p.keywords || []).map(k =>
    `<span class="eqd-kw-chip">${escapeHtml(k)}</span>`
  ).join("");

  return `
    <div class="eqd-person-card eqd-card-${escapeHtml(fnCls)}" data-eqd-person="${escapeHtml(p.person_id)}">
      <div class="eqd-card-header">
        <span class="eqd-card-tier ${tierCls}">${escapeHtml(tierLabel)}</span>
        ${vaultBadge(p.person_id, p.vault_id)}
      </div>
      <div class="eqd-card-name">${escapeHtml(p.full_name)}</div>
      ${titleLine ? `<div class="eqd-card-title">${escapeHtml(titleLine)}</div>` : ""}
      ${chips ? `<div class="eqd-card-kw">${chips}</div>` : ""}
    </div>
  `;
}

// ── Graph panel ───────────────────────────────────────────────────────────────

function renderGraphPanel(d) {
  return `
    <div class="eqd-panel eqd-panel-graph">
      <div class="eqd-toolbar">
        ${d.graphFirmId ? `<button class="eqd-back-btn" data-eqd-graph-back>← All firms</button>` : ""}
        <span class="eqd-count">
          ${d.graphFirmId ? "Click a person to open their profile" : "Click a firm to expand its people"}
        </span>
      </div>
      <div class="eqd-cy" id="eqd-cy"></div>
    </div>
  `;
}

// ── Notes panel ───────────────────────────────────────────────────────────────

function renderNotesPanel(d) {
  const sourceOpts = ["call","manual","linkedin","article","email"];
  return `
    <div class="eqd-panel eqd-panel-notes">
      <div class="eqd-notes-layout">
        <div class="eqd-notes-form">
          <div class="eqd-notes-form-title">Quick Capture</div>
          <div class="eqd-form-row">
            <label class="eqd-form-label">Entity Type</label>
            <select class="eqd-select" id="eqd-note-entity-type">
              <option value="general">General</option>
              <option value="person">Person</option>
              <option value="firm">Firm</option>
              <option value="desk">Desk</option>
            </select>
          </div>
          <div class="eqd-form-row">
            <label class="eqd-form-label">Entity ID <span class="eqd-form-hint">(optional)</span></label>
            <input class="eqd-input" id="eqd-note-entity-id" placeholder="Paste a person or firm ID…" />
          </div>
          <div class="eqd-form-row">
            <label class="eqd-form-label">Source</label>
            <select class="eqd-select" id="eqd-note-source">
              ${sourceOpts.map(s =>
                `<option value="${s}"${s === "manual" ? " selected" : ""}>${s}</option>`
              ).join("")}
            </select>
          </div>
          <div class="eqd-form-row">
            <label class="eqd-form-label">Note</label>
            <textarea class="eqd-textarea" id="eqd-note-text" placeholder="Enter your note…" rows="5"></textarea>
          </div>
          <button class="eqd-btn-primary" data-eqd-note-submit>Save Note</button>
        </div>
        <div class="eqd-notes-feed">
          <div class="eqd-notes-feed-title">Recent Notes</div>
          ${d.notes.length ? d.notes.map(n => renderNoteCard(n)).join("") : `<div class="eqd-empty">No notes yet.</div>`}
        </div>
      </div>
    </div>
  `;
}

function renderNoteCard(n) {
  return `
    <div class="eqd-note-card">
      <div class="eqd-note-meta">
        <span class="eqd-note-type">${escapeHtml(n.entity_type)}</span>
        <span class="eqd-note-source">${escapeHtml(n.source_type || "manual")}</span>
        <span class="eqd-note-time">${fmtDate(n.captured_at)}</span>
      </div>
      <div class="eqd-note-text">${escapeHtml(n.note_text)}</div>
    </div>
  `;
}

// ── Cytoscape ─────────────────────────────────────────────────────────────────

const FN_COLORS = {
  Trading:     "#e9973f",
  Sales:       "#3fb950",
  Structuring: "#fa99cd",
  Strategy:    "#a882ff",
  Research:    "#a882ff",
  Solutions:   "#53dfdd",
};

function fnToColor(fn) {
  const key = (fn || "").split("/")[0].split(" ")[0];
  return FN_COLORS[key] || "#555";
}

async function initOrUpdateGraph(data, eqdGet) {
  const container = document.getElementById("eqd-cy");
  if (!container) return;
  if (_cy) { _cy.destroy(); _cy = null; }

  let nodes, edges = [];
  if (data.graphFirmId) {
    const [nr, er] = await Promise.all([
      eqdGet(`/graph/nodes?firm_id=${data.graphFirmId}`),
      eqdGet(`/graph/edges?firm_id=${data.graphFirmId}`),
    ]);
    nodes = nr.nodes; edges = er.edges;
  } else {
    nodes = (await eqdGet("/graph/nodes")).nodes;
  }

  const maxHC = Math.max(...nodes.map(n => n.data?.headcount || 0), 1);

  _cy = cytoscape({
    container,
    elements: [...nodes, ...edges],
    style: [
      {
        selector: 'node[node_type="firm"]',
        style: {
          "background-color": "#006eff",
          "label": "data(label)",
          "color": "#f0f0f0",
          "font-size": "11px",
          "text-valign": "center",
          "text-wrap": "wrap",
          "text-max-width": "80px",
          "width":  `mapData(headcount, 1, ${maxHC}, 36, 110)`,
          "height": `mapData(headcount, 1, ${maxHC}, 36, 110)`,
          "border-width": 2,
          "border-color": "#0a0a0a",
          "cursor": "pointer",
        },
      },
      {
        selector: 'node[node_type="person"]',
        style: {
          "background-color": "#555",
          "label": "data(label)",
          "color": "#a0a0a0",
          "font-size": "9px",
          "text-valign": "bottom",
          "text-margin-y": "3px",
          "text-max-width": "80px",
          "text-wrap": "wrap",
          "width": 16, "height": 16,
          "border-width": 1,
          "border-color": "#1f1f1f",
        },
      },
      {
        selector: "edge",
        style: { "line-color": "#363636", "width": 1, "curve-style": "bezier", "opacity": 0.5 },
      },
      {
        selector: ":selected",
        style: { "border-color": "#e9973f", "border-width": 3 },
      },
    ],
    layout: data.graphFirmId
      ? { name: "concentric", concentric: n => n.data("node_type") === "firm" ? 2 : 1,
          levelWidth: () => 1, animate: false, padding: 40 }
      : { name: "cose", animate: false, nodeRepulsion: 8000, padding: 24 },
  });

  _cy.nodes('[node_type="person"]').forEach(n => {
    n.style("background-color", fnToColor(n.data("raw_function")));
  });

  if (!data.graphFirmId) {
    _cy.on("tap", 'node[node_type="firm"]', evt => {
      const hint = document.getElementById("eqd-graph-hint");
      if (hint) hint.textContent = "Loading…";
      if (_cy) { _cy.destroy(); _cy = null; }
      document.dispatchEvent(
        new CustomEvent("eqd:graph-firm-expand", { detail: { firmId: evt.target.id() } })
      );
    });
  }
  _cy.on("tap", 'node[node_type="person"]', evt => {
    document.dispatchEvent(
      new CustomEvent("eqd:person-click", { detail: { personId: evt.target.id() } })
    );
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function filterPeople(people, query, fnFilter) {
  if (!people) return [];
  let list = people;
  if (fnFilter) list = list.filter(p => (p.raw_function || "") === fnFilter);
  if (query) {
    const q = query.toLowerCase();
    list = list.filter(p =>
      (p.full_name  || "").toLowerCase().includes(q) ||
      (p.raw_title  || "").toLowerCase().includes(q) ||
      (p.firm_name  || "").toLowerCase().includes(q)
    );
  }
  return list;
}

function vaultBadge(personId, vaultId) {
  if (vaultId) {
    return `<span class="eqd-vault-badge is-linked" title="Genotype profile exists">◆</span>`;
  }
  return `<button class="eqd-vault-badge is-unlinked" title="Add to Genotype vault"
                  data-eqd-freeze="${escapeHtml(personId)}"
                  onclick="event.stopPropagation()">+</button>`;
}

function fnBadge(fn) {
  if (!fn) return "";
  const key = fn.split("/")[0].split(" ")[0];
  return `<span class="eqd-fn-badge eqd-fn-${escapeHtml(key)}">${escapeHtml(fn)}</span>`;
}

function seniorityPill(tier) {
  if (!tier) return `<span class="eqd-seniority-pill is-unset">—</span>`;
  const labels = {
    franchise_leadership: "Franchise",
    md:                   "MD",
    partner:              "Partner",
    executive_director:   "ED",
    director:             "Director",
    svp:                  "SVP",
    vp:                   "VP",
    junior:               "Junior",
    unknown:              "Unknown",
  };
  return `<span class="eqd-seniority-pill is-set">${escapeHtml(labels[tier] || tier)}</span>`;
}

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}
