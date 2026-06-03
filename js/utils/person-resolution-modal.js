/**
 * Person Resolution Modal
 * Reusable modal for resolving person identity on mandate/pipeline rows
 */

import { escapeHtml } from "../utils.js";

export class PersonResolutionModal {
  constructor(opsGet, opsPost) {
    this.opsGet = opsGet;
    this.opsPost = opsPost;
    this.modal = null;
    this.data = null;
    this.onApproved = null;
  }

  async open(candidateId, candidateName, onApproved = null) {
    this.onApproved = onApproved;

    try {
      // Fetch matches
      const response = await this.opsGet(
        `/people/mandate-candidates/${candidateId}/people-matches?min_score=0.60`
      );

      this.data = {
        candidateId,
        candidateName,
        matches: response.matches || [],
        status: response.status,
        isLoading: false,
        approving: false,
        error: null,
        reviewerEmail: localStorage.getItem("reviewer_email") || "",
      };

      this.render();
    } catch (err) {
      this.data = {
        candidateId,
        candidateName,
        matches: [],
        status: "error",
        isLoading: false,
        approving: false,
        error: `Failed to load matches: ${err.message}`,
        reviewerEmail: localStorage.getItem("reviewer_email") || "",
      };
      this.render();
    }
  }

  render() {
    if (!this.data) return;

    const { matches, error, isLoading, approving, reviewerEmail } = this.data;

    const matchesHTML =
      matches.length > 0
        ? matches
            .map(m => {
              const scorePercent = Math.round(m.match_score * 100);
              const basisLabel = {
                exact_match: "Exact",
                fuzzy_match: "Fuzzy",
                substring_match: "Substring",
              }[m.match_basis] || m.match_basis;

              const confidenceClass =
                m.match_score >= 0.9
                  ? "high"
                  : m.match_score >= 0.75
                    ? "medium"
                    : "low";

              return `
                <div class="resolution-match" data-match-vault="${escapeHtml(m.vault_id)}">
                  <div class="resolution-match-header">
                    <span class="resolution-match-name">${escapeHtml(m.canonical_name)}</span>
                    <div class="resolution-match-badges">
                      <span class="badge badge--${confidenceClass}">${scorePercent}%</span>
                      <span class="badge badge--neutral">${escapeHtml(basisLabel)}</span>
                    </div>
                  </div>
                  <button
                    class="resolution-approve-btn"
                    data-approve-vault="${escapeHtml(m.vault_id)}"
                    type="button"
                    ${approving ? "disabled" : ""}
                  >
                    Approve
                  </button>
                </div>
              `;
            })
            .join("")
        : `
          <div class="resolution-no-matches">
            No matches found. Create new profile.
          </div>
        `;

    const errorHTML = error
      ? `<div class="resolution-error">${escapeHtml(error)}</div>`
      : "";

    const html = `
      <dialog class="system-modal is-open" data-resolution-modal>
        <div class="modal-header">
          <h2 class="modal-title">Resolve: ${escapeHtml(this.data.candidateName)}</h2>
        </div>

        <div class="modal-body" style="gap: 16px;">
          <div class="resolution-matches">
            ${matchesHTML}
          </div>

          <div class="resolution-footer">
            <input
              type="email"
              class="resolution-reviewer-email"
              placeholder="your@bankst.co"
              value="${escapeHtml(reviewerEmail)}"
              data-resolution-reviewer
              ${approving ? "disabled" : ""}
            />
            <button
              class="resolution-dismiss-btn"
              data-resolution-dismiss
              type="button"
              ${approving ? "disabled" : ""}
            >
              Close
            </button>
          </div>

          ${errorHTML}
        </div>
      </dialog>
    `;

    // Remove old modal if it exists
    if (this.modal) {
      this.modal.remove();
    }

    // Create and mount new modal
    const temp = document.createElement("div");
    temp.innerHTML = html;
    this.modal = temp.firstElementChild;
    document.body.appendChild(this.modal);

    // Attach event listeners
    this._attachListeners();
  }

  _attachListeners() {
    const approveButtons = this.modal.querySelectorAll("[data-approve-vault]");
    approveButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        const vaultId = btn.dataset.approveVault;
        this._approve(vaultId);
      });
    });

    const dismissBtn = this.modal.querySelector("[data-resolution-dismiss]");
    if (dismissBtn) {
      dismissBtn.addEventListener("click", () => this.close());
    }

    const reviewerInput = this.modal.querySelector("[data-resolution-reviewer]");
    if (reviewerInput) {
      reviewerInput.addEventListener("input", e => {
        this.data.reviewerEmail = e.target.value;
      });
    }

    // Close on backdrop click
    this.modal.addEventListener("click", e => {
      if (e.target === this.modal) this.close();
    });
  }

  async _approve(vaultId) {
    const reviewer = this.data.reviewerEmail.trim();
    if (!reviewer) {
      this.data.error = "Please enter your email address";
      this.render();
      return;
    }

    this.data.approving = true;
    this.render();

    try {
      const response = await this.opsPost(
        `/people/mandate-candidates/${this.data.candidateId}/approve/${vaultId}`,
        null,
        { reviewer }
      );

      if (response.status === "approved") {
        localStorage.setItem("reviewer_email", reviewer);
        if (this.onApproved) {
          this.onApproved(this.data.candidateId, vaultId);
        }
        this.close();
      } else {
        this.data.error = response.error || "Approval failed";
        this.data.approving = false;
        this.render();
      }
    } catch (err) {
      this.data.error = `Error: ${err.message}`;
      this.data.approving = false;
      this.render();
    }
  }

  close() {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
    this.data = null;
  }
}
