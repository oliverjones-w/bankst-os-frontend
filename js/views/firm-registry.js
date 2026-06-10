/**
 * Firm Registry view — the global firm directory (projected from refs.db, the
 * ONLY canonical firm source), and the entry point into the Firm Workspace.
 *
 * Flow:  refs /firms  →  searchable registry table  →  click a firm  →
 *        Firm Workspace (Table + Canvas + ranked Suggestions).
 *
 * Replaces the deprecated EQD Command Center. EQD survives only as one
 * suggestion-source adapter behind the workspace.
 *
 * Persistence: overlay (card positions / groups / rejects) uses a transport-
 * pluggable store — localStorage today (independent, no backend), an independent
 * server store later. NEVER Postgres. See memory: data-layer-canonical-sources.
 */

import { registerEqdSource } from "../firm-workspace/sources/eqd-source.js";
import { registerMappingHfSource } from "../firm-workspace/sources/mapping-hf-source.js";
import { buildFirmWorkspaceData } from "../firm-workspace/suggestion-engine.js";
import { createOverlayStore } from "../firm-workspace/overlay-store.js";
import { localStorageTransport } from "../firm-workspace/overlay-transport.js";
import { firmOverlayKey } from "../firm-workspace/identity.js";
import { renderFirmWorkspace, setFirmWorkspaceContext } from "../firm-workspace/component.js";

export const FIRM_REGISTRY_VIEW_ID = "firm.registry";

export function createFirmRegistryView(refsGet, eqdGet, mappingGet) {
  // Register suggestion sources (non-privileged, fanned out by the engine).
  // EQD = sell-side banks; HF map = buy-side hedge funds. More source APIs
  // (FINRA, LinkedIn, IR/credit maps) register here later with the same one-liner.
  registerEqdSource(eqdGet);
  registerMappingHfSource(mappingGet);

  const _overlayTransport = localStorageTransport();

  return {
    id: FIRM_REGISTRY_VIEW_ID,
    label: "Firm Registry",
    section: "Firms",
    endpoint: "/api/refs/firms",

    load: async () => {
      const res = await refsGet("/firms");
      const firms = (res?.firms || [])
        .map((f) => ({ refsId: f.id, name: f.canonical }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        firms,
        query: "",
        selectedFirm: null, // { refsId, name }
        wsData: null, // FirmWorkspaceData
        wsLoading: false,
        store: null, // overlay store for the open firm
      };
    },

    render: (data) => {
      if (!data) return `<div class="fw-loading">Loading firm registry…</div>`;
      if (data.selectedFirm) return renderWorkspaceShell(data);
      return renderRegistry(data);
    },

    afterRender: (data) => {
      // When a firm is open, hand the component its live context so its own
      // document-level drag/click listeners can mutate the overlay + re-render.
      if (data?.selectedFirm && data.store) {
        setFirmWorkspaceContext({
          store: data.store,
          getData: () => data.wsData,
          rerender: data._rerender,
          onPromote: (key) => onPromote(key, data),
        });
      }
    },

    onSearch(query, data, rerender) {
      data.query = query;
      rerender();
    },

    async onFirmOpen(refsId, data, rerender) {
      const firm = data.firms.find((f) => f.refsId === refsId);
      if (!firm) return;
      data._rerender = rerender; // component needs the app-shell rerender
      data.selectedFirm = firm;
      data.wsLoading = true;
      data.wsData = null;
      data.store = null;
      rerender(); // loading state

      const firmRef = { refsId: firm.refsId, name: firm.name };
      const [wsData] = await Promise.all([buildFirmWorkspaceData(firmRef)]);

      const key = firmOverlayKey(firmRef); // "refs:<id>"
      const store = createOverlayStore({ firmKey: key, transport: _overlayTransport });
      await store.load();

      data.wsData = wsData;
      data.store = store;
      data.wsLoading = false;
      rerender();
    },

    onBack(data, rerender) {
      data.selectedFirm = null;
      data.wsData = null;
      data.store?.flush();
      data.store = null;
      rerender();
    },
  };
}

// ── Promote (V1 stub) ────────────────────────────────────────────────────────
// Real promote mints a genotype person folder + vault_id, then remaps the
// overlay key eqd:* → genotype:* (store.remap). The genotype freeze backend is
// the next phase; for now we surface intent without faking a canonical id.
function onPromote(key, data) {
  const person = (data.wsData?.suggestedPeople || []).find((p) => p.key === key);
  window.alert(
    `Promote "${person?.displayName || key}" → genotype freeze is the next phase.\n` +
      `It will mint a vault_id and remap this card's overlay state to genotype:*.`
  );
}

// ── Registry table ───────────────────────────────────────────────────────────
function renderRegistry(data) {
  const q = data.query.trim().toLowerCase();
  const firms = q ? data.firms.filter((f) => f.name.toLowerCase().includes(q)) : data.firms;

  const rows = firms.length
    ? firms
        .map(
          (f) => `
        <tr class="fw-reg-row" data-firm-open="${esc(f.refsId)}">
          <td class="fw-reg-name">${esc(f.name)}</td>
          <td class="fw-reg-id">${esc(f.refsId)}</td>
          <td class="fw-reg-go">Open →</td>
        </tr>`
        )
        .join("")
    : `<tr><td colspan="3" class="fw-reg-empty">No firms match "${esc(data.query)}".</td></tr>`;

  return `
    <div class="fw-registry">
      <div class="fw-registry-bar">
        <input class="fw-registry-search" data-firm-search type="text"
               value="${esc(data.query)}" placeholder="Search ${data.firms.length} firms…" />
        <span class="fw-registry-count">${firms.length} / ${data.firms.length}</span>
      </div>
      <table class="fw-registry-table">
        <thead><tr><th>Firm</th><th>refs id</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// ── Workspace shell (header + the portable component) ────────────────────────
function renderWorkspaceShell(data) {
  const f = data.selectedFirm;
  const header = `
    <div class="fw-shell-head">
      <button class="fw-back" data-firm-back>← Registry</button>
      <span class="fw-shell-firm">${esc(f.name)}</span>
      <span class="fw-shell-key">${esc(firmOverlayKey(f))}</span>
    </div>`;

  if (data.wsLoading || !data.wsData || !data.store) {
    return `<div class="fw-shell">${header}<div class="fw-loading">Matching suggestions across sources…</div></div>`;
  }
  return `<div class="fw-shell">${header}${renderFirmWorkspace(data.wsData, data.store.state)}</div>`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
