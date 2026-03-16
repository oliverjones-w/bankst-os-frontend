# BankSt OS — Shell Project

## What this is

BankSt OS is a workspace-native intelligence and workflow shell for managing professional people records, firm records, mandate execution, candidate pipelines, interactions, reminders, documents, and activity history. It is designed as an IDE/OS-style workspace — not a traditional CRM or page-first app.

Full product vision: `vision.md`
PostgreSQL schema reference: `sql_schema.sql`
FINRA scraper service: `C:/dev/tools/finra_scraper`
Mapping API service: `C:/dev/tools/mapping_api` (port 8003)

---

## Files

| File | Purpose |
|------|---------|
| `index.html` | HTML shell — loads `js/app.js` as ES module; `theme-overrides.css` loaded last |
| `base.css` | CSS custom properties, reset, app shell layout, theme system, workstation tokens, domain tokens, category tokens |
| `TOKEN_MIGRATION.md` | Token migration scoreboard and alias deprecation log |
| `theme-lab.html` | Standalone theme editor — open directly in browser |
| `css/fonts.css` | `@font-face` declarations for SF Pro Display + SF Mono (local OTF files) |
| `css/navigation.css` | Left rail, rail groups, brand section, nav/saved/recent lists, breadcrumbs, command trigger |
| `css/shell.css` | Topbar layout, icon buttons, topbar title group |
| `css/workspace.css` | Pane, tabbar, tabs, drag/drop, toolbar, view, snapshots, focus rings |
| `css/surfaces.css` | Right rail, context panel, context cards, floating cards, command palette, system modal, meta grid |
| `css/data-views.css` | All table/data views: people, firms, master search, FINRA monitor, detail views, skeleton loading, status dots |
| `css/theme-overrides.css` | Empty cascade layer — loaded last, populated at runtime by Theme Lab |
| `css/theme-lab.css` | Theme Lab panel layout, token controls, font controls, preview component styles |
| `vision.md` | Product brief and schema-aligned design spec |
| `sql_schema.sql` | PostgreSQL schema (read-only reference) |

### JS modules (`js/`)

| File | Purpose |
|------|---------|
| `js/app.js` | Boot, event delegation, keyboard shortcuts, Ctrl+scroll zoom intercept, Electron IPC, mapping row/import click handlers |
| `js/workspace.js` | Workspace state, tab ops, view registry, toolbar, persistence, snapshots, `syncSidebarState` |
| `js/views.js` | All `registerWorkspaceView` calls — people, person, firm, firms, finra.monitor, master.search, trending, hf.table, ir.table |
| `js/widgets.js` | All `registerRightRailWidget` calls + `renderRightRail` |
| `js/shell.js` | Rail toggles, zen mode, workspace zoom (`zoomIn/Out/reset`, persisted to localStorage) |
| `js/cards.js` | Floating card system — drag, create, open, close |
| `js/palette.js` | Command palette — scoring, results, keyboard nav |
| `js/nav.js` | `openPersonTab`, `openFirmTab`, `openFirmCard`, `openFinraTab`, `runCommand` |
| `js/api.js` | `finraGet`, `bankstGet`, `mappingGet`, `recordView`, `loadTrending`, `loadFirmsIndex` |
| `js/drag.js` | Tab drag-and-drop, custom ghost image via `setDragImage` |
| `js/mock-data.js` | `entityData`, `contextData`, `commandData` |
| `js/config.js` | API base URLs (`FINRA_API_BASE`, `BANKST_API_BASE`, `MAPPING_API_BASE`), localStorage keys |
| `js/utils.js` | `escapeHtml`, `debounce`, `clamp`, `metaHTML` (auto-detects ID fields) |
| `js/theme.js` | `applyTheme`, `getTheme`, `toggleTheme` |
| `js/theme-lab.js` | Theme Lab — token registry, live override engine, font presets, persist/reset/export |
| `js/ui-prefs.js` | Rail group collapse state persistence |
| `js/actions.js` | `actions.execute()` dispatcher for Log/Note/Remind/Stage/master-import |

#### Dependency injection (breaking circular deps)
- `workspace.js` exports `setRailRenderer(fn)` — app.js wires `renderRightRail` after import
- `api.js` exports `setApiRailRenderer(fn)` — app.js wires `renderRightRail` for trending refresh
- `cards.js` exports `setNavHandlers({openPersonTab, openFirmTab})` — app.js wires nav functions

