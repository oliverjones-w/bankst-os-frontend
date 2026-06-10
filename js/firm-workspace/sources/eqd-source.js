/**
 * Firm Workspace — EQD suggestion source (the first adapter).
 *
 * Wraps the EQD source-layer API (Excel → eqd.db → eqd_api) and emits ranked,
 * source-only PersonNode suggestions for a firm. EQD is messy source data: every
 * person it returns is a `suggested_source` node — never a confirmed/genotype
 * entity (confirmed-ness is a genotype-adapter concern).
 *
 * Resolution is BY FUZZY FIRM NAME, not by id. eqd.db firm_id has no refs/vault
 * id, so the adapter fetches EQD's firm list and fuzzy-matches each firm_name
 * against the canonical refs firm name (`firmRef.name`). Every matched firm's
 * people inherit that firm's match score — e.g. EQD "J.P. Morgan" ≈ refs
 * "JPMorgan" (~1.0) → those people are high-confidence suggestions.
 */

import { registerSource } from "./registry.js";
import { personNodeFromEqd } from "../model.js";
import { rankFirmMatches } from "../firm-match.js";

/**
 * @param {(path: string) => Promise<any>} eqdGet  Same fetch helper eqd.js uses (prepends /api/eqd).
 * @param {{ enabled?: boolean, threshold?: number }} [opts]
 */
export function createEqdSource(eqdGet, { enabled = true, threshold = 0.6 } = {}) {
  // Cache EQD's firm directory for the session — it's the candidate set every
  // firm match scores against. Promise-valued so concurrent calls share one fetch.
  let _firmsPromise = null;
  const loadEqdFirms = () => {
    if (!_firmsPromise) {
      _firmsPromise = Promise.resolve()
        .then(() => eqdGet("/firms"))
        .then((res) => res?.firms ?? [])
        .catch((err) => {
          _firmsPromise = null; // allow retry on next firm
          throw err;
        });
    }
    return _firmsPromise;
  };

  async function peopleAsSuggestions(eqdFirmId, { score, tier, matchedFirmName }) {
    const res = await eqdGet(`/firms/${eqdFirmId}/people`);
    const people = res?.people ?? [];
    return people.map((row) =>
      personNodeFromEqd(row, { sourceId: "eqd", matchScore: score, matchTier: tier, matchedFirmName })
    );
  }

  return {
    id: "eqd",
    label: "EQD",
    enabled,

    async fetchFirmSuggestions(firmRef) {
      // Explicit override: caller already knows the EQD firm id → exact match.
      if (firmRef?.eqdFirmId) {
        return peopleAsSuggestions(firmRef.eqdFirmId, {
          score: 1,
          tier: "high",
          matchedFirmName: firmRef.name ?? null,
        });
      }

      const name = firmRef?.name;
      if (!name) return [];

      const firms = await loadEqdFirms();
      const matches = rankFirmMatches(name, firms, {
        getName: (f) => f.firm_name,
        threshold,
      });
      if (!matches.length) return [];

      // A refs firm can map to several EQD firm rows ("JP Morgan", "JPMorgan
      // Chase"); union their people, each carrying its own match score.
      const batches = await Promise.all(
        matches.map((m) =>
          peopleAsSuggestions(m.candidate.firm_id, {
            score: m.score,
            tier: m.tier,
            matchedFirmName: m.candidate.firm_name,
          }).catch(() => [])
        )
      );
      return batches.flat();
    },
  };
}

/** Register the EQD source into the shared registry. */
export function registerEqdSource(eqdGet, opts) {
  return registerSource(createEqdSource(eqdGet, opts));
}
