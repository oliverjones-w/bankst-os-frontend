/**
 * Log Intake Review view.
 * Shows LLM-proposed database changes from recruitment log files.
 * Registered in app.js VIEWS array; command palette picks it up automatically.
 */

import { escapeHtml } from "../utils.js";
import { tabBar } from "../ui.js";

export const LOG_INTAKE_VIEW_ID = "log-intake.review";

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_META = {
  add_to_mandate:  { label: "Add to Mandate",  cls: "li-badge--mandate"  },
  add_to_pool:     { label: "Add to Pool",      cls: "li-badge--pool"     },
  add_to_pipeline: { label: "Add to Pipeline",  cls: "li-badge--pipeline" },
  log_activity:    { label: "Log Activity",     cls: "li-badge--activity" },
};

const CONFIDENCE_META = {
  high:   { label: "High",   cls: "li-conf--high"   },
  medium: { label: "Medium", cls: "li-conf--medium" },
  low:    { label: "Low",    cls: "li-conf--low"    },
};

const STATUS_TABS = [
  { id: "pending",  label: "Pending"  },
  { id: "executed", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "skipped",  label: "Skipped"  },
  { id: "all",      label: "All"      },
];

// ── Factory ───────────────────────────────────────────────────────────────────

export function createLogIntakeView(opsGet, opsPost) {
  return {
    id: LOG_INTAKE_VIEW_ID,
    label: "Log Intake",
    section: "Intake",
    endpoint: "/api/ops/log-intake/summary",

    load: async () => {
      const [proposals, runs] = await Promise.all([
        opsGet("/log-intake/proposals"),
        opsGet("/log-intake/runs"),
      ]);
      return {
        proposals,
        runs,
        activeTab: "pending",
        expandedExcerpt: null,  // proposal id with excerpt expanded
        deciding: new Set(),    // proposal ids currently being actioned
        feedback: {},           // proposal id → { ok, message }
      };
    },

    render: (data) => (data ? renderRoot(data) : renderLoading()),

    // ── Event handling — dispatched by the generic handleClick in wireMainActions ──

    handleClick(event, data, rerender) {
      const tabBtn = event.target.closest("[data-li-tab]");
      if (tabBtn) {
        data.activeTab = tabBtn.dataset.liTab;
        data.expandedExcerpt = null;
        rerender();
        return;
      }

      const excerptBtn = event.target.closest("[data-li-excerpt]");
      if (excerptBtn) {
        const id = Number(excerptBtn.dataset.liExcerpt);
        data.expandedExcerpt = data.expandedExcerpt === id ? null : id;
        rerender();
        return;
      }

      const decideBtn = event.target.closest("[data-li-decide]");
      if (decideBtn) {
        _decide(
          Number(decideBtn.dataset.liDecide),
          decideBtn.dataset.liDecision,
          data,
          rerender,
          opsPost,
        );
      }
    },
  };
}

// ── Async action helper ───────────────────────────────────────────────────────

