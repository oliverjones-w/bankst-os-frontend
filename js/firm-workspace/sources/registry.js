/**
 * Firm Workspace — suggestion source registry.
 *
 * The workspace generates its SUGGESTED lane by fanning out across a registry of
 * source adapters. EQD is the FIRST adapter, NOT a privileged one — it is just
 * one source API among several we may choose to draw suggestions from.
 *
 * A SuggestionSource is a plain object implementing this contract:
 *
 *   {
 *     id:      string,            // stable, e.g. "eqd", "finra", "encore"
 *     label:   string,            // human label for provenance UI
 *     enabled: boolean,           // sources can be toggled off without unregistering
 *     async fetchFirmSuggestions(firmRef): Promise<PersonNode[]>,
 *   }
 *
 * `firmRef` is the cross-store firm identity (see suggestion-engine.js). Each
 * source is responsible for resolving it to its own firm id — today EQD reads
 * `firmRef.eqdFirmId` directly; richer name/vault matching is the deferred
 * "suggestion criteria" work.
 */

const _sources = new Map();

/** Register (or replace) a suggestion source. Returns the source. */
export function registerSource(source) {
  if (!source || typeof source.id !== "string") {
    throw new Error("registerSource: source must have a string `id`");
  }
  if (typeof source.fetchFirmSuggestions !== "function") {
    throw new Error(`registerSource: source "${source.id}" must implement fetchFirmSuggestions`);
  }
  _sources.set(source.id, source);
  return source;
}

export function getSource(id) {
  return _sources.get(id) ?? null;
}

/** All registered sources, or only the enabled ones with `{ enabledOnly: true }`. */
export function getSources({ enabledOnly = false } = {}) {
  const all = [..._sources.values()];
  return enabledOnly ? all.filter((s) => s.enabled) : all;
}

export function setSourceEnabled(id, enabled) {
  const s = _sources.get(id);
  if (s) s.enabled = !!enabled;
  return s ?? null;
}

/** Test/teardown helper. */
export function _clearSources() {
  _sources.clear();
}
