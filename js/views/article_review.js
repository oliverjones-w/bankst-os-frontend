import { escapeHtml } from "../utils.js";

export const ARTICLE_REVIEW_VIEW_ID = "articles.review";

const STATUS_TABS = [
  { id: "pending_review", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];


export function createArticleReviewView(opsGet, opsPost) {
  async function reloadData(target) {
    const [summaryResp, candidatesResp, decisionsResp] = await Promise.all([
      opsGet("/articles/summary"),
      opsGet("/articles/link-candidates?status=&limit=500"),
      opsGet("/articles/review-decisions?limit=100"),
    ]);
    target.summary = Array.isArray(summaryResp?.rows) ? summaryResp.rows : [];
    target.candidates = Array.isArray(candidatesResp?.rows) ? candidatesResp.rows : [];
    target.decisions = Array.isArray(decisionsResp?.rows) ? decisionsResp.rows : [];
  }

  return {
    id: ARTICLE_REVIEW_VIEW_ID,
    label: "Article Review",
    section: "Intake",
    endpoint: "/api/ops/articles/link-candidates + /api/ops/articles/summary",

    load: async () => {
      const snapshot = {
        summary: [],
        candidates: [],
        decisions: [],
      };
      await reloadData(snapshot);
      return {
        summary: snapshot.summary,
        candidates: snapshot.candidates,
        decisions: snapshot.decisions,
        activeTab: "pending_review",
        deciding: new Set(),
        expandedExcerpt: null,
        runningResolution: false,
        feedback: null,
      };
    },

    render: (data) => (data ? renderRoot(data) : renderLoading()),

    onTab(tabId, data, rerender) {
      data.activeTab = tabId;
      rerender();
    },

    onToggleExcerpt(candidateId, data, rerender) {
      data.expandedExcerpt = data.expandedExcerpt === candidateId ? null : candidateId;
      rerender();
    },

    async onRunResolution(data, rerender) {
      if (data.runningResolution) return;
      data.runningResolution = true;
      data.feedback = null;
      rerender();
      try {
        const result = await opsPost("/articles/resolve-pending?limit=250", {});
        await reloadData(data);
        data.feedback = {
          ok: true,
          message: `Resolved ${result.resolved || 0}, no-candidate ${result.unresolved || 0}`,
        };
      } catch (error) {
        data.feedback = {
          ok: false,
          message: error.message || String(error),
        };
      } finally {
        data.runningResolution = false;
        rerender();
      }
    },

    async onDecide(candidateId, decision, data, rerender) {
      if (data.deciding.has(candidateId)) return;
      data.deciding.add(candidateId);
      rerender();
      try {
        const endpoint = decision === "approve"
          ? `/articles/link-candidates/${candidateId}/approve`
          : `/articles/link-candidates/${candidateId}/reject`;
        const result = await opsPost(endpoint, {});
        await reloadData(data);
        data.feedback = {
          ok: true,
          message: `${decision === "approve" ? "Approved" : "Rejected"} candidate ${candidateId}`,
        };
      } catch (error) {
        data.feedback = {
          ok: false,
          message: error.message || String(error),
        };
      } finally {
        data.deciding.delete(candidateId);
        rerender();
      }
    },
  };
}


function renderLoading() {
  return `<div class="view-wrapper"><div class="view-empty">Loading article review queue…</div></div>`;
}


function renderRoot(data) {
  const summary = Object.fromEntries(
    (data.summary || []).map((row) => [row.metric, Number(row.value || 0)]),
  );
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const activeTab = data.activeTab || "pending_review";
  const filtered = activeTab === "all"
    ? candidates
    : candidates.filter((row) => row.status === activeTab);

  return `
    <div class="view-wrapper article-review-view">
      <div class="article-review-header">
        <div>
          <h2 class="article-review-title">Article Link Review</h2>
          <p class="article-review-subtitle">Review genotype matches for extracted person and firm mentions before linking them.</p>
        </div>
        <div class="article-review-actions">
          <button
            class="article-review-btn article-review-btn--secondary"
            data-article-run-resolution
            ${data.runningResolution ? "disabled" : ""}
          >${data.runningResolution ? "Running…" : "Run Resolution"}</button>
        </div>
      </div>

      <div class="article-review-metrics">
        ${renderMetric("Articles", summary.articles_total)}
        ${renderMetric("Mentions", summary.mentions_total)}
        ${renderMetric("Pending", summary.pending_review)}
        ${renderMetric("Approved", summary.approved_links)}
        ${renderMetric("No Candidate", summary.no_candidate_mentions)}
      </div>

      ${data.feedback ? `
        <div class="article-review-feedback ${data.feedback.ok ? "is-ok" : "is-error"}">
          ${escapeHtml(data.feedback.message || "")}
        </div>
      ` : ""}

      <div class="article-review-tabs">
        ${STATUS_TABS.map((tab) => {
          const count = tab.id === "all"
            ? candidates.length
            : candidates.filter((row) => row.status === tab.id).length;
          return `
            <button class="article-review-tab ${activeTab === tab.id ? "is-active" : ""}"
                    data-article-tab="${tab.id}">
              ${escapeHtml(tab.label)}
              <span>${count}</span>
            </button>
          `;
        }).join("")}
      </div>

      ${filtered.length
        ? `<div class="article-review-list">${filtered.map((row) => renderCandidateCard(row, data)).join("")}</div>`
        : `<div class="view-empty article-review-empty">No ${escapeHtml(activeTab === "all" ? "" : activeTab.replace("_", " "))} candidates.</div>`
      }
    </div>
  `;
}


function renderMetric(label, value) {
  return `
    <div class="article-review-metric">
      <div class="article-review-metric-label">${escapeHtml(label)}</div>
      <div class="article-review-metric-value">${Number(value || 0)}</div>
    </div>
  `;
}


function renderCandidateCard(row, data) {
  const deciding = data.deciding.has(Number(row.id));
  const expanded = data.expandedExcerpt === Number(row.id);
  const articleUrl = row.source_url ? String(row.source_url) : "";
  const entityType = String(row.entity_type || "").trim() || "entity";
  const score = Number.isFinite(Number(row.match_score)) ? Number(row.match_score).toFixed(1) : "—";
  const published = formatDateTime(row.published_at);

  return `
    <article class="article-review-card article-review-card--${escapeHtml(row.status || "pending_review")}">
      <div class="article-review-card-topline">
        <span class="article-review-chip article-review-chip--type">${escapeHtml(entityType)}</span>
        <span class="article-review-chip article-review-chip--status">${escapeHtml((row.status || "").replace("_", " "))}</span>
        <span class="article-review-chip article-review-chip--score">score ${escapeHtml(score)}</span>
      </div>

      <div class="article-review-card-body">
        <div class="article-review-article-meta">
          <div class="article-review-headline">${escapeHtml(row.headline || "Untitled article")}</div>
          <div class="article-review-source">
            ${escapeHtml(row.source_name || "Unknown source")}
            ${published ? ` · ${escapeHtml(published)}` : ""}
            ${articleUrl ? ` · <a href="${escapeHtml(articleUrl)}" target="_blank" rel="noopener">open</a>` : ""}
          </div>
        </div>

        <div class="article-review-grid">
          <div>
            <div class="article-review-label">Mention</div>
            <div class="article-review-value">${escapeHtml(row.mention_text || row.normalized_name || "—")}</div>
          </div>
          <div>
            <div class="article-review-label">Candidate</div>
            <div class="article-review-value">${escapeHtml(row.candidate_label || "—")}</div>
          </div>
          <div>
            <div class="article-review-label">Vault ID</div>
            <div class="article-review-value article-review-mono">${escapeHtml(row.candidate_vault_id || "—")}</div>
          </div>
          <div>
            <div class="article-review-label">Basis</div>
            <div class="article-review-value">${escapeHtml(row.match_basis || "—")}</div>
          </div>
        </div>

        ${row.context ? `
          <div class="article-review-context">
            <div class="article-review-label">Context</div>
            <div class="article-review-value">${escapeHtml(row.context)}</div>
          </div>
        ` : ""}

        ${row.article_excerpt ? `
          <div class="article-review-excerpt-wrap">
            <button class="article-review-excerpt-toggle" data-article-excerpt="${row.id}">
              ${expanded ? "Hide excerpt" : "Show excerpt"}
            </button>
            ${expanded ? `<pre class="article-review-excerpt">${escapeHtml(row.article_excerpt)}</pre>` : ""}
          </div>
        ` : ""}
      </div>

      ${row.status === "pending_review" ? `
        <div class="article-review-card-actions">
          <button class="article-review-btn article-review-btn--approve"
                  data-article-decide="${row.id}"
                  data-article-decision="approve"
                  ${deciding ? "disabled" : ""}>
            ${deciding ? "…" : "Approve"}
          </button>
          <button class="article-review-btn article-review-btn--reject"
                  data-article-decide="${row.id}"
                  data-article-decision="reject"
                  ${deciding ? "disabled" : ""}>
            ${deciding ? "…" : "Reject"}
          </button>
        </div>
      ` : ""}
    </article>
  `;
}


function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