---

## Architecture

### Shell
- `app-shell` grid: named areas `"topbar topbar" / "rail main"` — topbar spans full width as direct grid child
- `workspace-shell`: center workspace + right rail (replaces old `workspace-row`)
- Overlay root: command palette, card layer, scrim
- Dark/light theme via `[data-theme]` + CSS custom properties
- Flash-of-wrong-theme prevention: inline `<head>` preload script sets theme before CSS loads

### Theme system
- Steel-blue accent: `--accent-h: 212`, `--accent-s: 42%`, `--accent-l: 62%`
- `--interactive-accent: #0073ff` (dark); light theme: `hsl(212, 52%, 38%)`
- `--background-accent-faint`, `--border-accent` for active states
- `applyTheme()`, `getTheme()`, `toggleTheme()` — persisted to `localStorage`

### Token architecture (completed — tagged `token-schema-v1`)
Four-layer hierarchy:
```
primitives (#0073ff, #f0f0f0…)
  ↓
semantic (--text-normal, --interactive-accent, --background-primary…)
  ↓
domain (--nav-item-*, --button-primary-*, --control-surface-*, --shell-topbar-*)
  ↓
components (consume domain tokens only)
```
- `npm run audit:tokens` — full token graph report
- `npm run check:no-legacy-tokens` — CI guardrail, exits 1 if `--text-norm` or `--primary` found in consumers

#### Navigation domain tokens (base.css)
```css
--nav-item-padding-x / --nav-item-active-border-w
--nav-item-bg / --nav-item-bg-hover / --nav-item-bg-active
--nav-item-text / --nav-item-text-hover / --nav-item-text-active
--nav-item-border-active
--nav-icon-color / --nav-icon-color-hover / --nav-icon-color-active
```

#### Control domain tokens (base.css)
```css
--control-surface-bg / --control-surface-border / --control-surface-border-hover
--button-primary-bg / --button-primary-bg-hover / --button-primary-bg-active / --button-primary-text
```

#### Category semantic tokens (base.css)
```css
--category-function / --category-function-bg / --category-function-border   /* #ff8a3d */
--category-strategy / --category-strategy-bg / --category-strategy-border   /* #8b7dff */
--category-product  / --category-product-bg  / --category-product-border    /* #21b3ff */
```

#### Deprecated tokens removed
`--text-norm`, `--primary`, `--size-1-1` through `--size-6-1`, `--space-8`, `--font-text`, `--z-rail`, `--shadow-md`, `--shadow-lg`

#### Remaining legacy aliases (live consumers — not yet removed)
`--accent-color`, `--bg-deep`, `--bg-stage`, `--bg-elevated`, `--font-monospace`

### Theme Lab (`theme-lab.html`)
Standalone page — open directly in browser, no dev server needed.
- **Left sidebar**: token groups with live text inputs + color swatches; font groups with preset dropdowns + free-text + live preview sample
- **Right preview**: topbar, nav rail, buttons, surfaces, type scale (interface + data/mono), category tags, accent states
- **Override engine**: all changes injected via `#themeLabOverrides` `<style>` tag — no file writes
- **Persistence**: `localStorage` key `bankst.themeLab.overrides` — survives reload
- **Export**: "Copy JSON" copies override set to clipboard for sharing presets
- **Reset**: clears all overrides + reloads
- Font presets: SF Pro, Inter, System UI, Geist, DM Sans, IBM Plex, JetBrains Mono, Fira Code, Cascadia Code, Menlo + Custom

### Command palette
- Triggered by `Ctrl+P` / `Cmd+P` or toolbar button
- Fuzzy `scoreMatch()` scoring
- Keyboard nav: ArrowUp/Down/Enter, Escape to close
- `pointermove` hover sync, `scrollIntoView` after render

### Floating card system
- `openCards = new Map(cardId → DOM element)` — live elements, no re-render
- Drag via `pointer-capture` on `window`
- `createCard()`, `openCard()`, `focusCard()`, `closeCard()`, `closeTopCard()`
- `z-index` stack managed via `nextZ` counter

### Workspace tab manager
- `workspaceState = { tabs[], activeTabId }`
- `openTab()`, `focusTab()`, `closeTab()` — each calls `saveWorkspaceState()` after mutation
- Tab dedup by `id`; close falls back to adjacent tab

