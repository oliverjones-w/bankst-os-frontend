/**
 * Firm Workspace — suggestion engine.
 *
 * Builds FirmWorkspaceData for a firm by fanning out across the enabled
 * suggestion sources and merging their candidates into the SUGGESTED lane.
 *
 * Two lanes, distinct sources (see memory: firm-workspace-vision):
 *   - confirmedPeople = a future SQLite projection of the genotype (the canonical
 *     read-model). NOT BUILT YET → always renders empty here. Never counterfeit
 *     it from a source's vault_id.
 *   - suggestedPeople = whatever the source adapters fuzzy/intelligently match to
 *     this firm. EQD is the first adapter, not the genotype source.
 *
 * @typedef {Object} FirmRef
 * @property {string} [vaultId]    Genotype vault id, once resolved (else absent).
 * @property {string} [eqdFirmId]  EQD source firm id (eqd.db firms.firm_id).
 * @property {string} [name]       Canonical/display name (the only cross-store join today).
 */

import { getSources } from "./sources/registry.js";

/**
 * @param {FirmRef} firmRef
 * @param {{ sources?: Array }} [opts]  Defaults to the shared registry's enabled sources.
 * @returns {Promise<{ firm: FirmRef, confirmedPeople: [], suggestedPeople: PersonNode[], relationships: [] }>}
 */
export async function buildFirmWorkspaceData(firmRef, { sources } = {}) {
  const active = sources ?? getSources({ enabledOnly: true });

  // Fan out. A failing source must not sink the whole workspace — it just
  // contributes nothing. (Honest degradation: log so a dead source is visible.)
  const batches = await Promise.all(
    active.map((s) =>
      Promise.resolve()
        .then(() => s.fetchFirmSuggestions(firmRef))
        .then((nodes) => (Array.isArray(nodes) ? nodes : []))
        .catch((err) => {
          console.warn(`[firm-workspace] source "${s.id}" failed:`, err);
          return [];
        })
    )
  );

  const suggestedPeople = mergeSuggestions(batches.flat());

  return {
    firm: firmRef,
    confirmedPeople: [], // genotype projection adapter — not built yet
    suggestedPeople,
    relationships: [], // spatial-only V1
  };
}

/**
 * Merge candidates across sources into one ranked suggested lane.
 *
 * Dedupe by namespaced key, keeping the HIGHER-scoring instance when a person
 * surfaces more than once (e.g. via two matched EQD firm rows). Result is sorted
 * by match score, strongest first. Resolving that the same PERSON surfaced by
 * two DIFFERENT source APIs is the same node — cross-source identity matching —
 * is the deferred "real meat" and also lands here later.
 */
function mergeSuggestions(nodes) {
  const byKey = new Map();
  for (const n of nodes) {
    const existing = byKey.get(n.key);
    if (!existing || (n.score ?? 0) > (existing.score ?? 0)) {
      byKey.set(n.key, n);
    }
  }
  return [...byKey.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
