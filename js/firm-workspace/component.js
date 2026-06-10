/**
 * Firm Workspace — portable component (Table + Canvas, two lanes).
 *
 * Render-string + idempotent document-listener style (matching the app shell's
 * existing canvas pattern) so it drops into a view's render()/afterRender()
 * without a mount/unmount lifecycle fight.
 *
 *   LEFT  (table)  : two lanes —
 *      · Confirmed (genotype)  → empty until the genotype projection adapter lands
 *      · Suggested (ranked)    → fuzzy-matched source candidates, READ-ONLY cards
 *   RIGHT (canvas) : the board you drag cards onto; positions/groups/rejects are
 *                    the overlay "memory".
 *
 * Interaction rules (memory: firm-workspace-interaction-model):
 *   · Suggested cards are READ-ONLY — actions only: drag, Promote, Reject.
 *   · No in-card signal editing. Enrichment happens post-promote, out of band.
 *
 * Wiring: the host view calls setFirmWorkspaceContext({ store, getData, rerender,
 * onPromote }) when a firm opens, then embeds renderFirmWorkspace(...) in its
 * HTML. One document-level listener set is attached lazily and reads the context.
 */

// ── Context + lazy wiring ────────────────────────────────────────────────────
let _ctx = null;
let _wired = false;
let _drag = null;

export function setFirmWorkspaceContext(ctx) {
  _ctx = ctx;
  ensureWired();
}

function ensureWired() {
  if (_wired) return;
  _wired = true;
  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("mouseup", onMouseUp, true);
  document.addEventListener("click", onClick, true);
}

function boardEl() {
  return document.getElementById("fw-board");
}

// ── Drag: from suggestion list → board (place), and card → card (move) ───────
function onMouseDown(e) {
  if (!_ctx) return;

  const addHandle = e.target.closest("[data-fw-add]");
  if (addHandle) {
    e.preventDefault();
    _drag = { type: "place", key: addHandle.dataset.fwAdd, ghost: makeGhost(addHandle) };
    document.body.classList.add("fw-dragging");
    return;
  }

  const card = e.target.closest("[data-fw-card]");
  if (card && e.button === 0 && !e.target.closest("[data-fw-action]")) {
    e.preventDefault();
    const board = boardEl();
    const cr = card.getBoundingClientRect();
    _drag = {
      type: "move",
      key: card.dataset.fwCard,
      el: card,
      board,
      ox: e.clientX - cr.left,
      oy: e.clientY - cr.top,
    };
    document.body.classList.add("fw-dragging");
  }
}

function onMouseMove(e) {
  if (!_drag) return;
  if (_drag.ghost) {
    _drag.ghost.style.left = `${e.clientX + 12}px`;
    _drag.ghost.style.top = `${e.clientY - 16}px`;
  }
  if (_drag.type === "move" && _drag.el && _drag.board) {
    const br = _drag.board.getBoundingClientRect();
    const x = Math.max(0, e.clientX - br.left - _drag.ox);
    const y = Math.max(0, e.clientY - br.top - _drag.oy);
    _drag.el.style.left = `${x}px`;
    _drag.el.style.top = `${y}px`;
    _drag._last = { x, y };
  }
}

function onMouseUp(e) {
  if (!_drag) return;
  const d = _drag;
  _drag = null;
  document.body.classList.remove("fw-dragging");
  if (d.ghost) d.ghost.remove();

  if (d.type === "place") {
    const board = boardEl();
    if (!board) return;
    const br = board.getBoundingClientRect();
    if (e.clientX < br.left || e.clientX > br.right || e.clientY < br.top || e.clientY > br.bottom) return;
    const x = Math.max(0, e.clientX - br.left - 110);
    const y = Math.max(0, e.clientY - br.top - 26);
    _ctx.store.placeCard(d.key, x, y);
    _ctx.rerender();
  } else if (d.type === "move" && d._last) {
    _ctx.store.moveCard(d.key, d._last.x, d._last.y);
  }
}

// ── Delegated clicks: remove / reject / promote / group ──────────────────────
function onClick(e) {
  if (!_ctx) return;
  const action = e.target.closest("[data-fw-action]");
  if (!action) return;
  const kind = action.dataset.fwAction;
  const key = action.dataset.fwKey;

  if (kind === "remove") {
    _ctx.store.removeCard(key);
    _ctx.rerender();
  } else if (kind === "reject") {
    _ctx.store.reject(key);
    _ctx.rerender();
  } else if (kind === "unreject") {
    _ctx.store.unreject(key);
    _ctx.rerender();
  } else if (kind === "promote") {
    Promise.resolve(_ctx.onPromote?.(key)).finally(() => _ctx.rerender());
  } else if (kind === "new-group") {
    const name = window.prompt("Name this group (e.g. \"VIX desk\")");
    if (name && name.trim()) {
      _ctx.store.createGroup(name.trim());
      _ctx.rerender();
    }
  } else if (kind === "delete-group") {
    _ctx.store.deleteGroup(action.dataset.fwGroup);
    _ctx.rerender();
  }
}

function makeGhost(fromEl) {
  const g = document.createElement("div");
  g.className = "fw-ghost";
  g.textContent = fromEl.dataset.fwLabel || "card";
  document.body.appendChild(g);
  return g;
}

// ── Render ───────────────────────────────────────────────────────────────────

/**
 * @param {{ firm, confirmedPeople, suggestedPeople }} data
 * @param {{ cards, groups, rejected }} overlay
 */
