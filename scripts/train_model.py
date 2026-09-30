"""
scripts/train_model.py
Trains RandomForestRegressor on the processed dataset.
Computes REAL MAE, RMSE, R2 from the actual test split.
NO hardcoded metrics.
"""
import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import json, logging
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("train_model")

BASE      = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PROC_PATH = os.path.join(BASE, "data", "processed", "workload_dataset.csv")
MODEL_DIR = os.path.join(BASE, "models")
MODEL_PKL = os.path.join(MODEL_DIR, "random_forest_workload.pkl")
META_JSON = os.path.join(MODEL_DIR, "model_metadata.json")

FEATURES = [
    "current_cpu","current_memory","current_io","current_network",
    "previous_cpu","previous_memory","rolling_cpu_mean","rolling_cpu_std",
    "rolling_memory_mean","request_rate","active_users","traffic_growth",
    "hour","day","workload_type_code",
]
TARGET = "future_cpu"

# Hyperparameters
N_ESTIMATORS    = 100
MAX_DEPTH       = 12
MIN_SAMPLES     = 4
RANDOM_STATE    = 42
PREDICTION_HOR  = "~10 minutes (1 step ahead at 9-second intervals)"

if __name__ == "__main__":
    print("=" * 60)
    print("CloudPilot — Random Forest Training")
    print("=" * 60)

    if not os.path.exists(PROC_PATH):
        print(f"\nERROR: Processed dataset not found at:\n  {PROC_PATH}")
        print("Run: python scripts/prepare_dataset.py")
        sys.exit(1)

    log.info(f"Loading processed dataset from {PROC_PATH} …")
    df = pd.read_csv(PROC_PATH)
    log.info(f"Loaded {len(df)} rows, {df['vm_id'].nunique()} VMs.")

    missing = [c for c in FEATURES + [TARGET] if c not in df.columns]
    if missing:
        log.error(f"Missing columns: {missing}")
        sys.exit(1)

    # Per-VM chronological split: 80% train, 20% test — prevents data leakage
    train_dfs, test_dfs = [], []
    for vm_id, grp in df.groupby("vm_id"):
        split = int(len(grp) * 0.80)
        train_dfs.append(grp.iloc[:split])
        test_dfs.append(grp.iloc[split:])

    train_df = pd.concat(train_dfs).reset_index(drop=True)
    test_df  = pd.concat(test_dfs).reset_index(drop=True)

    X_train = train_df[FEATURES].values
    y_train = train_df[TARGET].values
    X_test  = test_df[FEATURES].values
    y_test  = test_df[TARGET].values

    log.info(f"Train: {len(X_train)} samples  |  Test: {len(X_test)} samples")
    log.info(f"Fitting RandomForestRegressor(n_estimators={N_ESTIMATORS}, max_depth={MAX_DEPTH}, random_state={RANDOM_STATE}) …")

    rf = RandomForestRegressor(
        n_estimators=N_ESTIMATORS,
        max_depth=MAX_DEPTH,
        min_samples_split=MIN_SAMPLES,
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    rf.fit(X_train, y_train)

    y_pred = rf.predict(X_test)

    mae  = float(mean_absolute_error(y_test, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
    r2   = float(r2_score(y_test, y_pred))

    nz = y_test > 1.0
    mape = float(np.mean(np.abs((y_test[nz] - y_pred[nz]) / y_test[nz])) * 100.0) if np.any(nz) else 0.0

    # Feature importances
    feat_imp = sorted(
        [{"feature": n, "importance": round(float(v), 4)} for n, v in zip(FEATURES, rf.feature_importances_)],
        key=lambda x: x["importance"], reverse=True
    )

    # Actual vs Predicted sample (50 evenly spaced points)
    idx_sample = np.linspace(0, len(y_test)-1, min(50, len(y_test)), dtype=int)
    avp = [{"timestamp": str(test_df["timestamp"].iloc[i]),
             "actual": round(float(y_test[i]), 2),
             "predicted": round(float(y_pred[i]), 2)} for i in idx_sample]

    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(rf, MODEL_PKL)

    metadata = {
        "model_name": "RandomForestRegressor",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "dataset": "GWA-T-12 Bitbrains fastStorage",
        "dataset_path": PROC_PATH,
        "target": TARGET,
        "prediction_horizon": PREDICTION_HOR,
        "features": FEATURES,
        "hyperparameters": {
            "n_estimators": N_ESTIMATORS,
            "max_depth": MAX_DEPTH,
            "min_samples_split": MIN_SAMPLES,
            "random_state": RANDOM_STATE,
        },
        "split_strategy": "per_vm_chronological_80_20",
        "metrics": {
            "mae":  round(mae,  4),
            "rmse": round(rmse, 4),
            "r2":   round(r2,   4),
            "mape": round(mape, 2),
            "train_samples": int(len(X_train)),
            "test_samples":  int(len(X_test)),
        },
        "feature_importances": feat_imp,
        "actual_vs_predicted": avp,
    }

    with open(META_JSON, "w") as f:
        json.dump(metadata, f, indent=2)

    print("\n" + "=" * 60)
    print("TRAINING COMPLETE — ACTUAL RESULTS")
    print("=" * 60)
    print(f"  Train samples : {len(X_train)}")
    print(f"  Test samples  : {len(X_test)}")
    print(f"  MAE           : {mae:.4f}")
    print(f"  RMSE          : {rmse:.4f}")
    print(f"  R²            : {r2:.4f}")
    print(f"  MAPE          : {mape:.2f}%")
    print(f"\n  Model saved   : {MODEL_PKL}")
    print(f"  Metadata saved: {META_JSON}")
    print("=" * 60)
