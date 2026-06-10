/**
 * Firm Workspace — fuzzy firm-name matching.
 *
 * The suggestion engine ranks candidates by matching a SOURCE API's firm-name
 * field against the canonical refs firm name. Example: an EQD person whose firm
 * column reads "J.P. Morgan" is a near-exact match to refs "JPMorgan", so that
 * person surfaces as a high-confidence suggestion for the JPMorgan workspace.
 *
 * This is the first cut of the deferred "suggestion criteria" — a transparent,
 * dependency-free score in [0,1]. It is intentionally swappable: a richer
 * matcher (alias tables, embeddings) can replace `firmMatchScore` without the
 * sources or engine changing.
 */

const LEGAL_SUFFIXES =
  /\b(l\.?l\.?c|l\.?l\.?p|l\.?p|inc|incorporated|plc|ltd|limited|corp|corporation|co|s\.?a|a\.?g|n\.?v|gmbh|s\.?a\.?r\.?l)\b/g;

/** Lowercase, strip punctuation + legal-entity suffixes, collapse whitespace. */
export function normalizeFirmName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[._,'’`/\\()\-]/g, " ")
    .replace(LEGAL_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Sørensen–Dice coefficient over character bigrams (spaces ignored). Robust to spacing/typos. */
export function diceCoefficient(a, b) {
  if (a === b) return a ? 1 : 0;
  const ta = a.replace(/\s+/g, "");
  const tb = b.replace(/\s+/g, "");
  if (ta.length < 2 || tb.length < 2) return ta === tb ? 1 : 0;

  const grams = new Map();
  for (let i = 0; i < ta.length - 1; i++) {
    const g = ta.slice(i, i + 2);
    grams.set(g, (grams.get(g) || 0) + 1);
  }
  let intersection = 0;
  let totalB = 0;
  for (let i = 0; i < tb.length - 1; i++) {
    const g = tb.slice(i, i + 2);
    totalB++;
    const have = grams.get(g) || 0;
    if (have > 0) {
      intersection++;
      grams.set(g, have - 1);
    }
  }
  const totalA = ta.length - 1;
  return (2 * intersection) / (totalA + totalB);
}

// Filler words common to many firm names — shared ONLY-generic overlap must not
// carry a match (else "Garda Capital Partners" ≈ "ROTH Capital Partners").
const GENERIC_TOKENS = new Set([
  "capital", "partners", "partner", "management", "asset", "assets", "advisors",
  "advisers", "group", "holdings", "global", "investment", "investments", "fund",
  "funds", "associates", "company", "international", "securities", "markets",
  "market", "trading", "financial", "the", "and", "co",
]);

function distinctiveTokens(normalized) {
  return normalized.split(" ").filter((t) => t && !GENERIC_TOKENS.has(t));
}

/** Jaccard overlap of word tokens — rewards shared distinctive words ("capital", "partners"). */
export function tokenJaccard(a, b) {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * Score how confidently two firm names refer to the same firm, in [0,1].
 * Exact (post-normalization) → 1; otherwise the stronger of char-bigram and
 * token similarity, so "JP Morgan" ≈ "JPMorgan" and "Citadel LLC" ≈ "Citadel".
 */
export function firmMatchScore(a, b) {
  const na = normalizeFirmName(a);
  const nb = normalizeFirmName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const raw = Math.max(diceCoefficient(na, nb), tokenJaccard(na, nb));
  if (raw >= 0.9) return raw; // near-identical strings (e.g. "JP Morgan" ≈ "JPMorgan")

  // In the fuzzy band, demand at least one shared DISTINCTIVE (non-filler) token.
  // Blocks matches resting only on "Capital/Partners/Securities" etc.
  const da = distinctiveTokens(na);
  const db = distinctiveTokens(nb);
  if (da.length && db.length && !da.some((t) => db.includes(t))) {
    return Math.min(raw, 0.45);
  }
  return raw;
}

/** Coarse confidence band for UI / promotion hints. */
export function matchTier(score) {
  if (score >= 0.92) return "high";
  if (score >= 0.6) return "probable";
  return "weak";
}

/**
 * Rank candidates against a query firm name, strongest first.
 * @param {string} query
 * @param {Array} candidates
 * @param {{ getName?: (c:any)=>string, threshold?: number }} [opts]
 * @returns {Array<{ candidate:any, score:number, tier:string }>}
 */
export function rankFirmMatches(query, candidates, { getName = (c) => c, threshold = 0.6 } = {}) {
  return candidates
    .map((candidate) => {
      const score = firmMatchScore(query, getName(candidate));
      return { candidate, score, tier: matchTier(score) };
    })
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
