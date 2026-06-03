import { escapeHtml } from "../utils.js";

export const OUTLOOK_RESOLUTION_VIEW_ID = "outlook.resolution";

export function createOutlookResolutionView(outlookGet, outlookPost) {
  return {
    id: OUTLOOK_RESOLUTION_VIEW_ID,
    label: "Entity Resolution",
    section: "Approval",
    endpoint: "/api/outlook_intel/articles",

    load: async () => {
      const articles = await outlookGet("/articles?intake_state=ready_for_resolution&limit=100&sort=published_at DESC");
      return {
        view: "list",
        articles: articles.articles || [],
        selectedArticleId: null,
        selectedArticleData: null,
        approvingMention: null,
        reviewerEmail: localStorage.getItem("outlook.reviewer.email") || "",
        approvalNotes: "",
      };
    },

    render: (data) => {
      if (data.view === "detail" && data.selectedArticleId) {
        return renderArticleDetail(data);
      }
      return renderMentionsList(data);
    },

    onSelectArticle(articleId, data, rerender) {
      data.selectedArticleId = articleId;
      data.view = "detail";
      data.selectedArticleData = data.articles.find(a => a.id === articleId);
      rerender();
    },

    onBackToList(data, rerender) {
      data.view = "list";
      data.selectedArticleId = null;
      data.selectedArticleData = null;
      data.approvingMention = null;
      rerender();
    },

    onStartApproval(articleId, mentionId, candidateId, data, rerender) {
      data.approvingMention = { articleId, mentionId, candidateId };
      rerender();
    },

    onCancelApproval(data, rerender) {
      data.approvingMention = null;
      data.reviewerEmail = "";
      data.approvalNotes = "";
      rerender();
    },

    async onSubmitApproval(data, rerender) {
      if (!data.approvingMention) return;
      if (!data.reviewerEmail.trim()) {
        alert("Please enter your email");
        return;
      }

      const { articleId, mentionId, candidateId } = data.approvingMention;
      try {
        await outlookPost(
          `/articles/${articleId}/mentions/${mentionId}/candidates/${candidateId}/approve`,
          {
            reviewer: data.reviewerEmail,
            notes: data.approvalNotes,
          }
        );
        localStorage.setItem("outlook.reviewer.email", data.reviewerEmail);
        data.approvingMention = null;
        data.approvalNotes = "";
        rerender();
      } catch (err) {
        alert(`Failed to approve: ${err.message}`);
      }
    },

    onReviewerEmailChange(email, data, rerender) {
      data.reviewerEmail = email;
    },

    onNotesChange(notes, data, rerender) {
      data.approvalNotes = notes;
    },
  };
}

