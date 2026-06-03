/**
 * outlook_articles.js — Outlook Intelligence article browser & entity resolution interface.
 *
 * Displays extracted Outlook articles for human-in-the-loop entity resolution.
 * Features:
 * - Browse articles by source (TeamAP, People Moves, HFReturns)
 * - View metadata, extracted URLs, mention counts
 * - Expandable article detail with full body (lazy-loaded)
 * - Stub sections for future entity resolution (mentions, candidates, entity creation)
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

export function createOutlookArticlesView(apiGet) {
  async function fetchArticleBody(articleId) {
    try {
      return await apiGet(`/articles/${articleId}`);
    } catch (err) {
      console.error(`Failed to fetch body for article ${articleId}:`, err);
      return null;
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
        rerender();
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
                 ${filtered.map(article => renderRow(article, expandedId, data.selectedForBody, data.bodyLoading)).join("")}
               </tbody>
             </table>
           </div>`}

      <div class="outlook-articles-meta">
        ${filtered.length} of ${articles.length} articles
      </div>
    </div>`;
}

function renderRow(article, expandedId, selectedForBody, bodyLoading) {
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
    ${isExpanded ? renderDetail(article, selectedForBody, bodyLoading) : ""}`;
}

function renderDetail(article, selectedForBody, bodyLoading) {
  const isBodyLoading = bodyLoading === article.id;
  const hasBody = article.body_text && article.body_text.trim().length > 0;
  const metadata = article.metadata || {};
  const urls = metadata.extracted_urls || [];
  const sender_email = metadata.sender_email || metadata.sender_email_fallback;

  return `
    <tr class="outlook-detail-row">
      <td colspan="5">
        <div class="outlook-detail">

          <!-- Header -->
          <div class="outlook-detail-header">
            <h3>${escapeHtml(article.headline || "(no subject)")}</h3>
          </div>

          <!-- Metadata -->
          <div class="outlook-metadata">
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
              <strong>Links:</strong>
              <div class="url-list">
                ${urls.map(url => `
                  <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="url-badge">
                    ${escapeHtml(url.slice(0, 60))}${url.length > 60 ? '…' : ''}
                  </a>
                `).join("")}
              </div>
            </div>
          ` : ""}

          <!-- Mentions Section (Stub) -->
          <div class="outlook-mentions-section">
            <strong>Mentions:</strong>
            <div class="mentions-stub">
              ${article.mentions_count > 0
                ? `<p>${article.mentions_count} mention${article.mentions_count !== 1 ? 's' : ''} found</p>
                   <div class="mention-status">
                     <span class="approved">${article.approved_links_count} approved</span>
                     <span class="pending">${article.pending_mentions_count} pending</span>
                     <span class="rejected">? rejected</span>
                   </div>
                   <p class="stub-note">👷 NER extraction coming soon</p>`
                : `<p class="stub-note">No mentions identified yet</p>`
              }
            </div>
          </div>

          <!-- Body Text (Lazy-loaded) -->
          <div class="outlook-body-section">
            <strong>Body:</strong>
            ${isBodyLoading
              ? `<div class="outlook-body-loading">Loading...</div>`
              : `<div class="outlook-body">
                   <pre>${escapeHtml(article.body_text || "(loading...)")}</pre>
                 </div>`
            }
          </div>

          <!-- Proposed Links Section (Stub) -->
          <div class="outlook-candidates-section">
            <strong>Proposed Links:</strong>
            <div class="candidates-stub">
              <p class="stub-note">🔗 Entity matching coming soon</p>
            </div>
          </div>

          <!-- Entity Creation Section (Stub) -->
          <div class="outlook-creation-section">
            <button class="outlook-create-entity-btn" disabled>
              Create New Entity
            </button>
            <p class="stub-note">📝 Entity creation script integration pending</p>
          </div>

        </div>
      </td>
    </tr>`;
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
