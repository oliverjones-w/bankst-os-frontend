# BankSt OS — Shell Project

## What this is

BankSt OS is a workspace-native intelligence and workflow shell for managing professional people records, firm records, mandate execution, candidate pipelines, interactions, reminders, documents, and activity history. It is designed as an IDE/OS-style workspace — not a traditional CRM or page-first app.

Full product vision: `vision.md`
PostgreSQL schema reference: `sql_schema.sql`
FINRA scraper service: `C:/dev/tools/finra_scraper`

---

## Files

| File | Purpose |
|------|---------|
| `index.html` | HTML shell only (~160 lines) — loads `js/app.js` as ES module |
| `base.css` | CSS custom properties, reset, app shell layout, theme system, workstation tokens |
| `css/fonts.css` | `@font-face` declarations for SF Pro Display + SF Mono (local OTF files) |
| `css/navigation.css` | Left rail, rail groups, brand section, nav/saved/recent lists, breadcrumbs, command trigger |
| `css/shell.css` | Topbar layout, icon buttons, topbar title group |
| `css/workspace.css` | Pane, tabbar, tabs, drag/drop, toolbar, view, snapshots, focus rings |
| `css/surfaces.css` | Right rail, context panel, context cards, floating cards, command palette, system modal, meta grid |
| `css/data-views.css` | All table/data views: people, firms, master search, FINRA monitor, detail views, skeleton loading, status dots |
| `vision.md` | Product brief and schema-aligned design spec |
| `sql_schema.sql` | PostgreSQL schema (read-only reference) |

### JS modules (`js/`)

| File | Purpose |
|------|---------|
| `js/app.js` | Boot, event delegation, keyboard shortcuts, Ctrl+scroll zoom intercept, Electron IPC |
| `js/workspace.js` | Workspace state, tab ops, view registry, toolbar, persistence, snapshots, `syncSidebarState` |
| `js/views.js` | All `registerWorkspaceView` calls — people, person, firm, firms, finra.monitor, master.search, trending |
| `js/widgets.js` | All `registerRightRailWidget` calls + `renderRightRail` |
| `js/shell.js` | Rail toggles, zen mode, workspace zoom (`zoomIn/Out/reset`, persisted to localStorage) |
| `js/cards.js` | Floating card system — drag, create, open, close |
| `js/palette.js` | Command palette — scoring, results, keyboard nav |
| `js/nav.js` | `openPersonTab`, `openFirmTab`, `openFirmCard`, `openFinraTab`, `runCommand` |
| `js/api.js` | `finraGet`, `bankstGet`, `recordView`, `loadTrending`, `loadFirmsIndex` |
| `js/drag.js` | Tab drag-and-drop, custom ghost image via `setDragImage` |
| `js/mock-data.js` | `entityData`, `contextData`, `commandData` |
| `js/config.js` | API base URLs, localStorage keys |
| `js/utils.js` | `escapeHtml`, `debounce`, `clamp`, `metaHTML` (auto-detects ID fields) |
| `js/theme.js` | `applyTheme`, `getTheme`, `toggleTheme` |
| `js/ui-prefs.js` | Rail group collapse state persistence |
| `js/actions.js` | `actions.execute()` dispatcher for Log/Note/Remind/Stage |

#### Dependency injection (breaking circular deps)
- `workspace.js` exports `setRailRenderer(fn)` — app.js wires `renderRightRail` after import
- `api.js` exports `setApiRailRenderer(fn)` — app.js wires `renderRightRail` for trending refresh
- `cards.js` exports `setNavHandlers({openPersonTab, openFirmTab})` — app.js wires nav functions

---

## Architecture built so far (this session)

### Shell
- `app-shell` grid: left rail / main-frame / right rail
- `main-frame`: topbar + workspace-row
- `workspace-row`: center workspace + right rail
- Overlay root: command palette, card layer, scrim
- Dark/light theme via `[data-theme]` + CSS custom properties
- Flash-of-wrong-theme prevention: inline `<head>` preload script sets theme before CSS loads

### Theme system
- Steel-blue accent: `--accent-h: 212`, `--accent-s: 42%`, `--accent-l: 62%`
- `--background-accent-faint`, `--border-accent` for active states
- `applyTheme()`, `getTheme()`, `toggleTheme()` — persisted to `localStorage`