function renderMentionsList(data) {
  const articles = data.articles || [];

  const rows = articles
    .slice(0, 50)
    .map(article => {
      const pendingCount = article.mentions_count - article.approved_links_count;
      const progress = article.mentions_count > 0
        ? Math.round((article.approved_links_count / article.mentions_count) * 100)
        : 0;

      return `
        <tr class="mention-list-row" data-article-id="${article.id}">
          <td class="headline-cell">
            <button class="headline-btn" data-article-select="${article.id}" type="button">
              ${escapeHtml(article.headline)}
            </button>
          </td>
          <td>${escapeHtml(article.source_name || "—")}</td>
          <td class="count-cell">${article.mentions_count}</td>
          <td class="progress-cell">
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
            <span class="progress-text">${article.approved_links_count}/${article.mentions_count}</span>
          </td>
          <td>${formatDate(article.published_at)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="outlook-resolution-header">
      <h2>Entity Resolution</h2>
      <p class="resolution-meta">${articles.length} articles with unresolved mentions</p>
    </div>
    <div class="table-wrap">
      <table class="data-table outlook-mentions-table">
        <thead>
          <tr>
            <th>Headline</th>
            <th>Source</th>
            <th>Mentions</th>
            <th>Progress</th>
            <th>Published</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function renderArticleDetail(data) {
  const article = data.selectedArticleData;
  if (!article) return renderLoading();

  const pendingCount = article.mentions_count - article.approved_links_count;
  const progress = article.mentions_count > 0
    ? Math.round((article.approved_links_count / article.mentions_count) * 100)
    : 0;

  const mentionsHTML = (article.mentions || [])
    .map(mention => renderMentionCard(mention, article.id, data.approvingMention))
    .join("");

  const approvalModalHTML = data.approvingMention
    ? renderApprovalModal(data.approvingMention, data.reviewerEmail, data.approvalNotes)
    : "";

  return `
    <div class="article-detail-header">
      <button class="back-btn" data-outlook-back type="button">← Back to list</button>
      <h2>${escapeHtml(article.headline)}</h2>
      <div class="article-meta">
        <span class="source-badge">${escapeHtml(article.source_name || "Unknown")}</span>
        <span>${formatDate(article.published_at)}</span>
      </div>
    </div>

    <div class="article-progress">
      <div class="progress-section">
        <h3>Resolution Progress</h3>
        <div class="progress-bar-large">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
        <p class="progress-text-large">${article.approved_links_count} of ${article.mentions_count} mentions resolved (${progress}%)</p>
      </div>
    </div>

    <div class="mentions-section">
      <h3>Mentions (${article.mentions_count})</h3>
      <div class="mentions-list">
        ${mentionsHTML}
      </div>
    </div>

    ${approvalModalHTML}
  `;
}

function renderMentionCard(mention, articleId, approvingMention) {
  const isResolved = mention.resolution_status === "resolved";
  const candidateText = mention.candidates_count === 1 ? "candidate" : "candidates";

  return `
    <div class="mention-card ${isResolved ? "is-resolved" : ""}">
      <div class="mention-header">
        <div class="mention-info">
          <span class="entity-type-badge ${mention.entity_type}">${escapeHtml(mention.entity_type)}</span>
          <span class="mention-text">${escapeHtml(mention.mention_text)}</span>
          ${isResolved ? '<span class="resolved-check">✓</span>' : ""}
        </div>
        <span class="candidates-count">${mention.candidates_count} ${candidateText}</span>
      </div>

      ${!isResolved && mention.candidates && mention.candidates.length > 0
        ? `<div class="candidates-list">
             ${mention.candidates.map((c, i) => renderCandidate(c, articleId, mention.id, approvingMention)).join("")}
           </div>`
        : ""}

      ${isResolved
        ? '<div class="resolved-message">✓ Resolved</div>'
        : ""}
    </div>
  `;
}

function renderCandidate(candidate, articleId, mentionId, approvingMention) {
  const scorePercent = Math.round((candidate.match_score || 0) * 100);
  const isApproving = approvingMention &&
    approvingMention.articleId === articleId &&
    approvingMention.mentionId === mentionId &&
    approvingMention.candidateId === candidate.id;

  return `
    <div class="candidate-item ${isApproving ? "is-selected" : ""}">
      <div class="candidate-details">
        <div class="candidate-label">${escapeHtml(candidate.candidate_label)}</div>
        <div class="candidate-match">
          <div class="score-bar">
            <div class="score-fill" style="width: ${scorePercent}%"></div>
          </div>
          <span class="score-text">${scorePercent}% ${escapeHtml(candidate.match_basis || "match")}</span>
        </div>
      </div>
      <button
        class="approve-btn"
        data-outlook-approve-start="${articleId}|${mentionId}|${candidate.id}"
        type="button"
      >Approve</button>
    </div>
  `;
}

function renderApprovalModal(approvingMention, reviewerEmail, approvalNotes) {
  return `
    <div class="outlook-modal-overlay">
      <div class="outlook-modal">
        <h3>Approve Entity Link</h3>
        <div class="modal-form">
          <div class="form-group">
            <label>Your Email</label>
            <input
              type="email"
              class="form-input"
              data-outlook-reviewer-email
              value="${escapeHtml(reviewerEmail)}"
              placeholder="user@bankst.co"
            />
          </div>
          <div class="form-group">
            <label>Notes (optional)</label>
            <textarea
              class="form-textarea"
              data-outlook-approval-notes
              placeholder="e.g., Confirmed current role, Different person, etc."
            >${escapeHtml(approvalNotes)}</textarea>
          </div>
          <div class="modal-actions">
            <button class="btn-primary" data-outlook-submit-approval type="button">Approve</button>
            <button class="btn-secondary" data-outlook-cancel-approval type="button">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderLoading() {
  return `<div class="loading">Loading articles...</div>`;
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
  } catch {
    return "—";
  }
}
