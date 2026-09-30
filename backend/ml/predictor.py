"""
backend/ml/predictor.py
Inference wrapper for the trained RandomForestRegressor.
Loads model once at startup. Provides predict() and predict_from_workload().
"""
import os, json, time
import numpy as np
import joblib

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODEL_PKL  = os.path.join(BASE, "models", "random_forest_workload.pkl")
META_JSON  = os.path.join(BASE, "models", "model_metadata.json")

FEATURES = [
    "current_cpu","current_memory","current_io","current_network",
    "previous_cpu","previous_memory","rolling_cpu_mean","rolling_cpu_std",
    "rolling_memory_mean","request_rate","active_users","traffic_growth",
    "hour","day","workload_type_code",
]

_model = None
_metadata = {}

def _load():
    global _model, _metadata
    if _model is None:
        if not os.path.exists(MODEL_PKL):
            raise FileNotFoundError(f"Model not found: {MODEL_PKL}\nRun: python scripts/train_model.py")
        _model = joblib.load(MODEL_PKL)
        if os.path.exists(META_JSON):
            with open(META_JSON) as f:
                _metadata = json.load(f)
    return _model

def get_metadata() -> dict:
    _load()
    return _metadata

def predict(features: dict) -> dict:
    """
    Predict future CPU from a feature dict.
    Returns predicted_cpu, confidence_range, and inference_time_ms.
    """
    model = _load()
    row = [features.get(f, 0.0) for f in FEATURES]
    X = np.array([row])

    t0 = time.perf_counter()
    pred_cpu = float(model.predict(X)[0])
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    # Use std from estimators for a rough confidence range
    preds_all = np.array([e.predict(X)[0] for e in model.estimators_])
    std = float(np.std(preds_all))

    pred_cpu = round(max(0.0, min(100.0, pred_cpu)), 2)

    return {
        "predicted_cpu": pred_cpu,
        "std": round(std, 2),
        "confidence_low":  round(max(0.0, pred_cpu - std), 2),
        "confidence_high": round(min(100.0, pred_cpu + std), 2),
        "inference_time_ms": round(elapsed_ms, 3),
        "features_used": FEATURES,
    }

def predict_from_workload(workload: dict) -> dict:
    """
    High-level convenience: takes a workload dict and builds the feature vector.
    workload keys: current_cpu, current_memory, current_io, current_network,
                   request_rate, active_users, hour, day, workload_type_code,
                   previous_cpu (optional), previous_memory (optional),
                   rolling_cpu_mean (optional), rolling_cpu_std (optional),
                   rolling_memory_mean (optional), traffic_growth (optional)
    """
    cpu = float(workload.get("current_cpu", 30.0))
    mem = float(workload.get("current_memory", 40.0))
    prev_cpu = float(workload.get("previous_cpu", cpu))
    features = {
        "current_cpu":        cpu,
        "current_memory":     mem,
        "current_io":         float(workload.get("current_io", 0.5)),
        "current_network":    float(workload.get("current_network", 0.3)),
        "previous_cpu":       prev_cpu,
        "previous_memory":    float(workload.get("previous_memory", mem)),
        "rolling_cpu_mean":   float(workload.get("rolling_cpu_mean", cpu)),
        "rolling_cpu_std":    float(workload.get("rolling_cpu_std", 2.0)),
        "rolling_memory_mean":float(workload.get("rolling_memory_mean", mem)),
        "request_rate":       float(workload.get("request_rate", 500.0)),
        "active_users":       float(workload.get("active_users", 100)),
        "traffic_growth":     float(workload.get("traffic_growth", (cpu - prev_cpu) / max(prev_cpu, 1.0))),
        "hour":               float(workload.get("hour", 12)),
        "day":                float(workload.get("day", 0)),
        "workload_type_code": float(workload.get("workload_type_code", 0)),
    }

    result = predict(features)
    result["input_features"] = features

    # Trend classification
    delta = result["predicted_cpu"] - cpu
    if delta > 10:   trend = "INCREASING"
    elif delta < -10: trend = "DECREASING"
    else:            trend = "STABLE"

    result["trend"] = trend
    result["sla_risk"] = "HIGH" if result["predicted_cpu"] > 85 else \
                         "MEDIUM" if result["predicted_cpu"] > 65 else "LOW"
    # Predicted memory: simple proportional scaling
    result["predicted_memory"] = round(mem * (result["predicted_cpu"] / max(cpu, 1.0)), 2)
    result["predicted_request_rate"] = round(workload.get("request_rate", 500.0) * \
                                             (result["predicted_cpu"] / max(cpu, 1.0)), 1)
    return result
