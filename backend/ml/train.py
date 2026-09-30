"""
CloudPilot ML Training Module
Trains a real Scikit-Learn RandomForestRegressor on preprocessed workload data.
Computes genuine MAE, RMSE, R^2, and feature importances.
Saves model to models/random_forest_workload.pkl and metadata to models/model_metadata.json.
"""

import os
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ml_train")

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATASET_PATH = os.path.join(BASE_DIR, "data", "processed", "workload_dataset.csv")
MODEL_DIR = os.path.join(BASE_DIR, "models")
MODEL_FILE = os.path.join(MODEL_DIR, "random_forest_workload.pkl")
METADATA_FILE = os.path.join(MODEL_DIR, "model_metadata.json")

DEFAULT_FEATURES = [
    "current_cpu",
    "current_memory",
    "current_io",
    "current_network",
    "previous_cpu",
    "previous_memory",
    "rolling_cpu_mean",
    "rolling_cpu_std",
    "rolling_memory_mean",
    "request_rate",
    "active_users",
    "traffic_growth",
    "hour",
    "day",
    "workload_type_code",
]
TARGET_COLUMN = "future_cpu"


def train_random_forest(
    dataset_path: str = DATASET_PATH,
    n_estimators: int = 100,
    max_depth: Optional[int] = 15,
    min_samples_split: int = 4,
    random_state: int = 42,
    test_size: float = 0.20,
    prediction_horizon: str = "10 minutes",
) -> Dict[str, Any]:
    """
    Trains the Random Forest model and saves artifacts.
    Returns comprehensive evaluation results.
    """
    os.makedirs(MODEL_DIR, exist_ok=True)
    if not os.path.exists(dataset_path):
        raise FileNotFoundError(f"Dataset not found at {dataset_path}. Run preprocessing first.")

    logger.info(f"Loading dataset from {dataset_path}...")
    df = pd.read_csv(dataset_path)

    # Validate feature presence
    missing_feats = [col for col in DEFAULT_FEATURES if col not in df.columns]
    if missing_feats:
        raise ValueError(f"Missing required feature columns: {missing_feats}")
    if TARGET_COLUMN not in df.columns:
        raise ValueError(f"Missing target column: {TARGET_COLUMN}")

    # Chronological train-test split (avoids future-leakage in time series)
    total_len = len(df)
    train_len = int(total_len * (1.0 - test_size))

    X = df[DEFAULT_FEATURES].values
    y = df[TARGET_COLUMN].values

    X_train, X_test = X[:train_len], X[train_len:]
    y_train, y_test = y[:train_len], y[train_len:]

    logger.info(
        f"Training set: {len(X_train)} samples, Test set: {len(X_test)} samples. "
        f"Config: n_estimators={n_estimators}, max_depth={max_depth}, random_state={random_state}"
    )

    rf = RandomForestRegressor(
        n_estimators=n_estimators,
        max_depth=max_depth,
        min_samples_split=min_samples_split,
        random_state=random_state,
        n_jobs=-1,
    )

    logger.info("Fitting RandomForestRegressor...")
    rf.fit(X_train, y_train)

    logger.info("Evaluating on test set...")
    y_pred = rf.predict(X_test)

    # Compute genuine metrics
    mae = float(mean_absolute_error(y_test, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
    r2 = float(r2_score(y_test, y_pred))

    # MAPE (filter zero actuals to avoid division by zero)
    nonzero_mask = y_test > 1.0
    if np.any(nonzero_mask):
        mape = float(np.mean(np.abs((y_test[nonzero_mask] - y_pred[nonzero_mask]) / y_test[nonzero_mask])) * 100.0)
    else:
        mape = 0.0

    # Feature importances
    importances = rf.feature_importances_
    feat_imp = [
        {"feature": name, "importance": round(float(imp), 4)}
        for name, imp in sorted(zip(DEFAULT_FEATURES, importances), key=lambda x: x[1], reverse=True)
    ]

    # Save model binary
    joblib.dump(rf, MODEL_FILE)
    logger.info(f"Trained model saved to {MODEL_FILE}")

    # Generate a curated actual vs predicted slice for visualization (e.g. 50 points)
    sample_indices = np.linspace(0, len(y_test) - 1, min(50, len(y_test)), dtype=int)
    test_timestamps = df["timestamp"].iloc[train_len:].values
    actual_vs_pred = [
        {
            "timestamp": str(test_timestamps[idx]),
            "actual": round(float(y_test[idx]), 2),
            "predicted": round(float(y_pred[idx]), 2),
            "error": round(float(abs(y_test[idx] - y_pred[idx])), 2),
        }
        for idx in sample_indices
    ]

    metadata = {
        "model_name": "RandomForestRegressor",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "dataset_name": "GWA-T-12 Bitbrains fastStorage",
        "target": TARGET_COLUMN,
        "prediction_horizon": prediction_horizon,
        "features": DEFAULT_FEATURES,
        "hyperparameters": {
            "n_estimators": n_estimators,
            "max_depth": max_depth,
            "min_samples_split": min_samples_split,
            "random_state": random_state,
        },
        "metrics": {
            "mae": round(mae, 2),
            "rmse": round(rmse, 2),
            "r2": round(r2, 4),
            "mape": round(mape, 2),
            "train_samples": len(X_train),
            "test_samples": len(X_test),
        },
        "feature_importances": feat_imp,
        "actual_vs_predicted": actual_vs_pred,
    }

    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    logger.info(f"Metadata saved to {METADATA_FILE}")
    logger.info(f"Results: MAE={mae:.2f}, RMSE={rmse:.2f}, R2={r2:.4f}, MAPE={mape:.2f}%")

    return metadata


if __name__ == "__main__":
    train_random_forest()
