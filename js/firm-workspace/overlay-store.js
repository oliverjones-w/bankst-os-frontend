/**
 * Firm Workspace — overlay store (the workspace "memory").
 *
 * Holds ONLY user-authored spatial state, kept strictly separate from the
 * adapter read-model (suggestion-engine.js):
 *
 *   { cards:   { <key>: { x, y, color?, note? } },   // canvas positions
 *     groups:  [ { id, name, memberKeys: [<key>] } ], // named clusters ("VIX desk")
 *     rejected: [ <key> ] }                           // hidden suggestions
 *
 * Keys are namespaced (identity.js), so state survives the eqd:* → genotype:*
 * remap on promote. Persistence is transport-injected — the store itself is
 * backend-agnostic (localStorage today; an independent server store later, with
 * NO change here). See memory: data-layer-canonical-sources (NOT Postgres).
 */

import { remapOverlayKey } from "./identity.js";

const emptyState = () => ({ cards: {}, groups: [], rejected: [] });

function normalize(d) {
  return {
    cards: d && typeof d.cards === "object" && d.cards ? d.cards : {},
    groups: Array.isArray(d?.groups) ? d.groups : [],
    rejected: Array.isArray(d?.rejected) ? d.rejected : [],
  };
}

/**
 * @param {{ firmKey: string, transport?: { load?, save? }, autosaveMs?: number }} opts
 */
export function createOverlayStore({ firmKey, transport = null, autosaveMs = 700 }) {
  let state = emptyState();
  let saveTimer = null;
  const listeners = new Set();

  const emit = () => {
    for (const cb of listeners) cb(state);
  };

  async function flush() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (!transport?.save) return;
    try {
      await transport.save(firmKey, state);
    } catch (e) {
      console.warn(`[overlay] save failed for ${firmKey}:`, e);
    }
  }

  function scheduleSave() {
    if (!transport?.save) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, autosaveMs);
  }

  // Mutate + notify + autosave. Use for changes the UI must re-render from.
  function commit(fn) {
    fn();
    emit();
    scheduleSave();
  }

  return {
    get state() {
      return state;
    },
    getState() {
      return state;
    },

    /** Subscribe to state changes. Returns an unsubscribe fn. */
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    async load() {
      if (transport?.load) {
        try {
          const d = await transport.load(firmKey);
          if (d) state = normalize(d);
        } catch (e) {
          console.warn(`[overlay] load failed for ${firmKey}:`, e);
        }
      }
      emit();
      return state;
    },

    // ── Cards (canvas positions) ────────────────────────────────────────────
    hasCard(key) {
      return !!state.cards[key];
    },
    placeCard(key, x, y) {
      commit(() => {
        state.cards[key] = { ...(state.cards[key] || {}), x, y };
      });
    },
    /** Live drag-move: persists but skips re-render (the DOM node already moved). */
    moveCard(key, x, y) {
      if (!state.cards[key]) return;
      state.cards[key] = { ...state.cards[key], x, y };
      scheduleSave();
    },
    removeCard(key) {
      commit(() => {
        delete state.cards[key];
      });
    },
    setCardColor(key, color) {
      commit(() => {
        if (state.cards[key]) state.cards[key].color = color;
      });
    },

    // ── Groups (named spatial clusters) ─────────────────────────────────────
    createGroup(name, memberKeys = []) {
      const id = `grp-${crypto.randomUUID()}`;
      commit(() => {
        state.groups.push({ id, name, memberKeys: [...memberKeys] });
      });
      return id;
    },
    renameGroup(id, name) {
      commit(() => {
        const g = state.groups.find((g) => g.id === id);
        if (g) g.name = name;
      });
    },
    addToGroup(id, key) {
      commit(() => {
        const g = state.groups.find((g) => g.id === id);
        if (g && !g.memberKeys.includes(key)) g.memberKeys.push(key);
      });
    },
    removeFromGroup(id, key) {
      commit(() => {
        const g = state.groups.find((g) => g.id === id);
        if (g) g.memberKeys = g.memberKeys.filter((k) => k !== key);
      });
    },
    deleteGroup(id) {
      commit(() => {
        state.groups = state.groups.filter((g) => g.id !== id);
      });
    },
    groupFor(key) {
      return state.groups.find((g) => g.memberKeys.includes(key)) || null;
    },

    // ── Rejected suggestions ────────────────────────────────────────────────
    isRejected(key) {
      return state.rejected.includes(key);
    },
    reject(key) {
      commit(() => {
        if (!state.rejected.includes(key)) state.rejected.push(key);
        delete state.cards[key]; // a rejected card leaves the board
      });
    },
    unreject(key) {
      commit(() => {
        state.rejected = state.rejected.filter((k) => k !== key);
      });
    },

    /** Promote/freeze: rename a key everywhere (cards/groups/rejected). */
    remap(fromKey, toKey) {
      commit(() => {
        remapOverlayKey(state, fromKey, toKey);
      });
    },

    flush,
  };
}
