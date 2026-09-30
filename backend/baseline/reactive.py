"""
backend/baseline/reactive.py
Traditional reactive allocation baseline.
Waits until CPU threshold is breached, then allocates — no prediction, no RAG.
"""
import time
from backend.infrastructure import vm_pool
from backend.database import db

CPU_THRESHOLD = 80.0  # % — reactive trigger point

def run(workload: dict, run_id: str = None) -> dict:
    """
    Reactive strategy: allocate only if current_cpu > CPU_THRESHOLD.
    Picks first available VM by simple first-fit, no scoring.
    """
    if run_id is None:
        run_id = db.new_run("reactive-baseline")

    t0 = time.perf_counter()
    current_cpu = float(workload.get("current_cpu", 30.0))
    req_cpu     = float(workload.get("required_cpu", 30.0))
    req_mem     = float(workload.get("required_mem", 4.0))

    if current_cpu <= CPU_THRESHOLD:
        decision_latency = (time.perf_counter() - t0) * 1000.0
        # Reactive: no action taken — workload not yet at threshold
        db.log_performance(run_id, {
            "strategy": "Reactive",
            "response_time_ms": decision_latency + 150,  # simulated wait delay
            "decision_latency_ms": decision_latency,
            "sla_violation": False,
            "cpu_utilization": current_cpu,
            "allocation_success": False,
        })
        return {
            "strategy": "Reactive",
            "status": "DEFERRED",
            "reason": f"Current CPU {current_cpu:.1f}% is below reactive threshold {CPU_THRESHOLD}%. No action taken.",
            "selected_vm": None,
            "decision_latency_ms": round(decision_latency, 3),
            "response_time_ms": round(decision_latency + 150, 3),
        }

    # Threshold breached — find first VM with enough capacity (no scoring)
    vms = vm_pool.get_all_vms()
    selected = None
    for vm in vms:
        if vm["available_cpu_pct"] >= req_cpu + 5 and vm["available_mem_gb"] >= req_mem + 1:
            selected = vm
            break

    decision_latency = (time.perf_counter() - t0) * 1000.0

    if not selected:
        db.log_performance(run_id, {
            "strategy": "Reactive",
            "response_time_ms": decision_latency + 200,
            "decision_latency_ms": decision_latency,
            "sla_violation": True,
            "cpu_utilization": current_cpu,
            "allocation_success": False,
        })
        return {
            "strategy": "Reactive",
            "status": "FAILED",
            "reason": "No VM with sufficient capacity (all overloaded).",
            "selected_vm": None,
            "decision_latency_ms": round(decision_latency, 3),
            "response_time_ms": round(decision_latency + 200, 3),
            "sla_violation": True,
        }

    alloc = vm_pool.allocate(selected["id"], req_cpu, req_mem, run_id=run_id)
    response_time = (time.perf_counter() - t0) * 1000.0 + 120  # reactive add 120ms delay

    db.log_allocation(run_id, {
        "selected_vm": selected["id"],
        "requested_cpu": req_cpu,
        "requested_memory": req_mem,
        "requested_io": 0,
        "available_cpu": selected["available_cpu_pct"],
        "available_memory": selected["available_mem_gb"],
        "status": "SUCCESS" if alloc["success"] else "FAILED",
        "execution_latency_ms": response_time,
        "strategy": "Reactive",
    })
    db.log_performance(run_id, {
        "strategy": "Reactive",
        "response_time_ms": response_time,
        "decision_latency_ms": decision_latency,
        "sla_violation": current_cpu > 85,
        "cpu_utilization": current_cpu,
        "allocation_success": alloc["success"],
    })

    return {
        "strategy": "Reactive",
        "status": "SUCCESS" if alloc["success"] else "FAILED",
        "selected_vm": selected["id"],
        "reason": f"CPU threshold {CPU_THRESHOLD}% breached. First-fit selected {selected['id']}. No prediction used.",
        "decision_latency_ms": round(decision_latency, 3),
        "response_time_ms": round(response_time, 3),
        "sla_violation": current_cpu > 85,
    }