### Command palette
- Triggered by `Ctrl+P` / `Cmd+P` or toolbar button
- Fuzzy `scoreMatch()` scoring
- Keyboard nav: ArrowUp/Down/Enter, Escape to close
- `pointermove` hover sync, `scrollIntoView` after render
- Delegated click on `#commandResults`

### Floating card system
- `openCards = new Map(cardId → DOM element)` — live elements, no re-render
- Drag via `pointer-capture` on `window` (not the handle element)
- `createCard()`, `openCard()`, `findExistingCard()`, `focusCard()`, `closeCard()`, `closeTopCard()`
- `z-index` stack managed via `nextZ` counter
- Card layer: `position: fixed; inset: 0; pointer-events: none; z-index: 1100`

### Workspace tab manager
- `workspaceState = { tabs[], activeTabId }`
- `openTab()`, `focusTab()`, `closeTab()` — each calls `saveWorkspaceState()` after mutation
- Tab dedup by `id`; close falls back to adjacent tab
- Tabs rendered into `#workspaceTabbar` with close buttons

### Center view registry
- `workspaceViews = []`, `registerWorkspaceView(view)`, `resolveWorkspaceView(tab)`
- View contract: `{ id, match(tab), toolbar(tab), render(tab), onActivate?(tab) }`
- `toolbar` is a **function** returning `{ left: [{id, label, active, disabled?}], right: [...] }`
- `onActivate` is async — fires after `innerHTML` is set, used for data fetching
- `fetchingTabs = new Set()` guards concurrent fetch loops
- Registered views: `people.table`, `person.detail`, `firm.detail`, `finra.dashboard`, `finra.changes`, `finra.individuals`

### Tab-local state
- Every tab carries `state: {}` — mode, sort, filters, columns, data, etc.
- `updateActiveTabState(patch)` merges patch, calls `renderWorkspace()` + `saveWorkspaceState()`
- Toolbar active state is **derived** from `tab.state.mode` on every render — never stored separately
- Mode switches via `handleToolbarAction(actionId)` → `updateActiveTabState({ mode })`

### Workspace persistence
- `localStorage` key: `bankst.workspace.v1`
- `serializeWorkspaceState()`, `saveWorkspaceState()`, `loadWorkspaceState()`, `restoreWorkspaceState()`
- `isValidRestoredTab()` validates before restore
- On boot: restore first, fall back to default people.table tab
- `window.resetWorkspaceState()` — dev reset helper

### Workspace snapshot manager
- `localStorage` key: `bankst.workspace.snapshots.v1`
- Shape: `{ id, name, createdAt, updatedAt, snapshot: { activeTabId, tabs[] } }`
- `createWorkspaceSnapshot(name)`, `deleteWorkspaceSnapshot(id)`, `applyWorkspaceSnapshot(item)`
- Left rail "Workspaces" section: list rendered by `renderWorkspaceSnapshots()`
- "Save Current" button uses `window.prompt()` for name input

### Right rail widget registry
- `rightRailWidgets = []`, `registerRightRailWidget(widget)`
- Widget contract: `{ id, order, when(ctx), render(ctx) }`
- `renderRightRail()` filters by `when(ctx)`, sorts by `order`, joins rendered HTML
- `getActiveContext()` returns typed context: `people.table`, `person`, `firm`, `finra`, `unknown`
- For `person`/`firm`: contextData is spread into ctx so widgets access `ctx.strategies`, `ctx.performance`, etc. directly

#### Registered widgets (person)
| Order | ID | Source |
|-------|----|--------|
| 10 | person-activity | `contextData.person[id].activity` |
| 20 | person-strategies | `ctx.strategies[]` (from contextData) |
| 35 | person-performance-preview | `ctx.performance[]` |
| 50 | person-notes | `contextData.person[id].notes` |
| 60 | person-reminders | `contextData.person[id].reminders` |
| 70 | person-related | `contextData.person[id].related` |

#### Registered widgets (firm)
| Order | ID | Source |
|-------|----|--------|
| 10 | firm-activity | `contextData.firm[id].activity` |
| 25 | firm-funds-preview | `ctx.funds[]` |
| 50 | firm-notes | contextData |
| 60 | firm-reminders | contextData |
| 70 | firm-related | contextData |

#### Registered widgets (people.table)
| Order | ID |
|-------|----|
| 10 | people-table-activity |
| 20 | people-table-saved-views |
| 30 | people-table-reminders |

