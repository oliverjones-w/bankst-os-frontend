/**
 * Firm Workspace — namespaced identity.
 *
 * Source IDs must NEVER pretend to be canonical. Every entity the workspace
 * touches is keyed as `<namespace>:<id>` so overlay state (positions, groups,
 * the rejected set) survives the eqd:* → genotype:* remap that happens when a
 * suggestion is later promoted/frozen into the genotype.
 *
 *   Canonical person : genotype:<vault_id>
 *   Provisional       : eqd:<eqd_person_id>   (or <other-source>:<id>)
 *   Firm key          : genotype:<firm_vault_id> when available, else eqd:<firm_id>
 *
 * See memory: firm-workspace-vision (identity — namespaced keys).
 */

export const NS = Object.freeze({
  GENOTYPE: "genotype",
  REFS: "refs", // canonical firm-directory identity (refs.db firms.id)
  EQD: "eqd",
  MAPPING_HF: "hf", // mapping_tools HF map (buy-side hedge-fund people)
});

/** Build a namespaced key. */
export function makeKey(namespace, id) {
  if (!namespace || id == null) throw new Error(`makeKey: bad args (${namespace}, ${id})`);
  return `${namespace}:${id}`;
}

/** Split a namespaced key into { namespace, id }. Returns null for malformed keys. */
export function parseKey(key) {
  if (typeof key !== "string") return null;
  const i = key.indexOf(":");
  if (i < 1) return null;
  return { namespace: key.slice(0, i), id: key.slice(i + 1) };
}

export function isGenotypeKey(key) {
  return typeof key === "string" && key.startsWith(`${NS.GENOTYPE}:`);
}

/** True for any non-genotype (source-layer) key. */
export function isSourceKey(key) {
  const parsed = parseKey(key);
  return !!parsed && parsed.namespace !== NS.GENOTYPE;
}

// ── Convenience builders for the EQD source ─────────────────────────────────────

export function eqdPersonKey(eqdPersonId) {
  return makeKey(NS.EQD, eqdPersonId);
}

export function genotypePersonKey(vaultId) {
  return makeKey(NS.GENOTYPE, vaultId);
}

/**
 * The overlay key a firm should anchor its workspace state on.
 *
 * Precedence follows canonical-ness: genotype vault once resolved → the refs
 * directory id (the registry's canonical firm identity today) → a bare source
 * firm id as a last resort. The workspace overlay is GLOBAL firm memory, so it
 * keys on the canonical firm — never on a source's id (e.g. EQD's firm_id).
 */
export function firmOverlayKey({ vaultId, refsId, eqdFirmId } = {}) {
  if (vaultId) return makeKey(NS.GENOTYPE, vaultId);
  if (refsId) return makeKey(NS.REFS, refsId);
  if (eqdFirmId) return makeKey(NS.EQD, eqdFirmId);
  return null;
}

// ── Remap (promote / freeze) ────────────────────────────────────────────────────

/**
 * Rewrite a single key inside an overlay object's keyed maps/sets when an entity
 * is promoted (e.g. eqd:abc → genotype:<vault>). Mutates and returns `overlay`.
 * Used by the promote flow so positions/groups/rejected stay attached to the
 * entity across the identity change. Pure structural rename — no projection logic.
 */
export function remapOverlayKey(overlay, fromKey, toKey) {
  if (!overlay || fromKey === toKey) return overlay;

  if (overlay.cards && fromKey in overlay.cards) {
    overlay.cards[toKey] = overlay.cards[fromKey];
    delete overlay.cards[fromKey];
  }
  if (Array.isArray(overlay.groups)) {
    for (const g of overlay.groups) {
      if (!Array.isArray(g.memberKeys)) continue;
      g.memberKeys = g.memberKeys.map((k) => (k === fromKey ? toKey : k));
    }
  }
  if (Array.isArray(overlay.rejected)) {
    overlay.rejected = overlay.rejected.map((k) => (k === fromKey ? toKey : k));
  }
  return overlay;
}