### Center view registry
- `workspaceViews = []`, `registerWorkspaceView(view)`, `resolveWorkspaceView(tab)`
- View contract: `{ id, match(tab), toolbar(tab), render(tab), onActivate?(tab) }`
- `toolbar` is a **function** returning `{ left: [{id, label, active, disabled?}], right: [...] }`
- `onActivate` is async — fires after `innerHTML` is set, used for data fetching
- `fetchingTabs = new Set()` guards concurrent fetch loops
- Registered views: `people.table`, `person.detail`, `firm.detail`, `finra.dashboard`, `finra.changes`, `finra.individuals`, `master.search`, `hf.table`, `ir.table`

### Mapping API views (hf.table / ir.table)
- API: local FastAPI on port 8003
- Config: `MAPPING_API_BASE` in `window.APP_CONFIG` + `js/config.js`
- `mappingGet(path)` fetch helper in `api.js`
- Both views: searchable table, row selection → async history fetch into right rail
- Import action: `data-master-import` → `actions.execute("master-import", { id, source, name })`
- Context types registered in `workspace.js` `getActiveContext()`

### Tab-local state
- Every tab carries `state: {}` — mode, sort, filters, columns, data, etc.
- `updateActiveTabState(patch)` merges patch, calls `renderWorkspace()` + `saveWorkspaceState()`
- Toolbar active state **derived** from `tab.state.mode` — never stored separately

### Workspace persistence
- `localStorage` key: `bankst.workspace.v1`
- On boot: restore first, fall back to default people.table tab
- `window.resetWorkspaceState()` — dev reset helper

### Workspace snapshot manager
- `localStorage` key: `bankst.workspace.snapshots.v1`
- Shape: `{ id, name, createdAt, updatedAt, snapshot: { activeTabId, tabs[] } }`
- Left rail "Workspaces" section rendered by `renderWorkspaceSnapshots()`

### Right rail widget registry
- Widget contract: `{ id, order, when(ctx), render(ctx) }`
- `getActiveContext()` types: `people.table`, `person`, `firm`, `finra`, `hf.table`, `ir.table`, `unknown`

#### Registered widgets (person)
| Order | ID | Source |
|-------|----|--------|
| 10 | person-activity | `contextData.person[id].activity` |
| 20 | person-strategies | `ctx.strategies[]` |
| 35 | person-performance-preview | `ctx.performance[]` |
| 50 | person-notes | contextData |
| 60 | person-reminders | contextData |
| 70 | person-related | contextData |

#### Registered widgets (firm)
| Order | ID | Source |
|-------|----|--------|
| 10 | firm-activity | `contextData.firm[id].activity` |
| 25 | firm-funds-preview | `ctx.funds[]` |
| 50 | firm-notes | contextData |
| 60 | firm-reminders | contextData |
| 70 | firm-related | contextData |

#### Registered widgets (finra)
| Order | ID | Notes |
|-------|----|-------|
| 10 | finra-run-history | `ctx.tab.state.data.runs` |
| 20 | finra-activity-feed | `ctx.tab.state.data.changes` |

#### Shared widget (all entity views)
| Order | ID |
|-------|----|
| 100 | quick-actions | Log / Note / Remind / Stage |

### FINRA integration
- API: `C:/dev/tools/finra_scraper` — FastAPI on port 8001, CORS open, no auth
- Config: `window.APP_CONFIG.FINRA_API_BASE`
- Three views: `finra.dashboard`, `finra.changes`, `finra.individuals`

### Mock data in place
- `entityData`: david-flowerdew, kate-li, liam-fox, bnp-paribas, millennium
- `contextData.person`: activity, notes, reminders, related, strategies[], performance[]
- `contextData.firm`: activity, notes, reminders, related, funds[]

---

## CSS component inventory

`base.css`: primitives, semantic tokens, domain tokens (shell/nav/control/button/category), reset, app shell grid layout, scrollbars, workstation constants, z-index hierarchy, shadows, transitions, typography scale
`css/fonts.css`: SF Pro Display + SF Mono `@font-face` declarations (final font authority — overrides base.css fallbacks)
`css/navigation.css`: left rail, rail groups, brand section, nav/saved/recent/stack lists, breadcrumbs, command trigger, collapse button — all consuming nav/control domain tokens
`css/shell.css`: topbar flex layout (identity / search / actions zones), icon buttons, title group — consuming shell domain tokens
`css/workspace.css`: pane grid, tabbar, tabs, drag overlays, toolbar, `.view` (zoom target), snapshots, focus rings
`css/surfaces.css`: right rail, context panel, context cards, floating cards, command palette, system modal, meta grid
`css/data-views.css`: all table systems; FINRA monitor; master search; detail views; skeleton loading; `.truncate` utility
`css/theme-overrides.css`: intentionally empty — cascade override layer, loaded last in index.html
`css/theme-lab.css`: Theme Lab shell layout, sidebar, token controls, font controls, preview components, category tag styles