#### Registered widgets (finra)
| Order | ID | Notes |
|-------|----|-------|
| 10 | finra-run-history | reads `ctx.tab.state.data.runs` — timestamp + checked count + change delta |
| 20 | finra-activity-feed | reads `ctx.tab.state.data.changes` — full chronologic status-change log with dots |

#### Shared widget (all entity views)
| Order | ID |
|-------|----|
| 100 | quick-actions | Log / Note / Remind / Stage buttons |

### Toolbar system
- `renderToolbarGroup(items)` → buttons with `data-toolbar-action`
- `renderWorkspaceToolbar(resolvedView, activeTab)` — supports function or object toolbar
- `handleToolbarAction(actionId)` — switch dispatch; mode switches call `updateActiveTabState`; FINRA refresh clears `tab.state.data`
- Toolbar click delegated through global `document` click handler

### FINRA integration
- API: `C:/dev/tools/finra_scraper` — FastAPI on port 8001, CORS open, no auth
- Config: `window.APP_CONFIG = { FINRA_API_BASE: "http://127.0.0.1:8001" }` in `<head>`
- Runtime: `const FINRA_API_BASE = window.APP_CONFIG?.FINRA_API_BASE || "http://127.0.0.1:8001"`
- All requests through `finraGet(path)` — validates `res.ok`, throws on error
- `finraChangesCache` — module-level, populated by `finra.changes` onActivate, read by right rail widget
- Three views: `finra.dashboard`, `finra.changes`, `finra.individuals`
- `finra.individuals` fetches 4 endpoints in parallel: individuals + summary + arrivals + departures
- Renders: stat row + leaderboard + full table (individuals); stat row + arrivals/departures + run history (dashboard)

### Mock data in place
- `entityData`: david-flowerdew, kate-li, liam-fox, bnp-paribas, millennium
- `contextData.person`: activity, notes, reminders, related, **strategies[]**, **performance[]**
- `contextData.firm`: activity, notes, reminders, related, **funds[]**

---

## CSS component inventory

`base.css`: custom properties, reset, app shell layout, scrollbars, workstation tokens (`--row-padding-v`, `--divider-subtle`, `--divider-anchor`, `--font-size-data`, `--font-size-label`), zoom tokens, shadow tokens, z-index hierarchy
`css/fonts.css`: SF Pro Display + SF Mono `@font-face` declarations, font stack overrides
`css/navigation.css`: left rail, rail groups, brand section, nav/saved/recent/stack lists, breadcrumbs (baseline-aligned path + leaf), command trigger
`css/shell.css`: topbar flex layout (identity / search / actions zones), icon buttons, title group
`css/workspace.css`: pane grid, tabbar, tabs, drag overlays, toolbar, `.view` (zoom target), snapshots, focus rings
`css/surfaces.css`: right rail (flat, same background as main pane, single divider separator), context panel, context cards (no box — section dividers only), floating cards, command palette, system modal, meta grid (flat label+value pairs, `--id` modifier for SF Mono values)
`css/data-views.css`: all table systems unified under workstation tokens; FINRA monitor (stat strip, leaderboard, individuals grid, changes grid, status dots); master search; detail views; skeleton loading; `.truncate` utility

---

## Design system

### Dual font grammar
- `--font-interface` (SF Pro Display): shell chrome, labels, headers, nav, breadcrumbs, section titles, `.finra-ssi-label`, `.finra-section-hdr`, `.finra-lb-name`, table header grids
- `--font-data` (SF Mono): all values, timestamps, counts, IDs, CRD numbers, FINRA stat values, `.finra-badge`, `.text-mono`, date cells, `meta-value--id`

### Workstation constants
```css
--row-padding-v: 8px          /* uniform vertical padding across all table rows */
--font-size-data: 11px        /* data cell font size */
--font-size-label: 9px        /* eyebrow / section header font size */
--font-weight-primary: 500    /* primary data weight */
--divider-subtle: 1px solid rgba(255,255,255,0.06)   /* row borders */
--divider-anchor: 1px solid rgba(255,255,255,0.2)    /* table header underlines */
--row-hover-bg: rgba(255,255,255,0.02)               /* flat hover, no box-shadow */
```

### Shadow tokens
```css
--shadow-floating   /* command palette, floating cards — 5-layer with specular */
--shadow-card       /* context cards */
--shadow-lifted     /* card being dragged */
```

