"""
backend/agents/prediction_agent.py
Wraps ML predictor and adds SLA risk, trend, and workload-type detection.
Distinguishes between AWS_CLOUDWATCH and SIMULATION data sources.
"""
import time
from backend.ml.predictor import predict_from_workload, get_metadata

def run(workload: dict) -> dict:
    t0 = time.perf_counter()

    mode = workload.get("mode", "sim")
    is_aws = (mode == "aws_live")
    data_source = "AWS_CLOUDWATCH" if is_aws else "SIMULATION"

    # If CloudWatch series points are provided in AWS mode, construct features from real observations
    cw_pts = workload.get("cloudwatch_datapoints", [])
    if is_aws and cw_pts:
        values = [p["value"] for p in cw_pts]
        workload["current_cpu"] = values[0]
        if len(values) > 1:
            workload["previous_cpu"] = values[1]
        workload["rolling_cpu_mean"] = round(sum(values) / len(values), 4)
        workload["rolling_cpu_std"] = round(float(((sum((x - workload["rolling_cpu_mean"])**2 for x in values) / len(values)))**0.5), 4)

    result = predict_from_workload(workload)
    meta   = get_metadata()

    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    return {
        "agent": "PredictionAgent",
        "data_source": data_source,
        "input_source": data_source,
        "current_cpu": round(float(workload.get("current_cpu", 0)), 4),
        "cloudwatch_timestamp": workload.get("cloudwatch_timestamp"),
        "model": meta.get("model_name", "RandomForestRegressor"),
        "model_metrics": meta.get("metrics", {}),
        "prediction_horizon": meta.get("prediction_horizon", "~10 min"),
        "input_features": result["input_features"],
        "predicted_cpu": result["predicted_cpu"],
        "predicted_memory": result["predicted_memory"],
        "predicted_request_rate": result["predicted_request_rate"],
        "confidence_low": result["confidence_low"],
        "confidence_high": result["confidence_high"],
        "std": result["std"],
        "trend": result["trend"],
        "sla_risk": result["sla_risk"],
        "inference_time_ms": result["inference_time_ms"],
        "latency_ms": round(elapsed_ms, 3),
    }