async function _decide(proposalId, decision, data, rerender, opsPost) {
  if (data.deciding.has(proposalId)) return;
  data.deciding.add(proposalId);
  rerender();
  try {
    const result = await opsPost(`/log-intake/proposals/${proposalId}/decide`, { decision });
    const proposal = data.proposals.find((p) => p.id === proposalId);
    if (proposal) proposal.status = result.status;
    data.feedback[proposalId] = { ok: true, message: result.execution_error || null };
  } catch (err) {
    data.feedback[proposalId] = { ok: false, message: err.message };
  } finally {
    data.deciding.delete(proposalId);
    rerender();
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderLoading() {
  return `<div class="view-wrapper"><div class="view-empty">Loading…</div></div>`;
}

function renderRoot(data) {
  const { proposals, runs, activeTab, expandedExcerpt, deciding, feedback } = data;

  const filtered = activeTab === "all"
    ? proposals
    : proposals.filter((p) => p.status === activeTab);

  const pendingCount = proposals.filter((p) => p.status === "pending").length;

  return `
    <div class="view-wrapper log-intake-view">
      <div class="view-header-row" style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <h2 style="margin:0;font-size:15px;font-weight:600;color:var(--text-primary);">Log Intake Review</h2>
        ${pendingCount > 0 ? `<span class="li-pending-badge">${pendingCount} pending</span>` : ""}
        <span style="margin-left:auto;font-size:11px;color:var(--text-faint);">
          ${runs.length > 0 ? `Last run: ${_fmtDate(runs[0].run_at)} · ${runs[0].proposal_count} proposals` : "No runs yet"}
        </span>
      </div>

      ${tabBar(
        STATUS_TABS.map((tab) => ({
          ...tab,
          count: tab.id === "all"
            ? proposals.length
            : proposals.filter((p) => p.status === tab.id).length,
        })),
        activeTab,
        "data-li-tab",
      )}

      ${filtered.length === 0
        ? `<div class="view-empty" style="padding:40px;text-align:center;color:var(--text-faint);">
             No ${activeTab === "all" ? "" : activeTab + " "}proposals
           </div>`
        : `<div class="li-proposal-list">
             ${filtered.map((p) => renderCard(p, expandedExcerpt, deciding, feedback)).join("")}
           </div>`
      }

      ${runs.length > 0 ? renderRunHistory(runs) : ""}
    </div>
  `;
}

function renderCard(p, expandedExcerpt, deciding, feedback) {
  const typeMeta = TYPE_META[p.proposal_type] || { label: p.proposal_type, cls: "li-badge--pipeline" };
  const confMeta = CONFIDENCE_META[p.confidence] || { label: p.confidence, cls: "li-conf--medium" };
  const isDeciding = deciding.has(p.id);
  const fb = feedback[p.id];
  const isPending = p.status === "pending";
  const excerptExpanded = expandedExcerpt === p.id;
  const hasExcerpt = Boolean(p.source_excerpt && p.source_excerpt.trim());

  return `
    <div class="li-card ${isPending ? "li-card--pending" : `li-card--${p.status}`}">
      <div class="li-card-header">
        <span class="li-badge ${typeMeta.cls}">${typeMeta.label}</span>
        <span class="li-conf ${confMeta.cls}">${confMeta.label}</span>
        ${p.source_file ? `<span class="li-source-file">${escapeHtml(p.source_file)}</span>` : ""}
        <span class="li-card-status li-card-status--${p.status}">${_statusLabel(p.status)}</span>
      </div>

      <div class="li-card-body">
        <div class="li-action-summary">${escapeHtml(p.action_summary)}</div>
        ${p.person_name || p.person_firm ? `
          <div class="li-person-row">
            ${p.person_name ? `<span class="li-person-name">${escapeHtml(p.person_name)}</span>` : ""}
            ${p.person_firm ? `<span class="li-person-firm">@ ${escapeHtml(p.person_firm)}</span>` : ""}
            ${p.linkedin_url ? `<a class="li-linkedin" href="${escapeHtml(p.linkedin_url)}" target="_blank" rel="noopener">LinkedIn ↗</a>` : ""}
          </div>` : ""}
        ${p.target_name ? `
          <div class="li-target-row">
            <span class="li-target-label">→</span>
            <span class="li-target-name">${escapeHtml(p.target_name)}</span>
            ${p.target_id ? `<span class="li-target-id">id:${p.target_id}</span>` : `<span class="li-target-unresolved">unresolved</span>`}
          </div>` : ""}
        ${p.action_notes ? `<div class="li-action-notes">${escapeHtml(p.action_notes)}</div>` : ""}
        ${hasExcerpt ? `
          <div class="li-excerpt-toggle">
            <button class="li-excerpt-btn" data-li-excerpt="${p.id}">
              ${excerptExpanded ? "▲ hide source" : "▼ show source"}
            </button>
            ${excerptExpanded ? `<pre class="li-excerpt">${escapeHtml(p.source_excerpt)}</pre>` : ""}
          </div>` : ""}
      </div>

      ${fb ? `
        <div class="li-feedback ${fb.ok ? "li-feedback--ok" : "li-feedback--err"}">
          ${fb.ok
            ? (fb.message ? `⚠ Executed with note: ${escapeHtml(fb.message)}` : "✓ Executed")
            : `✗ Error: ${escapeHtml(fb.message || "unknown error")}`}
        </div>` : ""}

      ${isPending ? `
        <div class="li-card-actions">
          <button class="li-btn li-btn--approve" data-li-decide="${p.id}" data-li-decision="approve"
                  ${isDeciding ? "disabled" : ""}>
            ${isDeciding ? "…" : "Approve"}
          </button>
          <button class="li-btn li-btn--reject" data-li-decide="${p.id}" data-li-decision="reject"
                  ${isDeciding ? "disabled" : ""}>
            ${isDeciding ? "…" : "Reject"}
          </button>
          <button class="li-btn li-btn--skip" data-li-decide="${p.id}" data-li-decision="skip"
                  ${isDeciding ? "disabled" : ""}>
            ${isDeciding ? "…" : "Skip"}
          </button>
        </div>` : ""}
    </div>
  `;
}

function renderRunHistory(runs) {
  return `
    <details class="li-runs" style="margin-top:32px;">
      <summary style="cursor:pointer;font-size:12px;color:var(--text-faint);user-select:none;">
        Run history (${runs.length})
      </summary>
      <table class="data-table" style="margin-top:8px;font-size:12px;">
        <thead><tr>
          <th>Run</th><th>When</th><th>Files</th><th>Proposals</th><th>Status</th>
        </tr></thead>
        <tbody>
          ${runs.map((r) => {
            const files = JSON.parse(r.files_json || "[]");
            return `<tr>
              <td>${r.id}</td>
              <td>${_fmtDate(r.run_at)}</td>
              <td style="color:var(--text-faint)">${files.length} file${files.length !== 1 ? "s" : ""}</td>
              <td>${r.proposal_count}</td>
              <td>${r.status === "error" ? `<span style="color:var(--color-warn)">${escapeHtml(r.status)}</span>` : r.status}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </details>
  `;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function _statusLabel(status) {
  const map = { executed: "Approved", pending: "", rejected: "Rejected", skipped: "Skipped" };
  return map[status] ?? status;
}
