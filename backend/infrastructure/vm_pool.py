"""
backend/infrastructure/vm_pool.py
Stateful VM pool simulation with dynamic resource allocation/release.
6 VM types covering different workload profiles.
"""
import time
import threading
from typing import Optional

_lock = threading.Lock()

# Initial VM definitions
_VM_SPECS = [
    {"id": "VM01", "vcpu": 8,  "memory_gb": 16, "io": "Medium", "network_gbps": 1,  "cost_per_hour": 0.12},
    {"id": "VM02", "vcpu": 16, "memory_gb": 32, "io": "High",   "network_gbps": 5,  "cost_per_hour": 0.24},
    {"id": "VM03", "vcpu": 8,  "memory_gb": 32, "io": "High",   "network_gbps": 10, "cost_per_hour": 0.20},
    {"id": "VM04", "vcpu": 4,  "memory_gb": 8,  "io": "Low",    "network_gbps": 1,  "cost_per_hour": 0.08},
    {"id": "VM05", "vcpu": 32, "memory_gb": 64, "io": "High",   "network_gbps": 25, "cost_per_hour": 0.48},
    {"id": "VM06", "vcpu": 16, "memory_gb": 32, "io": "Medium", "network_gbps": 5,  "cost_per_hour": 0.22},
]

_IO_SCORES = {"Low": 1, "Medium": 2, "High": 3}

# Live state — used_cpu and used_mem in % of capacity
_state: dict[str, dict] = {}

def _init_state():
    global _state
    _state = {}
    for vm in _VM_SPECS:
        _state[vm["id"]] = {
            **vm,
            "cpu_capacity_pct": 100.0,
            "mem_capacity_gb": float(vm["memory_gb"]),
            "used_cpu_pct": 0.0,
            "used_mem_gb": 0.0,
            "status": "idle",           # idle / allocated / overloaded
            "allocated_to_run": None,
        }

_init_state()

def _available_cpu(vm_id: str) -> float:
    s = _state[vm_id]
    return s["cpu_capacity_pct"] - s["used_cpu_pct"]

def _available_mem(vm_id: str) -> float:
    s = _state[vm_id]
    return s["mem_capacity_gb"] - s["used_mem_gb"]

def get_all_vms() -> list[dict]:
    with _lock:
        result = []
        for vm_id, s in _state.items():
            result.append({
                "id": vm_id,
                "vcpu": s["vcpu"],
                "memory_gb": s["memory_gb"],
                "io": s["io"],
                "io_score": _IO_SCORES.get(s["io"], 1),
                "network_gbps": s["network_gbps"],
                "cost_per_hour": s["cost_per_hour"],
                "used_cpu_pct": round(s["used_cpu_pct"], 1),
                "used_mem_gb": round(s["used_mem_gb"], 2),
                "available_cpu_pct": round(_available_cpu(vm_id), 1),
                "available_mem_gb": round(_available_mem(vm_id), 2),
                "status": s["status"],
                "cpu_utilization_pct": round(s["used_cpu_pct"], 1),
            })
        return result

def get_vm(vm_id: str) -> Optional[dict]:
    with _lock:
        if vm_id not in _state:
            return None
        s = _state[vm_id]
        return {
            "id": vm_id,
            "vcpu": s["vcpu"],
            "memory_gb": s["memory_gb"],
            "io": s["io"],
            "io_score": _IO_SCORES.get(s["io"], 1),
            "network_gbps": s["network_gbps"],
            "cost_per_hour": s["cost_per_hour"],
            "used_cpu_pct": round(s["used_cpu_pct"], 1),
            "used_mem_gb": round(s["used_mem_gb"], 2),
            "available_cpu_pct": round(_available_cpu(vm_id), 1),
            "available_mem_gb": round(_available_mem(vm_id), 2),
            "status": s["status"],
        }

def allocate(vm_id: str, cpu_pct: float, mem_gb: float, run_id: str = None) -> dict:
    """Attempt allocation. Returns {success, vm_id, message, before, after}."""
    with _lock:
        if vm_id not in _state:
            return {"success": False, "message": f"VM {vm_id} not found"}
        s = _state[vm_id]
        avail_cpu = _available_cpu(vm_id)
        avail_mem = _available_mem(vm_id)
        before = {
            "used_cpu_pct": round(s["used_cpu_pct"], 1),
            "used_mem_gb": round(s["used_mem_gb"], 2),
            "available_cpu_pct": round(avail_cpu, 1),
            "available_mem_gb": round(avail_mem, 2),
        }
        if cpu_pct > avail_cpu:
            return {
                "success": False,
                "vm_id": vm_id,
                "message": f"Insufficient CPU: requested {cpu_pct:.1f}% but only {avail_cpu:.1f}% available",
                "before": before,
                "after": None,
            }
        if mem_gb > avail_mem:
            return {
                "success": False,
                "vm_id": vm_id,
                "message": f"Insufficient memory: requested {mem_gb:.1f} GB but only {avail_mem:.1f} GB available",
                "before": before,
                "after": None,
            }
        s["used_cpu_pct"] += cpu_pct
        s["used_mem_gb"] += mem_gb
        s["status"] = "allocated"
        if run_id:
            s["allocated_to_run"] = run_id
        after = {
            "used_cpu_pct": round(s["used_cpu_pct"], 1),
            "used_mem_gb": round(s["used_mem_gb"], 2),
            "available_cpu_pct": round(_available_cpu(vm_id), 1),
            "available_mem_gb": round(_available_mem(vm_id), 2),
        }
        return {
            "success": True,
            "vm_id": vm_id,
            "message": f"Allocated {cpu_pct:.1f}% CPU and {mem_gb:.1f} GB RAM on {vm_id}",
            "before": before,
            "after": after,
        }

def release(vm_id: str, cpu_pct: float, mem_gb: float) -> dict:
    """Release previously allocated resources."""
    with _lock:
        if vm_id not in _state:
            return {"success": False, "message": f"VM {vm_id} not found"}
        s = _state[vm_id]
        s["used_cpu_pct"] = max(0.0, s["used_cpu_pct"] - cpu_pct)
        s["used_mem_gb"] = max(0.0, s["used_mem_gb"] - mem_gb)
        if s["used_cpu_pct"] < 1.0:
            s["status"] = "idle"
            s["allocated_to_run"] = None
        return {"success": True, "vm_id": vm_id, "message": "Resources released"}

def reset_all():
    _init_state()
