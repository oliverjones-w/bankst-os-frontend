/**
 * outlook_articles.js — Outlook Intelligence article browser & entity resolution interface.
 *
 * Displays extracted Outlook articles for human-in-the-loop entity resolution.
 * Features:
 * - Browse articles by source (TeamAP, People Moves, HFReturns)
 * - View metadata, extracted URLs, mention counts
 * - Expandable article detail with full body (lazy-loaded)
 * - Show mentions with proposed matches/candidates
 * - Approve matches directly (writes article_id to intel.json)
 */

import { escapeHtml } from "../utils.js";
import { badge, emptyState, loadingView, tabBar } from "../ui.js";

export const OUTLOOK_ARTICLES_VIEW_ID = "outlook_intel.articles";

const SOURCES = [
  { id: "all", label: "All" },
  { id: "TeamAP", label: "TeamAP" },
  { id: "People Moves", label: "People Moves" },
  { id: "HFReturns", label: "HF Returns" },
];

export function createOutlookArticlesView(apiGet, apiPost) {
  async function fetchArticleBody(articleId) {
    try {
      return await apiGet(`/articles/${articleId}`);
    } catch (err) {
      console.error(`Failed to fetch body for article ${articleId}:`, err);
      return null;
    }
  }

  async function fetchMentions(articleId) {
    try {
      const res = await apiGet(`/articles/${articleId}/mentions`);
      return res.mentions || [];
    } catch (err) {
      console.error(`Failed to fetch mentions for article ${articleId}:`, err);
      return [];
    }
  }

  async function fetchCandidates(articleId, mentionId) {
    try {
      const res = await apiGet(`/articles/${articleId}/mentions/${mentionId}/candidates`);
      return res.candidates || [];
    } catch (err) {
      console.error(`Failed to fetch candidates for mention ${mentionId}:`, err);
      return [];
    }
  }

  async function approveCandidate(articleId, mentionId, candidateId, reviewerEmail) {
    try {
      await apiPost(`/articles/${articleId}/mentions/${mentionId}/candidates/${candidateId}/approve`, {
        reviewer: reviewerEmail,
        notes: "Approved from Outlook Intel browser",
      });
      return true;
    } catch (err) {
      console.error(`Failed to approve candidate:`, err);
      throw err;
    }
  }

  return {
    id: OUTLOOK_ARTICLES_VIEW_ID,
    label: "Outlook Intel",
    section: "Intelligence",
    endpoint: "/api/outlook_intel/articles",

    load: async () => {
      try {
        const res = await apiGet("/articles?limit=500&offset=0");
        return {
          articles: res.articles || [],
          total: res.total || 0,
          activeSource: "all",
          expandedId: null,
          selectedForBody: null,
          bodyLoading: null,
          mentionsLoading: null,
          mentionsByArticle: {},
          candidatesByMention: {},
          approvingCandidateId: null,
          reviewerEmail: localStorage.getItem("outlook.reviewer.email") || "",
          error: null,
          loading: false,
        };
      } catch (err) {
        return {
          articles: [],
          total: 0,
          activeSource: "all",
          expandedId: null,
          selectedForBody: null,
          bodyLoading: null,
          mentionsLoading: null,
          mentionsByArticle: {},
          candidatesByMention: {},
          approvingCandidateId: null,
          reviewerEmail: localStorage.getItem("outlook.reviewer.email") || "",
          error: err.message,
          loading: false,
        };
      }
    },

    render: (data) => data ? renderRoot(data) : loadingView(),

    handleClick(event, data, rerender) {
      // Source tab switching
      const sourceTab = event.target.closest("[data-outlook-source]");
      if (sourceTab) {
        data.activeSource = sourceTab.dataset.outlookSource;
        data.expandedId = null;
        data.selectedForBody = null;
        rerender();
        return;
      }

      // Article row expand/collapse
      const expandBtn = event.target.closest("[data-outlook-expand]");
      if (expandBtn) {
        const id = Number(expandBtn.dataset.outlookExpand);
        data.expandedId = data.expandedId === id ? null : id;
        data.selectedForBody = null;

        if (data.expandedId === id && !data.mentionsByArticle[id]) {
          data.mentionsLoading = id;
          rerender();

          fetchMentions(id).then(mentions => {
            data.mentionsByArticle[id] = mentions;
            data.mentionsLoading = null;

            mentions.forEach(mention => {
              if (mention.candidates_count > 0 && !data.candidatesByMention[mention.id]) {
                fetchCandidates(id, mention.id).then(candidates => {
                  data.candidatesByMention[mention.id] = candidates;
                  rerender();
                });
              }
            });

            rerender();
          });
        } else {
          rerender();
        }
        return;
      }

      // Show full body
      const bodyBtn = event.target.closest("[data-outlook-show-body]");
      if (bodyBtn) {
        const id = Number(bodyBtn.dataset.outlookShowBody);
        if (data.selectedForBody === id) {
          data.selectedForBody = null;
          rerender();
          return;
        }

        data.selectedForBody = id;
        data.bodyLoading = id;
        rerender();

        fetchArticleBody(id).then(article => {
          if (article) {
            const existing = data.articles.find(a => a.id === id);
            if (existing) existing.body_text = article.body_text;
          }
          data.bodyLoading = null;
          rerender();
        });
        return;
      }

      // Approve candidate
      const approveBtn = event.target.closest("[data-outlook-approve]");
      if (approveBtn) {
        const articleId = Number(approveBtn.dataset.articleId);
        const mentionId = Number(approveBtn.dataset.mentionId);
        const candidateId = Number(approveBtn.dataset.candidateId);

        if (!data.reviewerEmail.trim()) {
          alert("Please enter your email in the Outlook Intel settings");
          return;
        }

        approveBtn.disabled = true;
        approveBtn.textContent = "Approving...";

        approveCandidate(articleId, mentionId, candidateId, data.reviewerEmail)
          .then(() => {
            localStorage.setItem("outlook.reviewer.email", data.reviewerEmail);
            rerender();
          })
          .catch(err => {
            alert(`Error approving: ${err.message}`);
            approveBtn.disabled = false;
            approveBtn.textContent = "Approve";
          });
        return;
      }

      // URL link click — allow default
      // No handler needed, links work naturally
    },
  };
}