---

## Design system

### Dual font grammar
- `--font-interface` (SF Pro Display): shell chrome, labels, headers, nav, breadcrumbs, section titles
- `--font-data` (SF Mono): all values, timestamps, counts, IDs, CRD numbers, FINRA stat values, `.text-mono`, date cells

### Workstation constants
```css
--row-padding-v: 8px
--font-size-data: 11px
--font-size-label: 9px
--font-weight-primary: 500
--divider-subtle: 1px solid rgba(255,255,255,0.06)
--divider-anchor: 1px solid rgba(255,255,255,0.2)
--row-hover-bg: rgba(255,255,255,0.02)
```

### Shadow tokens
```css
--shadow-xs / --shadow-sm     /* utility shadows */
--shadow-floating             /* command palette, floating cards — 5-layer with specular */
--shadow-card                 /* context cards */
--shadow-lifted               /* card being dragged */
```

### Z-index hierarchy
```
--z-topbar: 20 | --z-cards: 100 | --z-dragging: 200 | --z-modal: 300 | --z-palette: 400
```

### Selective zoom system
- `--zoom-level: 1` on `:root`
- `zoom: var(--zoom-level)` on `.workspace-shell` only
- `zoom: 1` on `.topbar` and `.left-rail` — never inherits zoom
- Keyboard: `Ctrl+=/−` zoom 10%, `Ctrl+0` reset; Mouse: `Ctrl+scroll` intercepted
- Persisted to `localStorage` key `shell.zoomLevel`

### Context sidebar suppression
- `hasContext: false` on `registerWorkspaceView` collapses rail via `.is-context-hidden`
- `master.search`, `hf.table`, `ir.table` have `hasContext: false` — full width

---

## Git state

- **Main branch**: `master`
- **Active branch**: `theme-lab`
- **Tag**: `token-schema-v1` — design system baseline (all token migration complete)
- **Pending merge**: `theme-lab` → `master` when Theme Lab work is stable

---

## Next steps (priority order)

### 1. Theme Lab — complete and merge
- Currently on `theme-lab` branch
- Finish any remaining preview sections, then merge to master

### 2. Action modals
- `actions.execute()` is wired but modal UI not built
- Target tables: `interaction`, `person_notes`, `reminder`, `pipeline_item`
- Four actions: Log, Note, Remind, Stage
- Architecture: `openActionModal(action, { entityId, entityType })` → modal overlay in `.overlay-root`

### 3. Real data layer
- Connect `people.table` to PostgreSQL backend (`/persons` endpoint)
- Link FINRA individuals rows to `person.detail` tabs (CRD lookup)

### 4. Pipeline queue view
- Register `pipeline.queue` workspace view
- Maps to `public.pipeline_item` + `public.pipeline_stage`

### 5. Mandate detail view
- Register `mandate.detail` workspace view

### 6. Navigation wiring
- Left rail: Mandates, Pipeline, Documents, Saved Searches, Graph are inert buttons

### 7. Token alias cleanup (optional hygiene)
- Branch: `refactor/token-alias-cleanup` (not yet created)
- Targets: `--accent-color`, `--bg-deep`, `--bg-stage`, `--bg-elevated`
- Note: `--bg-*` tokens encode surface hierarchy — replace with `--surface-sidebar/page/elevated` before removing
- `--font-monospace`: 9 consumers, probably keep permanently

---

## Running locally

```bash
# Start FINRA API
cd C:/dev/tools/finra_scraper
uvicorn src.api:app --host 0.0.0.0 --port 8001

# Start Mapping API
cd C:/dev/tools/mapping_api
uvicorn src.api:app --host 0.0.0.0 --port 8003

# Open shell — just open index.html in a browser (no build step)
# Open theme lab — open theme-lab.html in a browser
```

Dev reset (clears workspace persistence):
```js
// In browser console:
resetWorkspaceState()
```
