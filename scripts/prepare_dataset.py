"""
scripts/prepare_dataset.py
Validates, extracts and preprocesses the Bitbrains cloud workload trace.
NO internet access required. Works entirely on local files.
"""
import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import logging
import pandas as pd
import numpy as np
import glob

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("prepare_dataset")

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RAW_PATH   = os.path.join(BASE, "data", "raw", "bitbrains_raw_traces.csv")
PROC_PATH  = os.path.join(BASE, "data", "processed", "workload_dataset.csv")
SCRATCH    = os.path.join(BASE, "scratch", "kwananth", "output")

def extract_from_scratch(target: str, num_vms: int = 50):
    if not os.path.isdir(SCRATCH):
        return False
    files = sorted(glob.glob(os.path.join(SCRATCH, "*.csv")),
                   key=lambda x: int(os.path.basename(x).split(".")[0]))
    log.info(f"Scanning {len(files)} files in scratch archive …")
    candidates = []
    for f in files:
        if os.path.getsize(f) < 100:
            continue
        try:
            df = pd.read_csv(f, sep=";", header=None)
            if len(df) < 50:
                continue
            cpu_std = float(df[1].std())
            cpu_max = float(df[1].max())
            if cpu_max >= 25.0 and cpu_std > 3.0:
                candidates.append((f, cpu_std))
        except Exception:
            continue
    if not candidates:
        return False
    candidates = sorted(candidates, key=lambda x: x[1], reverse=True)[:num_vms]
    dfs = []
    for f, _ in candidates:
        vm_num = int(os.path.basename(f).split(".")[0])
        df = pd.read_csv(f, sep=";", header=None, names=[
            "timestamp_raw","cpu_usage_mhz_or_pct","mem_usage_pct",
            "disk_read_mbs","disk_write_kbs","net_in_kbs","net_out_kbs","workload_class"
        ])
        df["vm_id"] = f"VM_{vm_num:04d}"
        dfs.append(df)
    combined = pd.concat(dfs, ignore_index=True)
    combined.sort_values(["timestamp_raw","vm_id"], inplace=True)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    combined.to_csv(target, index=False)
    log.info(f"Extracted {len(combined)} rows from {len(dfs)} VMs → {target}")
    return True