function renderRoot(data) {
  const { articles, activeSource, expandedId, error } = data;

  // Filter articles by source
  const filtered = activeSource === "all"
    ? articles
    : articles.filter(a => a.source_name === activeSource);

  const sourceTabs = SOURCES.map(s => ({
    ...s,
    count: s.id === "all"
      ? articles.length
      : articles.filter(a => a.source_name === s.id).length,
  }));

  return `
    <div class="view-wrapper outlook-articles-view">
      ${error ? `<div class="view-error">${escapeHtml(error)}</div>` : ""}

      ${tabBar(sourceTabs, activeSource, "data-outlook-source")}

      ${filtered.length === 0
        ? emptyState(`No articles in ${activeSource === "all" ? "database" : activeSource}.`)
        : `<div class="outlook-articles-list">
             <table class="data-table outlook-articles-table">
               <thead>
                 <tr>
                   <th>Subject</th>
                   <th>Source</th>
                   <th>Sender</th>
                   <th>Date</th>
                   <th>Mentions</th>
                 </tr>
               </thead>
               <tbody>
                 ${filtered.map(article => renderRow(article, expandedId, data.selectedForBody, data.bodyLoading, data)).join("")}
               </tbody>
             </table>
           </div>`}

      <div class="outlook-articles-meta">
        ${filtered.length} of ${articles.length} articles
      </div>
    </div>`;
}

function renderRow(article, expandedId, selectedForBody, bodyLoading, data) {
  const isExpanded = expandedId === article.id;

  return `
    <tr class="outlook-article-row" data-outlook-article-id="${article.id}">
      <td>
        <button class="row-toggle outlook-subject" data-outlook-expand="${article.id}">
          ${escapeHtml(article.headline || "(no subject)")}
        </button>
      </td>
      <td>${escapeHtml(article.source_name)}</td>
      <td class="outlook-sender">${escapeHtml(article.metadata?.sender_name || "")}</td>
      <td class="outlook-date">${formatDate(article.published_at)}</td>
      <td class="outlook-mentions">
        <span class="mention-count-badge">${article.mentions_count}</span>
      </td>
    </tr>
    ${isExpanded ? renderDetail(article, selectedForBody, bodyLoading, data) : ""}`;
}

