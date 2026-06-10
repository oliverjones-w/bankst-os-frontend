/**
 * Firm Workspace — data model (adapter read-layer types + factories).
 *
 * This is the ADAPTER DATA layer: a read-only projection. It is kept strictly
 * separate from the WORKSPACE OVERLAY (positions/groups/rejected) in
 * overlay-store.js. See memory: firm-workspace-vision.
 *
 *   FirmWorkspaceData = {
 *     firm:            FirmRef,
 *     confirmedPeople: PersonNode[],   // genotype-backed — EMPTY until the
 *                                      //   genotype projection adapter exists.
 *     suggestedPeople: PersonNode[],   // source-only suggestions (EQD + others)
 *     relationships:   RelationshipEdge[],  // spatial-only V1 → empty for now
 *   }
 */

import { NS, makeKey, eqdPersonKey, genotypePersonKey } from "./identity.js";

/** Lifecycle of a person node. EQD-only view today only ever emits "suggested_source". */
export const ResolutionState = Object.freeze({
  CONFIRMED_GENOTYPE: "confirmed_genotype",
  SUGGESTED_SOURCE: "suggested_source",
  PROMOTED: "promoted",
  REJECTED: "rejected",
  NEEDS_REVIEW: "needs_review",
});

/**
 * @typedef {Object} PersonNode
 * @property {string} key            Namespaced overlay key (eqd:<id> | genotype:<vault>).
 * @property {string} displayName
 * @property {string} resolutionState
 * @property {{ sourceId: string, personId?: string, roleId?: string }} source
 * @property {number|null} score     Firm-match confidence in [0,1] (drives ranking).
 * @property {Object} suggestion     Why this surfaced: { sourceId, score, tier, matchedFirmName }.
 * @property {string|null} vaultId   Promote/freeze marker on a suggestion (NOT a lane signal).
 * @property {Object} fields         Normalized display fields (see below).
 * @property {Object} raw            Original source record, kept for provenance / "why suggested".
 */

/**
 * Normalize an EQD `/firms/{id}/people` person row into a PersonNode.
 *
 * IMPORTANT: a `vault_id` here means this suggestion was already promoted/frozen.
 * It is recorded as `vaultId` metadata only — it does NOT move the node into the
 * confirmed lane in the EQD-only view. Confirmed-ness is a genotype-adapter
 * concern. The overlay key stays eqd:* until the genotype adapter asserts a link.
 */
export function personNodeFromEqd(
  row,
  { sourceId = NS.EQD, matchScore = null, matchTier = null, matchedFirmName = null } = {}
) {
  return {
    key: eqdPersonKey(row.person_id),
    displayName: row.full_name || "(unknown)",
    resolutionState: ResolutionState.SUGGESTED_SOURCE,
    source: {
      sourceId,
      personId: row.person_id,
      roleId: row.role_id ?? null,
    },
    score: matchScore,
    suggestion: {
      sourceId,
      score: matchScore,
      tier: matchTier,
      matchedFirmName, // the source-side firm name that matched this firm
    },
    vaultId: row.vault_id ?? null,
    fields: {
      title: row.raw_title ?? null,
      function: row.raw_function ?? null,
      group: row.raw_group ?? null,
      focus: row.raw_focus ?? null,
      priorFirm: row.raw_prior_firm ?? null,
      location: row.raw_location ?? null,
      seniorityTier: row.seniority_tier ?? null,
      roleType: row.role_type ?? null,
      keywords: Array.isArray(row.keywords) ? row.keywords : [],
    },
    raw: row,
  };
}

/** Empty workspace data shell — used as a loading/error fallback. */
export function emptyWorkspaceData(firm) {
  return {
    firm: firm ?? null,
    confirmedPeople: [],
    suggestedPeople: [],
    relationships: [],
  };
}

export { NS, makeKey, eqdPersonKey, genotypePersonKey };
