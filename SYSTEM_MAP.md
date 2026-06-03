# Bay Street — System Map
_Last verified: 2026-04-24_

## Spatial Architecture

```
╔══════════════════════════════════╗    ╔══════════════════════════════════════════════════╗    ╔═══════════════════════╗
║    DELL  (Windows / C:\dev)      ║    ║         MAC  (dev-server · Tailscale)            ║    ║    PUBLIC EDGE        ║
╚══════════════════════════════════╝    ╚══════════════════════════════════════════════════╝    ╚═══════════════════════╝

  INGESTION                               INGESTION
  ─────────                               ─────────

  K:\Market Maps\                         FINRA.org ──[7am cron]──▶ finra_scraper   [LIVE]
    Hedge Fund Map (K).xlsm                                           :8001
    Interest Rates Map (K).xlsm
    │
    ▼  [Task Scheduler · hourly]
  C:\dev\tools\mapping_tools\scripts\
    sync_hf_map.py    (sheet: Master)     Encore ─────────────────▶ encore_scraper   [LIVE]
    sync_ir_map.py    (sheet: People                                  :5050
                       Moves)
    sync_and_push.ps1
    │  [task: MappingToolsSync]
    ├──▶ hf_map.db       [LIVE]
    ├──▶ ir_map.db       [LIVE]
    └──▶ bbg_results.db  [LIVE]

  ──────────────────────────────────────────────────────────────────────────────────────────

  TRANSPORT (hourly · SCP over Tailscale)
  Known failure mode: Tailscale re-auth timeout — Mac silently serves stale data

  hf_map.db       ──[SCP → macdev:]────▶  data/mapping/  (runtime copy)
  ir_map.db       ──[SCP → macdev:]────▶  hf_map.db / ir_map.db / bbg_results.db
  bbg_results.db  ──[SCP → macdev:]────▶

  ──────────────────────────────────────────────────────────────────────────────────────────

  FRONTEND / PROXY                        API LAYER
  ────────────────                        ─────────

  Caddyfile  (local dev proxy only)       ┌─ gateway  :7842  ──────────────────────────┐     Cloudflare Tunnel
    file_server (HTML/JS/CSS)             │  /api/core    →  core API  :8765           │  ──▶ bankst.co
    /api/*   ─────────────────────────────▶  /api/finra   →  finra     :8001           │     (user-reported;
    /system/* ────────────────────────────▶  /api/mapping →  mapping   :8003 ◀─SQLite  │      not in code)
                                          │  /api/encore  →  encore    :5050           │
  C:\dev\labs\unified_css  STALE MIRROR   └────────────────────────────────────────────┘
  (6 commits behind origin, local changes)
                                          bankst-os-frontend  :3000   [LIVE]
                                            authoritative frontend
                                            active dev · VS Code remote
                                            branch: theme-lab (pending merge → master)

                                          PostgreSQL  :5432  127.0.0.1
                                            bankst_os
                                            apps/hf_returns_app/models.py  (canonical)
                                            Alembic  0001 → 0009 + merge

  ──────────────────────────────────────────────────────────────────────────────────────────

  AUTOMATION (Dell)                       AUTOMATION (Mac)
  ─────────────────                       ────────────────

  Windows Task Scheduler                 */5 * * * *  health-check.sh
    task: MappingToolsSync               0  3 * * *  backup.sh  →  data/backups/
    every 1 hour                         0  7 * * *  finra_scraper  src/main.py
    runs: sync_and_push.ps1
    Excel → SQLite → SCP → macdev:
```

## Status Labels

| Component | Status | Notes |
|-----------|--------|-------|
| mapping_tools HF/IR SQLite + hourly Task Scheduler sync | **Live** | K: drive Excel → hf_map.db / ir_map.db → SCP → Mac |
| Dell → Mac SCP over Tailscale | **Live** | Target: `macdev:/Users/dev-server/workspace/data/mapping` |
| BBG FastAPI backend (:8003) + bbg_results.db | **Live** | |
| BBG frontend UI | **Live** | `bbg.firms` summary + `bbg.firm` detail; drag-drop CSV → `POST /api/bbg/upload` |
| finra_scraper :8001 | **Live** | 7am daily cron |
| encore_scraper :5050 | **Live** | |
| core API :8765 → PostgreSQL | **Live** | |
| bankst-os-frontend :3000 | **Live** | Authoritative; Mac is source of truth |
| gateway :7842 | **Live** | Confirmed Dell Caddyfile proxy target |
| Dell unified_css clone | **Stale mirror** | 6 commits behind origin, local changes present; Mac is authoritative |
| credit/commodities/equities/fx/ib/digital map APIs | **Planned** | Endpoints defined in Dell codebase; no corresponding DB files on Mac |
| Cloudflare Tunnel → bankst.co | **Unverified** | User-reported; no config found in codebase |

## Key Connections

- **Dell Caddyfile** is a local dev proxy only — serves static files locally, proxies `/api/*` to Mac gateway `:7842` over Tailscale. Not production.
- **Gateway** (`:7842`) is the single Mac-side entry point for all API traffic, including from Dell dev tooling.
- **Mapping SQLite files** are the only data that crosses hosts — all other services run entirely on the Mac.
- **BBG pipeline** (`src/bbg_pipeline.py`) handles drag-drop CSV uploads in-memory; no source CSV touches disk on the Mac.
- **Transport failure mode**: Tailscale re-auth timeouts cause SCP to fail silently — Mac mapping data ages without any Mac-side health signal.

## Open Issues

| Issue | Priority |
|-------|----------|
| No authentication on gateway — bankst.co is currently wide open | High |
| No freshness signal on Mac for mapping DB sync age | Medium |