function renderDetail(article, selectedForBody, bodyLoading, data) {
  const isBodyLoading = bodyLoading === article.id;
  const mentionsLoading = data.mentionsLoading === article.id;
  const mentions = data.mentionsByArticle[article.id] || [];
  const metadata = article.metadata || {};
  const urls = metadata.extracted_urls || [];
  const sender_email = metadata.sender_email || metadata.sender_email_fallback;

  return `
    <tr class="outlook-detail-row">
      <td colspan="5">
        <div class="outlook-detail-split">

          <!-- Left Pane (420px): Metadata, Links, Mentions/Candidates -->
          <div class="outlook-detail-left">

            <!-- Metadata -->
            <div class="outlook-metadata">
              <div class="outlook-metadata-header">Metadata</div>
              <div class="meta-item">
                <strong>From:</strong> ${escapeHtml(metadata.sender_name || "")}${sender_email ? ` &lt;${escapeHtml(sender_email)}&gt;` : ""}
              </div>
              <div class="meta-item">
                <strong>Received:</strong> ${formatDateTime(article.published_at)}
              </div>
              <div class="meta-item">
                <strong>Source:</strong> ${escapeHtml(metadata.source_folder || article.source_name)}
              </div>
            </div>

            <!-- Extracted URLs -->
            ${urls.length > 0 ? `
              <div class="outlook-urls">
                <div class="outlook-urls-header">Links</div>
                <div class="url-list">
                  ${urls.map(url => `
                    <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="url-badge">
                      ${escapeHtml(truncateUrl(url))}
                    </a>
                  `).join("")}
                </div>
              </div>
            ` : ""}

            <!-- Mentions Section with Proposed Matches -->
            <div class="outlook-mentions-section">
              <div class="outlook-mentions-header">Mentions & Candidates</div>
              ${article.mentions_count === 0
                ? `<div class="empty-section">No mentions found</div>`
                : mentionsLoading
                  ? `<div class="loading-section">Loading mentions...</div>`
                  : renderMentionsWithCandidates(mentions, article.id, data)
              }
            </div>

          </div>

          <!-- Right Pane (Fluid): Body Text Viewport -->
          <div class="outlook-detail-right">
            <div class="outlook-body-header">Body</div>
            ${isBodyLoading
              ? `<div class="outlook-body-loading">Loading…</div>`
              : `<div class="outlook-body">
                   <pre>${escapeHtml(article.body_text || "(no body text)")}</pre>
                 </div>`
            }
          </div>

        </div>
      </td>
    </tr>`;
}

function renderMentionsWithCandidates(mentions, articleId, data) {
  if (!mentions || mentions.length === 0) {
    return `<div class="empty-section">No mentions extracted</div>`;
  }

  return `<div class="mentions-with-candidates">
    ${mentions.map(mention => {
      const candidates = data.candidatesByMention[mention.id] || [];
      return `
        <div class="mention-item">
          <div class="mention-header">
            <span class="mention-entity-type">${escapeHtml(mention.entity_type)}</span>
            <span class="mention-text">"${escapeHtml(mention.mention_text)}"</span>
            <span class="mention-status-badge ${mention.resolution_status}">${mention.resolution_status === "resolved" ? "✓ Resolved" : "Pending"}</span>
          </div>
          ${candidates.length > 0
            ? `<div class="candidates-list">
                 ${candidates.map(candidate => `
                   <div class="candidate-proposal">
                     <div class="candidate-info">
                       <div class="candidate-label">${escapeHtml(candidate.candidate_label)}</div>
                       <div class="candidate-score">${Math.round((candidate.match_score || 0) * 100)}% · ${escapeHtml(candidate.match_basis || "match")}</div>
                     </div>
                     <button
                       class="approve-candidate-btn"
                       data-outlook-approve
                       data-article-id="${articleId}"
                       data-mention-id="${mention.id}"
                       data-candidate-id="${candidate.id}"
                     >Approve</button>
                   </div>
                 `).join("")}
               </div>`
            : `<div class="no-candidates">No candidates found</div>`
          }
        </div>
      `;
    }).join("")}
  </div>`;
}

function truncateUuid(uuid) {
  if (!uuid || typeof uuid !== "string") return "";
  return uuid.length > 8 ? uuid.slice(0, 8) + "..." : uuid;
}

function truncateUrl(url) {
  if (!url || typeof url !== "string") return "";
  return url.length > 50 ? url.slice(0, 47) + "..." : url;
}

function formatDate(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
