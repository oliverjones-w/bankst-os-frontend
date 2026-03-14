"""
BankSt OS — Main API
FastAPI on port 8002, connects to PostgreSQL via SSH tunnel on localhost:5432.
Start with: uvicorn api:app --port 8002 --reload
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
import psycopg2.extras

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
