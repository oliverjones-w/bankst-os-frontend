# Token Migration Log

Tracks the normalization of CSS custom properties in BankSt OS.
Branch: `refactor/token-schema`

---

## Dead token candidates

Defined in `base.css` but confirmed to have zero consumers across all CSS, HTML, and JS files.
Do not delete until schema normalization is complete.

| Token | Defined | Reason flagged |
|-------|---------|----------------|
| `--size-1-1` | base.css | Entire --size-* point scale unused |
| `--size-2-1` | base.css | Entire --size-* point scale unused |
| `--size-3-1` | base.css | Entire --size-* point scale unused |
| `--size-4-1` | base.css | Entire --size-* point scale unused |
| `--size-4-5` | base.css | Entire --size-* point scale unused |
| `--size-5-1` | base.css | Entire --size-* point scale unused |
| `--size-6-1` | base.css | Entire --size-* point scale unused |
| `--space-8` | base.css | No consumers; --space-6 is the current ceiling |
| `--font-text` | base.css | Duplicate of --font-interface value; never consumed |
| `--z-rail` | base.css | Z-index defined but never referenced via var() |
| `--shadow-md` | base.css | Defined in both themes; no consumers |
| `--shadow-lg` | base.css | Defined in both themes; no consumers |

---

## Completed normalizations

| Task | Commit | Description |
|------|--------|-------------|
| A1 | — | Audited accent token duplicates (inspect only) |
| A2 | 95d202c | Single canonical accent block in :root dark |
| A3 | 4e0acca | Single canonical accent block in [data-theme="light"] |
| A5 | 6cb69a2 | Documented font token authority (base.css fallback → fonts.css final) |

---

## Pending

- A7: Classify remaining same-file duplicates after accent cleanup
- Delete confirmed dead tokens (after schema normalization is complete)
- Normalize --background-secondary vs --background-secondary-alt (same dark value)
- Normalize --text-norm vs --text-normal (primitive + alias both consumed directly)
- Replace --navigation-current-item-background-color with --bg-nav-active
