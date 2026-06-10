/**
 * Firm Workspace — Mapping Tools HF-map suggestion source.
 *
 * The buy-side counterpart to EQD: ~24k hedge-fund people across ~2k firms
 * (`data/mapping/hf_map.db`). This is what makes suggestions flow for the
 * hedge-fund registry (EQD only covers sell-side banks).
 *
 * Like EQD, it resolves by FUZZY FIRM NAME: cache the HF firm directory
 * (`/hf/firms`), fuzzy-match each `firm` against the canonical refs name, then
 * pull each matched firm's people via `/hf/search?q={firm}` (filtered to that
 * firm to drop cross-field search noise).
 */

import { registerSource } from "./registry.js";
import { personNodeFromMappingHf } from "../model.js";
import { rankFirmMatches, normalizeFirmName } from "../firm-match.js";

/**
 * @param {(path: string) => Promise<any>} mappingGet  Helper that prepends /api/mapping.
 * @param {{ enabled?: boolean, threshold?: number, perFirmLimit?: number }} [opts]
 */
export function createMappingHfSource(mappingGet, { enabled = true, threshold = 0.6, perFirmLimit = 500 } = {}) {
  let _firmsPromise = null;
  const loadFirms = () => {
    if (!_firmsPromise) {
      _firmsPromise = Promise.resolve()
        .then(() => mappingGet("/hf/firms"))
        .then((res) => (Array.isArray(res) ? res : res?.firms ?? []))
        .catch((err) => {
          _firmsPromise = null;
          throw err;
        });
    }
    return _firmsPromise;
  };

  async function peopleFor(firmName, { score, tier }) {
    const res = await mappingGet(`/hf/search?q=${encodeURIComponent(firmName)}&limit=${perFirmLimit}`);
    const rows = Array.isArray(res) ? res : res?.results ?? res?.records ?? res?.people ?? [];
    const want = normalizeFirmName(firmName);
    return rows
      // /hf/search matches name/title/function too — keep only this firm's people.
      .filter((r) => normalizeFirmName(r.firm) === want)
      .map((r) => personNodeFromMappingHf(r, { matchScore: score, matchTier: tier, matchedFirmName: firmName }));
  }

  return {
    id: "mapping_hf",
    label: "HF Map",
    enabled,

    async fetchFirmSuggestions(firmRef) {
      const name = firmRef?.name;
      if (!name) return [];

      const firms = await loadFirms();
      const matches = rankFirmMatches(name, firms, { getName: (f) => f.firm, threshold });
      if (!matches.length) return [];

      const batches = await Promise.all(
        matches.slice(0, 3).map((m) =>
          peopleFor(m.candidate.firm, { score: m.score, tier: m.tier }).catch(() => [])
        )
      );
      return batches.flat();
    },
  };
}

export function registerMappingHfSource(mappingGet, opts) {
  return registerSource(createMappingHfSource(mappingGet, opts));
}
