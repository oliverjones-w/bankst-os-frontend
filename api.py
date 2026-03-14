"""
BankSt OS — Main API
FastAPI on port 8765, connects to PostgreSQL via SSH tunnel on localhost:5432.
Start with: python -m uvicorn api:app --port 8765 --reload
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
import psycopg2.extras
import json
import os

DB_URL = "postgresql://oliverjones:mac337@localhost:5432/bankst_os"

app = FastAPI(title="BankSt OS API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_conn():
    return psycopg2.connect(DB_URL)


# ── Master names (read-only reference, never touches PostgreSQL) ───────────────

_master_records: list = []

@app.on_event("startup")
async def load_master_names():
    global _master_records
    path = os.path.join(os.path.dirname(__file__), "master_names.json")
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            _master_records = json.load(f)
        print(f"[master] loaded {len(_master_records):,} records")
    except FileNotFoundError:
        print("[master] master_names.json not found — reference search unavailable")

_SEARCH_FIELDS = ["Name", "Firm", "Title", "Function", "Strategy", "Location"]

@app.get("/master/search")
def search_master(
    q: str = Query(default="", description="Space-separated terms matched across all fields"),
    firm: str = Query(default="", description="Exact firm filter"),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
):
    terms = [t.lower() for t in q.strip().split() if t]
    firm_lower = firm.strip().lower()

    def matches(r):
        text = " ".join(str(r.get(f) or "") for f in _SEARCH_FIELDS).lower()
        if firm_lower and firm_lower not in str(r.get("Firm") or "").lower():
            return False
        return all(t in text for t in terms)

    if not terms and not firm_lower:
        return {"total": 0, "results": []}

    matched = [r for r in _master_records if matches(r)]
    return {
        "total": len(matched),
        "results": matched[offset : offset + limit],
    }


# ── Firms ─────────────────────────────────────────────────────────────────────

@app.get("/firms")
def list_firms():
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT
            f.firm_id,
            f.name,
            f.firm_key,
            COUNT(*) FILTER (WHERE fa.alias_type = 'alias')     AS alias_count,
            COUNT(*) FILTER (WHERE fa.alias_type = 'platform')  AS platform_count,
            COUNT(*) FILTER (WHERE fa.alias_type = 'blacklist') AS blacklist_count
        FROM firm f
        LEFT JOIN firm_alias fa ON fa.firm_id = f.firm_id AND fa.active = true
        GROUP BY f.firm_id, f.name, f.firm_key
        ORDER BY f.name
    """)
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/firms/{firm_id}")
def get_firm(firm_id: str):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("SELECT firm_id, name, firm_key FROM firm WHERE firm_id = %s", (firm_id,))
    firm = cur.fetchone()
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found")

    cur.execute("""
        SELECT alias_text, alias_type
        FROM firm_alias
        WHERE firm_id = %s AND active = true
        ORDER BY alias_type, alias_text
    """, (firm_id,))
    aliases = cur.fetchall()
    conn.close()

    result = dict(firm)
    result["aliases"]   = [a["alias_text"] for a in aliases if a["alias_type"] == "alias"]
    result["platforms"] = [a["alias_text"] for a in aliases if a["alias_type"] == "platform"]
    result["blacklist"] = [a["alias_text"] for a in aliases if a["alias_type"] == "blacklist"]
    return result


# ── Job Functions ─────────────────────────────────────────────────────────────

@app.get("/job-functions")
def list_job_functions():
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT function_id, name, risk_taker, hierarchy FROM job_function ORDER BY hierarchy")
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]