### Z-index hierarchy
```
--z-rail: 10 | --z-topbar: 20 | --z-cards: 100 | --z-dragging: 200 | --z-modal: 300 | --z-palette: 400
```

### Selective zoom system
- `--zoom-level: 1` CSS variable on `:root`
- `zoom: var(--zoom-level)` applied to `.workspace-row` only — pane tabs + toolbar + view scale as one unit
- `zoom: 1` on `.topbar` and `.left-rail` — static chrome, never inherits zoom
- Keyboard: `Ctrl+=/−` zoom in/out 10%, `Ctrl+0` reset — `e.preventDefault()` stops browser zoom
- Mouse: `Ctrl+scroll` intercepted via `wheel` listener with `{ passive: false }` — routes to `zoomIn/Out`
- Nav items dim to `opacity: 0.55 + (level * 0.45)` when zoomed out — data is the focus
- Persisted to `localStorage` key `shell.zoomLevel`, restored in `initShell()`

### FINRA monitor (consolidated single-page view)
- Stat strip: flat horizontal row with `gap: 48px` and single bottom border — no card/box
- Arrivals / Departures: 2-column leaderboard with bar sparklines
- Recent Changes: `finra-changes-compact-grid` with `fit-content(90px)` status column
- Individuals: `finra-individuals-grid` with `2fr / 2.5fr / 100px / 1.2fr / 1.2fr / 100px` columns
- Status: dot + label system (`.status-indicator`, `.status-dot`, `.dot--active/inactive/null/error`) replacing pill badges
- Run history and scraper activity feed moved to right rail widgets (`finra-run-history`, `finra-activity-feed`)

### Context sidebar (right rail)
- Same background as main pane (`--background-primary`), single `inset 1px` left-edge separator
- Context cards: no rounded box/shadow — flat sections separated by `--divider-subtle` bottom stroke
- Section titles: 9px/700wt caps — same grammar as all other section headers in the app
- `hasContext: false` on any `registerWorkspaceView` collapses the rail to 0 via `.is-context-hidden` on `.workspace-row`
- `master.search` has `hasContext: false` — full width for reference data
- Empty state: faint "Signals" label + italic 11px copy (no card box)

### View-driven sidebar suppression
- `syncSidebarState(tab)` called in every `renderWorkspace()` cycle
- Checks `view.hasContext !== false` — toggles `is-context-hidden` class on `.workspace-row`
- Independent of user rail toggle (`data-right-rail`) — coexist without interference

---

## Next steps (priority order)

### 1. Real data layer
- Connect `people.table` to PostgreSQL backend (`/persons` endpoint)
- Link FINRA individuals rows to `person.detail` tabs (name match or CRD lookup)

### 2. Action modals
- `actions.execute()` is wired but modal UI not built
- Target tables: `interaction`, `person_notes`, `reminder`, `pipeline_item`
- Four actions: Log, Note, Remind, Stage
- Architecture: `openActionModal(action, { entityId, entityType })` → modal overlay in `.overlay-root`

### 3. Pipeline queue view
- Register `pipeline.queue` workspace view
- Maps to `public.pipeline_item` + `public.pipeline_stage`

### 4. Mandate detail view
- Register `mandate.detail` workspace view
- First-class workflow object per the schema

### 5. Navigation wiring
- Left rail: Mandates, Pipeline, Documents, Saved Searches, Graph are inert buttons
- Wire each to `openTab()` calls

### 6. Person timeline view
- `person.detail` toolbar has "Timeline" mode — placeholder
- Implement from `work_history` + `interaction` data

### 7. Graph view
- Placeholder in both `people.table` and entity detail views
- Relationship model defined in `vision.md` section 11

### 8. Real PostgreSQL backend
- Current entity/context data is all mock
- FINRA scraper already populates an SQLite mirror of part of this data

### 9. Hosting
- `FINRA_API_BASE` ready for subdomain swap
- `window.APP_CONFIG` in `<head>` is the only change needed for deployment

---

## Running locally

```bash
# Start FINRA API
cd C:/dev/tools/finra_scraper
uvicorn src.api:app --host 0.0.0.0 --port 8001

# Open shell — just open index.html in a browser
# (no build step, no bundler)
```

Dev reset (clears workspace persistence):
```js
// In browser console:
resetWorkspaceState()
```