def preprocess(raw_path: str, out_path: str):
    df = pd.read_csv(raw_path)
    cols = {"timestamp_raw","cpu_usage_mhz_or_pct","mem_usage_pct",
            "disk_read_mbs","disk_write_kbs","net_in_kbs","net_out_kbs","vm_id"}
    missing = cols - set(df.columns)
    if missing:
        log.error(f"Raw file missing columns: {missing}")
        sys.exit(1)

    # Clean
    for c in ["cpu_usage_mhz_or_pct","mem_usage_pct","disk_read_mbs","disk_write_kbs","net_in_kbs","net_out_kbs"]:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0)
    df = df[df["timestamp_raw"] > 0].copy()
    df["cpu_usage_mhz_or_pct"] = df["cpu_usage_mhz_or_pct"].clip(0, 100)
    df["mem_usage_pct"]         = df["mem_usage_pct"].clip(0, 100)
    df.sort_values(["timestamp_raw","vm_id"], inplace=True)
    df.reset_index(drop=True, inplace=True)

    # Features
    p = pd.DataFrame()
    p["timestamp"]        = pd.to_datetime(df["timestamp_raw"], unit="s", utc=True).dt.strftime("%Y-%m-%d %H:%M:%S")
    p["raw_timestamp"]    = df["timestamp_raw"]
    p["vm_id"]            = df["vm_id"]
    p["current_cpu"]      = df["cpu_usage_mhz_or_pct"].round(2)
    p["current_memory"]   = df["mem_usage_pct"].round(2)
    p["current_io"]       = (df["disk_read_mbs"] + df["disk_write_kbs"]/1024.0).round(3)
    p["current_network"]  = ((df["net_in_kbs"] + df["net_out_kbs"])/1024.0).round(3)
    p["request_rate"]     = ((p["current_network"]*1024.0/25.0) + p["current_cpu"]*15.0).clip(10,15000).round(1)
    p["active_users"]     = (p["request_rate"]*0.45).round(0).astype(int).clip(5)
    dt = pd.to_datetime(df["timestamp_raw"], unit="s", utc=True)
    p["hour"] = dt.dt.hour
    p["day"]  = dt.dt.dayofweek

    wtype_map = {"Web Traffic":0,"E-Commerce":1,"Batch Processing":2,"Flash Sale":3,"HPC":4}
    def wtype(r):
        cpu, io = r["current_cpu"], r["current_io"]
        if cpu > 80 and io > 5: return "Flash Sale"
        if io > 4: return "Batch Processing"
        if cpu > 70: return "HPC"
        if cpu > 40: return "E-Commerce"
        return "Web Traffic"
    p["workload_type"]      = p.apply(wtype, axis=1)
    p["workload_type_code"] = p["workload_type"].map(wtype_map)

    def intensity(c):
        if c < 25: return "Low"
        if c < 55: return "Normal"
        if c < 75: return "Elevated"
        if c < 88: return "High"
        return "Extreme"
    p["workload_intensity"] = p["current_cpu"].apply(intensity)

    p["previous_cpu"]    = p.groupby("vm_id")["current_cpu"].shift(1).fillna(p["current_cpu"])
    p["previous_memory"] = p.groupby("vm_id")["current_memory"].shift(1).fillna(p["current_memory"])
    p["rolling_cpu_mean"]   = p.groupby("vm_id")["current_cpu"].transform(lambda x: x.rolling(5,min_periods=1).mean()).round(2)
    p["rolling_cpu_std"]    = p.groupby("vm_id")["current_cpu"].transform(lambda x: x.rolling(5,min_periods=1).std().fillna(0)).round(2)
    p["rolling_memory_mean"]= p.groupby("vm_id")["current_memory"].transform(lambda x: x.rolling(5,min_periods=1).mean()).round(2)
    p["traffic_growth"]     = ((p["current_cpu"] - p["previous_cpu"])/(p["previous_cpu"]+1.0)).round(4)
    p["future_cpu"]         = p.groupby("vm_id")["current_cpu"].transform(lambda x: x.shift(-1)).fillna(p["current_cpu"]).round(2)
    p["future_memory"]      = p.groupby("vm_id")["current_memory"].transform(lambda x: x.shift(-1)).fillna(p["current_memory"]).round(2)
    p["future_request_rate"]= p.groupby("vm_id")["request_rate"].transform(lambda x: x.shift(-1)).fillna(p["request_rate"]).round(1)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    p.to_csv(out_path, index=False)
    log.info(f"Processed dataset: {len(p)} rows, {len(p.columns)} columns → {out_path}")
    return p

def validate(path: str):
    df = pd.read_csv(path)
    required = ["current_cpu","current_memory","current_io","current_network",
                "previous_cpu","previous_memory","rolling_cpu_mean","rolling_cpu_std",
                "rolling_memory_mean","request_rate","active_users","traffic_growth",
                "hour","day","workload_type_code","future_cpu","vm_id","timestamp"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        log.error(f"VALIDATION FAILED — missing columns: {missing}")
        return False
    log.info(f"Validation PASSED: {len(df)} rows, VMs={df['vm_id'].nunique()}, "
             f"CPU range=[{df['current_cpu'].min():.1f}, {df['current_cpu'].max():.1f}]")
    return True

if __name__ == "__main__":
    print("=" * 60)
    print("CloudPilot Dataset Preparation")
    print("=" * 60)

    if not os.path.exists(RAW_PATH):
        log.info("Raw dataset not found — attempting local extraction from scratch archive …")
        ok = extract_from_scratch(RAW_PATH)
        if not ok:
            print("\n" + "=" * 60)
            print("REAL DATASET REQUIRED")
            print("=" * 60)
            print("\nThe raw dataset file is missing:")
            print(f"  {RAW_PATH}")
            print("\nTo obtain it, use one of:")
            print("  A) If scratch/kwananth/output/ exists (already cloned):")
            print("     python scripts/prepare_dataset.py   (auto-extracts)")
            print("  B) Download GWA-T-12 Bitbrains fastStorage from:")
            print("     http://gwa.ewi.tudelft.nl/datasets/gwa-t-12-bitbrains")
            print("     Extract CSVs and place concatenated file at:")
            print(f"     {RAW_PATH}")
            sys.exit(1)

    log.info("Raw dataset found. Preprocessing …")
    preprocess(RAW_PATH, PROC_PATH)
    ok = validate(PROC_PATH)
    if ok:
        print("\n✓ Dataset preparation COMPLETE")
        print(f"  Processed file: {PROC_PATH}")
    else:
        sys.exit(1)
