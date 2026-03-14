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
| `index.html` | Entire application — all HTML, JS in a single IIFE `<script>` |
| `base.css` | CSS custom properties, reset, app shell layout, theme system |
| `components.css` | All component styles — cards, tables, toolbar, rail, badges, FINRA |
| `vision.md` | Product brief and schema-aligned design spec |
| `sql_schema.sql` | PostgreSQL schema (read-only reference) |
| `session.txt` | Current Claude Code session ID for resuming |

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
| 10 | finra-recent-moves | reads `finraChangesCache` |
| 20 | finra-context-summary | reads `ctx.tab.state.summary` |

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

`base.css`: custom properties, reset, app shell layout, scrollbars, responsive breakpoints
`components.css`: left rail, topbar, command palette, floating cards, tabbar, toolbar, workspace tables, detail view, right rail, context cards, feed, stack list, meta grid, tag cloud, pills, meta badges, PnL grid, action grid, placeholder, detail view shell, workspace snapshot row, FINRA badges, FINRA grids, stat row, leaderboard grid

---

## Next steps (priority order)

### 1. Real data layer
- Connect `people.table` view to FINRA individuals data (replace hardcoded 3-row mock)
- Or build a separate `people.table` view that pulls from the PostgreSQL backend when available
- The `finra.individuals` tab already shows real data — consider linking person rows to `person.detail` tabs

### 2. Action modals
- `handleQuickAction(action, entityId, entityType)` is stubbed — needs modal UI
- Target tables: `interaction`, `person_notes`, `reminder`, `pipeline_item`
- Four actions: Log, Note, Remind, Stage
- Architecture: `openActionModal(action, { entityId, entityType })` → modal overlay in `.overlay-root`

### 3. Firms table view
- Register `firms.table` workspace view
- Left rail "Firms" nav item should open it
- Same pattern as `people.table`

### 4. Pipeline queue view
- Register `pipeline.queue` workspace view
- Maps to `public.pipeline_item` + `public.pipeline_stage`

### 5. Mandate detail view
- Register `mandate.detail` workspace view
- First-class workflow object per the schema

### 6. Navigation wiring
- Left rail nav items (People, Firms, Mandates, Pipeline, Documents, Saved Searches, Graph) are currently inert buttons
- Wire each to `openTab()` calls

### 7. Person timeline view
- `person.detail` toolbar has "Timeline" mode — currently shows placeholder
- Implement from `work_history` + `interaction` data

### 8. Graph view
- Both `people.table` and entity detail views have Graph toolbar mode — placeholder
- Relationship model well-defined in `vision.md` section 11

### 9. Real PostgreSQL backend
- Current entity/context data is all mock
- The schema in `sql_schema.sql` is the target
- FINRA scraper already populates an SQLite mirror of part of this data

### 10. Cloudflare / hosting
- `FINRA_API_BASE` is ready for subdomain swap
- `window.APP_CONFIG` in `<head>` is the only thing that needs to change for deployment

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
