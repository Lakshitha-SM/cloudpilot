"""
CloudPilot Data Ingestion Module
Handles discovering, loading, and verifying raw cloud workload trace files.
Default dataset: GWA-T-12 Bitbrains Cloud Datacenter Workload Trace (fastStorage).
"""

import os
import glob
import logging
import pandas as pd
import numpy as np
from typing import Optional, List

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ingestion")

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW_DATA_DIR = os.path.join(BASE_DIR, "data", "raw")
PROCESSED_DATA_DIR = os.path.join(BASE_DIR, "data", "processed")


def extract_representative_bitbrains_raw(
    source_dir: Optional[str] = None,
    target_raw_file: Optional[str] = None,
    num_vms: int = 50,
    force_recreate: bool = False,
) -> str:
    """
    Extracts representative VM traces with dynamic activity from the raw Bitbrains dataset
    into data/raw/bitbrains_raw_traces.csv.
    """
    os.makedirs(RAW_DATA_DIR, exist_ok=True)
    if target_raw_file is None:
        target_raw_file = os.path.join(RAW_DATA_DIR, "bitbrains_raw_traces.csv")

    if not force_recreate and os.path.exists(target_raw_file) and os.path.getsize(target_raw_file) > 1024:
        logger.info(f"Raw dataset already exists at {target_raw_file} ({os.path.getsize(target_raw_file)} bytes)")
        return target_raw_file

    if source_dir is None:
        source_dir = os.path.join(BASE_DIR, "scratch", "kwananth", "output")

    if not os.path.exists(source_dir):
        raise FileNotFoundError(
            f"Source directory '{source_dir}' not found and '{target_raw_file}' does not exist. "
            f"Please place raw workload CSV files in '{RAW_DATA_DIR}'."
        )

    logger.info(f"Scanning '{source_dir}' for dynamic VM traces...")
    files = sorted(glob.glob(os.path.join(source_dir, "*.csv")), key=lambda x: int(os.path.basename(x).split(".")[0]))

    candidates = []
    for f in files:
        if os.path.getsize(f) < 100:
            continue
        try:
            df_sample = pd.read_csv(f, sep=";", header=None)
            if len(df_sample) < 50:
                continue
            cpu_max = float(df_sample[1].max())
            cpu_std = float(df_sample[1].std())
            # Select VMs with meaningful variation and workload dynamics
            if cpu_max >= 25.0 and cpu_std > 3.0:
                candidates.append((f, cpu_max, cpu_std))
        except Exception:
            continue

    logger.info(f"Found {len(candidates)} dynamic VM traces. Selecting top {num_vms}...")
    candidates = sorted(candidates, key=lambda x: x[2], reverse=True)[:num_vms]

    candidate_records: List[pd.DataFrame] = []
    for f, _, _ in candidates:
        vm_num = int(os.path.basename(f).split(".")[0])
        try:
            df = pd.read_csv(
                f,
                sep=";",
                header=None,
                names=[
                    "timestamp_raw",
                    "cpu_usage_mhz_or_pct",
                    "mem_usage_pct",
                    "disk_read_mbs",
                    "disk_write_kbs",
                    "net_in_kbs",
                    "net_out_kbs",
                    "workload_class",
                ],
            )
            df["vm_id"] = f"VM_{vm_num:04d}"
            candidate_records.append(df)
        except Exception as e:
            logger.warning(f"Error reading {f}: {e}")

    if not candidate_records:
        raise ValueError(f"No valid VM trace records could be extracted from '{source_dir}'.")

    raw_combined = pd.concat(candidate_records, ignore_index=True)
    raw_combined.sort_values(by=["timestamp_raw", "vm_id"], inplace=True)
    raw_combined.to_csv(target_raw_file, index=False)
    logger.info(
        f"Successfully extracted {len(raw_combined)} raw records across {len(candidate_records)} dynamic VMs to {target_raw_file}"
    )
    return target_raw_file


def load_raw_dataset(raw_path: Optional[str] = None) -> pd.DataFrame:
    """
    Loads raw CSV data from data/raw/.
    Automatically handles comma or semicolon separated CSVs.
    """
    if raw_path is None:
        raw_path = os.path.join(RAW_DATA_DIR, "bitbrains_raw_traces.csv")

    if not os.path.exists(raw_path):
        source_dir = os.path.join(BASE_DIR, "scratch", "kwananth", "output")
        if os.path.exists(source_dir):
            raw_path = extract_representative_bitbrains_raw(source_dir=source_dir)
        else:
            raise FileNotFoundError(
                f"No raw dataset found at {raw_path}. "
                f"Please drop a CSV into {RAW_DATA_DIR} to begin data processing."
            )

    logger.info(f"Loading raw dataset from {raw_path}...")
    with open(raw_path, "r", encoding="utf-8") as f:
        first_line = f.readline()
        delimiter = ";" if ";" in first_line else ","

    df = pd.read_csv(raw_path, delimiter=delimiter)
    logger.info(f"Loaded {len(df)} rows and {len(df.columns)} columns: {list(df.columns)}")
    return df


if __name__ == "__main__":
    extract_representative_bitbrains_raw(force_recreate=True)
    df = load_raw_dataset()
    print(df.head())
