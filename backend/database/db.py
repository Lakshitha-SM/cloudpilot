"""
backend/database/db.py
SQLite database layer for CloudPilot.
All tables created automatically on first run.
Includes APRDA decision logging table added for APRDA integration.
"""
import sqlite3, os, json, uuid, time
from datetime import datetime, timezone
from contextlib import contextmanager

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DB_PATH = os.path.join(BASE, "database", "cloudpilot.db")

def _ts():
    return datetime.now(timezone.utc).isoformat()

@contextmanager
def _conn():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    con = sqlite3.connect(DB_PATH, check_same_thread=False)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()

SCHEMA = """
CREATE TABLE IF NOT EXISTS simulation_runs (
    run_id TEXT PRIMARY KEY,
    started_at TEXT,
    scenario TEXT,
    status TEXT DEFAULT 'running'
);
CREATE TABLE IF NOT EXISTS workload_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    timestamp TEXT,
    vm_id TEXT,
    current_cpu REAL,
    current_memory REAL,
    current_io REAL,
    current_network REAL,
    request_rate REAL,
    active_users INTEGER,
    workload_type TEXT,
    workload_intensity TEXT
);
CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    timestamp TEXT,
    input_cpu REAL,
    input_memory REAL,
    predicted_cpu REAL,
    predicted_memory REAL,
    prediction_horizon TEXT DEFAULT '~10 min',
    model_name TEXT DEFAULT 'RandomForestRegressor'
);
CREATE TABLE IF NOT EXISTS rag_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    timestamp TEXT,
    query_cpu REAL,
    query_memory REAL,
    retrieved_case_id TEXT,
    similarity_score REAL,
    historical_vm TEXT,
    historical_result TEXT
);
CREATE TABLE IF NOT EXISTS allocation_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    timestamp TEXT,
    selected_vm TEXT,
    requested_cpu REAL,
    requested_memory REAL,
    requested_io REAL,
    available_cpu REAL,
    available_memory REAL,
    status TEXT,
    execution_latency_ms REAL,
    strategy TEXT DEFAULT 'CloudPilot',
    mode TEXT DEFAULT 'sim',
    reason TEXT
);
CREATE TABLE IF NOT EXISTS agent_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    timestamp TEXT,
    agent_name TEXT,
    event_type TEXT,
    data TEXT
);
CREATE TABLE IF NOT EXISTS performance_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    timestamp TEXT,
    strategy TEXT,
    response_time_ms REAL,
    decision_latency_ms REAL,
    sla_violation INTEGER DEFAULT 0,
    cpu_utilization REAL,
    allocation_success INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS aprda_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    timestamp TEXT,
    status TEXT,
    workload_class TEXT,
    sla_priority TEXT,
    selected_resource TEXT,
    decision_score REAL,
    predicted_cpu REAL,
    candidates_evaluated INTEGER,
    weights_used TEXT,
    ranked_resources TEXT,
    reason TEXT,
    aprda_latency_ms REAL,
    mode TEXT DEFAULT 'sim'
);
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password_hash TEXT,
    credits INTEGER DEFAULT 0,
    daily_streak INTEGER DEFAULT 0,
    last_checkin TEXT
);
CREATE TABLE IF NOT EXISTS credits_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    amount INTEGER,
    reason TEXT,
    timestamp TEXT
);
CREATE TABLE IF NOT EXISTS cloud_labs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    lab_id TEXT,
    status TEXT,
    timestamp TEXT
);
"""

def init_db():
    with _conn() as con:
        con.executescript(SCHEMA)
        # Backward-compat column additions
        for alter_sql in [
            "ALTER TABLE allocation_history ADD COLUMN mode TEXT DEFAULT 'sim'",
            "ALTER TABLE allocation_history ADD COLUMN reason TEXT",
        ]:
            try:
                con.execute(alter_sql)
            except Exception:
                pass
    return DB_PATH

def new_run(scenario: str) -> str:
    run_id = str(uuid.uuid4())[:8]
    with _conn() as con:
        con.execute("INSERT INTO simulation_runs VALUES (?,?,?,?)",
                    (run_id, _ts(), scenario, "running"))
    return run_id

def close_run(run_id: str):
    with _conn() as con:
        con.execute("UPDATE simulation_runs SET status='completed' WHERE run_id=?", (run_id,))