export function renderFirmWorkspace(data, overlay) {
  const placed = new Set(Object.keys(overlay.cards || {}));
  const rejected = new Set(overlay.rejected || []);

  const suggestions = (data.suggestedPeople || []).filter((p) => !rejected.has(p.key));
  const confirmed = data.confirmedPeople || [];

  return `
    <div class="fw-root">
      <aside class="fw-table">
        ${renderLane("Confirmed", "genotype", confirmed, placed, {
          empty: "No genotype-linked people yet — the projection adapter isn't built. Promote a suggestion to start.",
        })}
        ${renderLane("Suggested", "source", suggestions, placed, {
          meta: `${suggestions.length} ranked${rejected.size ? ` · ${rejected.size} hidden` : ""}`,
          ranked: true,
        })}
      </aside>
      <section class="fw-canvas">
        <div class="fw-canvas-toolbar">
          <span class="fw-canvas-meta">${placed.size} on canvas · ${(data.firm?.name) || ""}</span>
          <button class="fw-btn" data-fw-action="new-group">+ Group</button>
        </div>
        ${renderGroups(overlay.groups || [])}
        <div class="fw-board" id="fw-board">
          ${renderBoard(data, overlay)}
        </div>
      </section>
    </div>
  `;
}

function renderLane(title, kind, people, placed, { empty, meta, ranked } = {}) {
  const body = people.length
    ? people.map((p) => renderListCard(p, placed.has(p.key), ranked)).join("")
    : `<div class="fw-lane-empty">${escapeHtml(empty || "Nothing here.")}</div>`;
  return `
    <div class="fw-lane fw-lane--${kind}">
      <div class="fw-lane-head">
        <span class="fw-lane-title">${escapeHtml(title)}</span>
        ${meta ? `<span class="fw-lane-meta">${escapeHtml(meta)}</span>` : ""}
      </div>
      <div class="fw-lane-body">${body}</div>
    </div>
  `;
}

function renderListCard(p, isPlaced, ranked) {
  const f = p.fields || {};
  const sub = truncate(descriptor(p), 46);
  const scoreBadge =
    ranked && p.score != null
      ? `<span class="fw-score fw-score--${p.suggestion?.tier || "weak"}" title="Matched source firm: ${escapeHtml(p.suggestion?.matchedFirmName || "")}">${Math.round(p.score * 100)}</span>`
      : "";
  return `
    <div class="fw-list-card${isPlaced ? " is-placed" : ""}"
         data-fw-add="${escapeAttr(p.key)}" data-fw-label="${escapeAttr(p.displayName)}">
      <div class="fw-list-main">
        ${scoreBadge}
        <span class="fw-list-name">${escapeHtml(p.displayName)}</span>
        ${isPlaced ? `<span class="fw-pinned" title="On canvas">◆</span>` : ""}
      </div>
      ${sub ? `<div class="fw-list-sub">${escapeHtml(sub)}</div>` : ""}
      <div class="fw-list-actions">
        <button class="fw-link" data-fw-action="promote" data-fw-key="${escapeAttr(p.key)}">Promote</button>
        <button class="fw-link fw-link--mute" data-fw-action="reject" data-fw-key="${escapeAttr(p.key)}">Reject</button>
      </div>
    </div>
  `;
}

function renderGroups(groups) {
  if (!groups.length) return "";
  return `
    <div class="fw-groups">
      ${groups
        .map(
          (g) => `
        <span class="fw-group-chip">
          ${escapeHtml(g.name)} <span class="fw-group-count">${g.memberKeys.length}</span>
          <button class="fw-group-x" data-fw-action="delete-group" data-fw-group="${escapeAttr(g.id)}" title="Delete group">×</button>
        </span>`
        )
        .join("")}
    </div>
  `;
}

function renderBoard(data, overlay) {
  const byKey = new Map();
  for (const p of [...(data.confirmedPeople || []), ...(data.suggestedPeople || [])]) byKey.set(p.key, p);

  const cards = Object.entries(overlay.cards || {})
    .map(([key, pos]) => {
      const p = byKey.get(key);
      return p ? renderBoardCard(p, pos, overlay) : "";
    })
    .join("");

  return cards || `<div class="fw-board-empty">Drag people from the list onto the board.</div>`;
}

function renderBoardCard(p, pos, overlay) {
  const f = p.fields || {};
  const group = (overlay.groups || []).find((g) => g.memberKeys.includes(p.key));
  const isConfirmed = p.resolutionState === "confirmed_genotype";
  const sub = truncate(descriptor(p), 40);
  return `
    <div class="fw-card${isConfirmed ? " fw-card--confirmed" : ""}"
         data-fw-card="${escapeAttr(p.key)}" style="left:${pos.x}px;top:${pos.y}px">
      <div class="fw-card-head">
        ${group ? `<span class="fw-card-group">${escapeHtml(group.name)}</span>` : ""}
        <button class="fw-card-x" data-fw-action="remove" data-fw-key="${escapeAttr(p.key)}" title="Remove from canvas">×</button>
      </div>
      <div class="fw-card-name">${escapeHtml(p.displayName)}</div>
      ${sub ? `<div class="fw-card-sub">${escapeHtml(sub)}</div>` : ""}
      ${f.priorFirm ? `<div class="fw-card-meta">Prior: ${escapeHtml(truncate(f.priorFirm, 22))}</div>` : ""}
    </div>
  `;
}

// ── Field helpers ────────────────────────────────────────────────────────────
function descriptor(p) {
  const f = p.fields || {};
  if (f.title && f.title.includes(",")) return f.title.split(",").slice(1).join(",").trim();
  return f.title || f.focus || f.function || "";
}

function truncate(s, max) {
  const t = (s || "").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function escapeAttr(s) {
  return escapeHtml(s);
}
