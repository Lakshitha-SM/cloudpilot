"""
backend/agents/rag_agent.py
Retrieval-Augmented Generation using in-memory cosine similarity over historical allocations.
Falls back to Bitbrains dataset rows when allocation history is empty.
"""
import time, os, json
import numpy as np
import pandas as pd

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PROC_PATH = os.path.join(BASE, "data", "processed", "workload_dataset.csv")
HIST_PATH = os.path.join(BASE, "database", "rag_history.json")

# Feature columns used for similarity
SIM_FEATURES = ["current_cpu", "current_memory", "current_io", "current_network", "request_rate"]

# ── In-memory case base ──────────────────────────────────────────────────────
_cases: list[dict] = []
_loaded = False

def _build_from_dataset():
    """Bootstrap case base from processed dataset (evenly sampled)."""
    if not os.path.exists(PROC_PATH):
        return []
    df = pd.read_csv(PROC_PATH)
    # Sample representative rows per VM (limit to 200 total for fast retrieval)
    sampled = df.groupby("vm_id", group_keys=False).apply(
        lambda g: g.iloc[::max(1, len(g)//4)].head(4)
    ).reset_index(drop=True).head(200)
    cases = []
    for i, row in sampled.iterrows():
        vm_map = {0:"VM01", 1:"VM02", 2:"VM03", 3:"VM04", 4:"VM05"}
        vm = vm_map.get(int(row.get("workload_type_code", 0) % 5), "VM01")
        cases.append({
            "case_id": f"HIST-{i:04d}",
            "source": "dataset",
            "current_cpu": float(row["current_cpu"]),
            "current_memory": float(row["current_memory"]),
            "current_io": float(row.get("current_io", 0.5)),
            "current_network": float(row.get("current_network", 0.3)),
            "request_rate": float(row.get("request_rate", 500.0)),
            "workload_type": str(row.get("workload_type", "Web Traffic")),
            "selected_vm": vm,
            "result": "SUCCESS",
            "response_time_ms": round(float(50 + row["current_cpu"] * 0.8), 1),
            "sla_satisfied": row["current_cpu"] < 85,
        })
    return cases

def _load_cases():
    global _cases, _loaded
    if _loaded:
        return
    # Load from saved history if available
    if os.path.exists(HIST_PATH):
        try:
            with open(HIST_PATH) as f:
                _cases = json.load(f)
        except Exception:
            _cases = []
    # Always bootstrap from dataset if < 50 cases
    if len(_cases) < 50:
        dataset_cases = _build_from_dataset()
        _cases = dataset_cases + _cases
    _loaded = True

def add_case(case: dict):
    """Add a new allocation result to the case base."""
    _load_cases()
    _cases.append(case)
    os.makedirs(os.path.dirname(HIST_PATH), exist_ok=True)
    # Only persist manually added (real allocation) cases
    real = [c for c in _cases if c.get("source") != "dataset"]
    try:
        with open(HIST_PATH, "w") as f:
            json.dump(real, f, indent=2)
    except Exception:
        pass

def _cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))

def _vec(case: dict) -> np.ndarray:
    return np.array([float(case.get(f, 0.0)) for f in SIM_FEATURES], dtype=np.float64)

def run(workload: dict, top_k: int = 5) -> dict:
    t0 = time.perf_counter()
    _load_cases()

    query_vec = _vec(workload)
    scored = []
    for case in _cases:
        sim = _cosine_sim(query_vec, _vec(case))
        scored.append((sim, case))

    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[:top_k]

    retrieved = []
    for sim, case in top:
        retrieved.append({
            "case_id": case.get("case_id", "?"),
            "source": case.get("source", "dataset"),
            "similarity": round(sim, 4),
            "workload_cpu": case.get("current_cpu", 0),
            "workload_memory": case.get("current_memory", 0),
            "workload_type": case.get("workload_type", "N/A"),
            "selected_vm": case.get("selected_vm", "N/A"),
            "result": case.get("result", "N/A"),
            "response_time_ms": case.get("response_time_ms", 0),
            "sla_satisfied": case.get("sla_satisfied", True),
        })

    # Majority vote on best VM from successful retrievals
    success_vms = [r["selected_vm"] for r in retrieved if r["result"] == "SUCCESS"]
    suggested_vm = max(set(success_vms), key=success_vms.count) if success_vms else None

    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    return {
        "agent": "RAGAgent",
        "query": {
            "current_cpu": workload.get("current_cpu", 0),
            "current_memory": workload.get("current_memory", 0),
            "current_io": workload.get("current_io", 0),
            "current_network": workload.get("current_network", 0),
            "request_rate": workload.get("request_rate", 0),
        },
        "case_base_size": len(_cases),
        "retrieved_cases": retrieved,
        "suggested_vm": suggested_vm,
        "latency_ms": round(elapsed_ms, 3),
    }
