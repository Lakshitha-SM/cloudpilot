"""
backend/workload/generator.py
Generates realistic e-commerce workload data from the Bitbrains dataset.
Supports: normal, elevated, flash_sale, and batch_processing scenarios.
"""
import os, random, math
import pandas as pd
import numpy as np

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PROC = os.path.join(BASE, "data", "processed", "workload_dataset.csv")

_df: pd.DataFrame = None

def _load():
    global _df
    if _df is None and os.path.exists(PROC):
        _df = pd.read_csv(PROC)
    return _df

_SCENARIOS = {
    "normal":         {"cpu_mean": 32, "cpu_std": 8,  "mem_mean": 40, "rps_mult": 1.0},
    "elevated":       {"cpu_mean": 58, "cpu_std": 12, "mem_mean": 55, "rps_mult": 2.5},
    "flash_sale":     {"cpu_mean": 82, "cpu_std": 8,  "mem_mean": 72, "rps_mult": 6.0},
    "batch_processing":{"cpu_mean":55, "cpu_std": 6,  "mem_mean": 65, "rps_mult": 1.2},
}

def generate_single(scenario: str = "normal", step: int = 0) -> dict:
    """
    Generate one workload data point for the given scenario.
    Uses real Bitbrains dataset rows when available, else falls back to parameterized synthesis.
    """
    df = _load()
    s  = _SCENARIOS.get(scenario, _SCENARIOS["normal"])

    if df is not None and len(df) > 0:
        # Sample a dataset row matching the scenario
        if scenario == "flash_sale":
            pool = df[df["current_cpu"] > 70]
        elif scenario == "elevated":
            pool = df[(df["current_cpu"] > 45) & (df["current_cpu"] <= 70)]
        elif scenario == "batch_processing":
            pool = df[df["workload_type"] == "Batch Processing"] if "workload_type" in df.columns else df
        else:
            pool = df[df["current_cpu"] <= 45]
        if len(pool) == 0:
            pool = df
        row = pool.sample(1).iloc[0]
        cpu  = float(row["current_cpu"])
        mem  = float(row["current_memory"])
        io   = float(row.get("current_io", 0.5))
        net  = float(row.get("current_network", 0.3))
        rr   = float(row.get("request_rate", 500.0))
        users= int(row.get("active_users", 100))
        wtype= str(row.get("workload_type", "Web Traffic"))
        wtype_code = int(row.get("workload_type_code", 0))
        intensity = str(row.get("workload_intensity", "Normal"))
        prev_cpu = float(row.get("previous_cpu", cpu))
        roll_mean= float(row.get("rolling_cpu_mean", cpu))
        roll_std = float(row.get("rolling_cpu_std", 2.0))
    else:
        cpu  = max(0.0, min(100.0, random.gauss(s["cpu_mean"], s["cpu_std"])))
        mem  = max(0.0, min(100.0, random.gauss(s["mem_mean"], 8.0)))
        io   = max(0.0, random.uniform(0.1, 5.0))
        net  = max(0.0, random.uniform(0.1, 2.0))
        rr   = max(10.0, cpu * 15.0 * s["rps_mult"] + random.gauss(0, 50))
        users= max(1, int(rr * 0.45))
        wtype= "Flash Sale" if scenario == "flash_sale" else "E-Commerce" if cpu > 50 else "Web Traffic"
        wtype_code = {"Web Traffic":0,"E-Commerce":1,"Batch Processing":2,"Flash Sale":3}.get(wtype,0)
        intensity = "Extreme" if cpu > 85 else "High" if cpu > 70 else "Elevated" if cpu > 55 else "Normal"
        prev_cpu = cpu
        roll_mean = cpu
        roll_std  = s["cpu_std"]

    # Compute resource requirements for the allocation pipeline
    required_cpu = round(cpu * 0.40, 1)   # request 40% of current CPU level
    required_mem = round(mem * 0.30 / 10, 1)  # convert to GB
    required_io  = "High" if io > 4 else "Medium" if io > 1 else "Low"

    return {
        "scenario": scenario,
        "step": step,
        "current_cpu": round(cpu, 2),
        "current_memory": round(mem, 2),
        "current_io": round(io, 3),
        "current_network": round(net, 3),
        "request_rate": round(rr, 1),
        "active_users": users,
        "workload_type": wtype,
        "workload_type_code": wtype_code,
        "workload_intensity": intensity,
        "previous_cpu": round(prev_cpu, 2),
        "rolling_cpu_mean": round(roll_mean, 2),
        "rolling_cpu_std": round(roll_std, 2),
        "rolling_memory_mean": round(mem * 0.95, 2),
        "traffic_growth": round((cpu - prev_cpu) / max(prev_cpu, 1.0), 4),
        "hour": 14,
        "day": 1,
        "required_cpu": required_cpu,
        "required_mem": max(1.0, required_mem),
        "required_io": required_io,
        "required_net": 0.5,
    }

def generate_flash_sale_sequence(steps: int = 10) -> list[dict]:
    """Generate a sequence of workloads simulating a flash sale ramp-up."""
    sequence = []
    for i in range(steps):
        frac = i / max(steps - 1, 1)
        cpu_boost = frac * 60   # ramp from 0 to +60% extra
        df = _load()
        base = generate_single("normal", i)
        cpu = min(100.0, base["current_cpu"] + cpu_boost)
        mem = min(100.0, base["current_memory"] + frac * 30)
        rr  = base["request_rate"] * (1 + frac * 5)
        users = max(base["active_users"], int(rr * 0.45))
        intensity = "Extreme" if cpu > 85 else "High" if cpu > 70 else "Elevated" if cpu > 55 else "Normal"
        wtype = "Flash Sale" if cpu > 70 else "E-Commerce" if cpu > 50 else "Web Traffic"
        required_cpu = round(cpu * 0.40, 1)
        required_mem = max(1.0, round(mem * 0.30 / 10, 1))
        required_io  = "High" if cpu > 70 else "Medium"
        sequence.append({
            **base,
            "scenario": "flash_sale",
            "step": i,
            "current_cpu": round(cpu, 2),
            "current_memory": round(mem, 2),
            "request_rate": round(rr, 1),
            "active_users": users,
            "workload_type": wtype,
            "workload_intensity": intensity,
            "required_cpu": required_cpu,
            "required_mem": required_mem,
            "required_io": required_io,
        })
    return sequence