def log_workload(run_id, data: dict):
    with _conn() as con:
        con.execute("""INSERT INTO workload_history
            (run_id,timestamp,vm_id,current_cpu,current_memory,current_io,
             current_network,request_rate,active_users,workload_type,workload_intensity)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (run_id, _ts(), data.get("vm_id","SIM"),
             data.get("current_cpu",0), data.get("current_memory",0),
             data.get("current_io",0), data.get("current_network",0),
             data.get("request_rate",0), data.get("active_users",0),
             data.get("workload_type","Web Traffic"), data.get("workload_intensity","Normal")))

def log_prediction(run_id, data: dict):
    with _conn() as con:
        con.execute("""INSERT INTO predictions
            (run_id,timestamp,input_cpu,input_memory,predicted_cpu,predicted_memory)
            VALUES (?,?,?,?,?,?)""",
            (run_id, _ts(), data.get("input_cpu",0), data.get("input_memory",0),
             data.get("predicted_cpu",0), data.get("predicted_memory",0)))

def log_rag(run_id, data: dict):
    with _conn() as con:
        for case in data.get("retrieved_cases", []):
            con.execute("""INSERT INTO rag_cases
                (run_id,timestamp,query_cpu,query_memory,retrieved_case_id,
                 similarity_score,historical_vm,historical_result)
                VALUES (?,?,?,?,?,?,?,?)""",
                (run_id, _ts(), data.get("query_cpu",0), data.get("query_memory",0),
                 case.get("case_id",""), case.get("similarity",0),
                 case.get("vm",""), case.get("result","SUCCESS")))

def log_allocation(run_id, data: dict):
    with _conn() as con:
        con.execute("""INSERT INTO allocation_history
            (run_id,timestamp,selected_vm,requested_cpu,requested_memory,requested_io,
             available_cpu,available_memory,status,execution_latency_ms,strategy,mode,reason)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (run_id, _ts(), data.get("selected_vm") or "", data.get("requested_cpu",0),
             data.get("requested_memory",0), data.get("requested_io",0),
             data.get("available_cpu",0), data.get("available_memory",0),
             data.get("status","SUCCESS"), data.get("execution_latency_ms",0),
             data.get("strategy","CloudPilot"), data.get("mode","sim"),
             data.get("reason","")))

def log_agent_event(run_id, agent: str, event_type: str, data: dict):
    with _conn() as con:
        con.execute("INSERT INTO agent_events (run_id,timestamp,agent_name,event_type,data) VALUES (?,?,?,?,?)",
                    (run_id, _ts(), agent, event_type, json.dumps(data, default=str)))

def log_performance(run_id, data: dict):
    with _conn() as con:
        con.execute("""INSERT INTO performance_metrics
            (run_id,timestamp,strategy,response_time_ms,decision_latency_ms,
             sla_violation,cpu_utilization,allocation_success)
            VALUES (?,?,?,?,?,?,?,?)""",
            (run_id, _ts(), data.get("strategy","CloudPilot"),
             data.get("response_time_ms",0), data.get("decision_latency_ms",0),
             int(data.get("sla_violation",False)), data.get("cpu_utilization",0),
             int(data.get("allocation_success",True))))

def log_aprda_decision(run_id: str, aprda_result: dict, workload: dict):
    """
    Persist an APRDA decision to the aprda_decisions table.
    Called by the pipeline after every APRDA stage execution.

    Stores:
      timestamp, status, workload_class, sla_priority, selected_resource,
      decision_score, predicted_cpu, candidates_evaluated, weights_used (JSON),
      ranked_resources (JSON), reason, aprda_latency_ms, mode.
    """
    if not aprda_result:
        return
    ranked = aprda_result.get("ranked_resources", [])
    weights = aprda_result.get("weights_used", {})
    with _conn() as con:
        con.execute("""INSERT INTO aprda_decisions
            (run_id, timestamp, status, workload_class, sla_priority,
             selected_resource, decision_score, predicted_cpu,
             candidates_evaluated, weights_used, ranked_resources,
             reason, aprda_latency_ms, mode)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                run_id,
                _ts(),
                aprda_result.get("status", "UNKNOWN"),
                aprda_result.get("workload_class"),
                aprda_result.get("sla_priority"),
                aprda_result.get("selected_resource"),
                aprda_result.get("decision_score"),
                (aprda_result.get("prediction_inputs") or {}).get("predicted_cpu"),
                aprda_result.get("candidates_evaluated", 0),
                json.dumps(weights, default=str),
                json.dumps(ranked, default=str),
                aprda_result.get("reason", ""),
                aprda_result.get("aprda_latency_ms"),
                workload.get("mode", "sim"),
            )
        )

def get_run_summary(run_id: str) -> dict:
    with _conn() as con:
        allocs = con.execute(
            "SELECT COUNT(*) as cnt, SUM(CASE WHEN status='SUCCESS' THEN 1 ELSE 0 END) as ok "
            "FROM allocation_history WHERE run_id=?", (run_id,)).fetchone()
        wl = con.execute(
            "SELECT COUNT(*) as cnt FROM workload_history WHERE run_id=?", (run_id,)).fetchone()
        perf = con.execute(
            "SELECT AVG(response_time_ms) as avg_rt, AVG(decision_latency_ms) as avg_dl, "
            "SUM(sla_violation) as sla_v FROM performance_metrics WHERE run_id=?", (run_id,)).fetchone()
    return {
        "run_id": run_id,
        "allocations": dict(allocs),
        "workload_records": dict(wl)["cnt"],
        "performance": dict(perf),
    }

def get_recent_allocations(limit: int = 20) -> list:
    with _conn() as con:
        rows = con.execute(
            "SELECT * FROM allocation_history ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [dict(r) for r in rows]

def get_recent_aprda_decisions(limit: int = 20) -> list:
    """Return the most recent APRDA decisions for monitoring / debug."""
    with _conn() as con:
        try:
            rows = con.execute(
                "SELECT * FROM aprda_decisions ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
            return [dict(r) for r in rows]
        except Exception:
            return []

def get_table_counts() -> dict:
    tables = ["simulation_runs","workload_history","predictions","rag_cases",
              "allocation_history","agent_events","performance_metrics","aprda_decisions"]
    result = {}
    with _conn() as con:
        for t in tables:
            try:
                n = con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                result[t] = n
            except Exception:
                result[t] = 0
    return result

# Auto-init on import
init_db()
