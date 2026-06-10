/**
 * Firm Workspace — overlay persistence transports.
 *
 * A transport is `{ load(firmKey) → state|null, save(firmKey, state) → void }`.
 * The overlay store is backend-agnostic; swapping transports changes nothing in
 * the store or component. Postgres is deprecated — NONE of these touch it.
 */

/** Per-browser store. The independent V1 solution: zero backend, works offline. */
export function localStorageTransport(prefix = "firm-workspace") {
  const k = (firmKey) => `${prefix}:${firmKey}`;
  return {
    async load(firmKey) {
      try {
        return JSON.parse(localStorage.getItem(k(firmKey)) || "null");
      } catch {
        return null;
      }
    },
    async save(firmKey, state) {
      try {
        localStorage.setItem(k(firmKey), JSON.stringify(state));
      } catch (e) {
        console.warn("[overlay] localStorage save failed:", e);
      }
    },
  };
}

/**
 * Server transport against an independent overlay endpoint (built later, NOT on
 * Postgres). Expects `get(path)`/`put(path, body)` helpers. A 404 on load means
 * "no overlay yet" → null (fresh canvas), not an error.
 *
 * @param {{ get: Function, put: Function, base?: string }} opts
 */
export function serverTransport({ get, put, base = "" }) {
  const path = (firmKey) => `${base}/firm-workspace/${encodeURIComponent(firmKey)}/overlay`;
  return {
    async load(firmKey) {
      try {
        return await get(path(firmKey));
      } catch (e) {
        if (e?.status === 404) return null;
        throw e;
      }
    },
    async save(firmKey, state) {
      return put(path(firmKey), state);
    },
  };
}
