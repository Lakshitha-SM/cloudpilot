"""
backend/agents/pipeline.py
Full CloudPilot multi-agent pipeline orchestrator.
Measures per-stage and end-to-end latency with time.perf_counter().

Stage order:
  1. Mapping Agent      — feasibility filtering + CloudWatch integration
  2. Prediction Agent   — Random Forest workload prediction
  3. RAG Agent          — historical case retrieval
  3.5 APRDA            — Adaptive Predictive Resource Decision Algorithm
  4. Reasoning Agent    — composite decision + explanation
  5. Execution Agent    — allocation / DRY_RUN
"""
import time, uuid
from backend.agents import mapping_agent, prediction_agent, rag_agent, reasoning_agent, execution_agent
from backend.database import db


def run_pipeline(workload: dict, run_id: str = None, strategy: str = "CloudPilot") -> dict:
    """
    Execute the full multi-agent pipeline for one workload request.
    Returns a complete result dict with all agent outputs and timings.
    """
    if run_id is None:
        run_id = db.new_run(workload.get("scenario", "manual"))

    pipeline_start = time.perf_counter()
    stages = {}

    # ── Stage 1: Mapping Agent ────────────────────────────────────────────
    t = time.perf_counter()
    stages["mapping"] = mapping_agent.run(workload)
    stages["mapping"]["stage_latency_ms"] = round((time.perf_counter() - t) * 1000, 3)
    db.log_agent_event(run_id, "MappingAgent", "result", stages["mapping"])

    # Pass live CloudWatch metrics from Mapping to Prediction if in AWS mode
    cw = stages["mapping"].get("cloudwatch_metrics")
    if cw and cw.get("status") == "OK":
        current = cw.get("current", {})
        workload["current_cpu"] = current.get("cpu_utilization", workload.get("current_cpu", 0))
        workload["cloudwatch_timestamp"] = cw.get("timestamp")
        workload["cloudwatch_datapoints"] = cw.get("datapoints", {}).get("cpu_utilization", [])
        workload["data_source"] = "AWS_CLOUDWATCH"

        # Additional CloudWatch metrics
        workload["current_memory"] = current.get("memory_used_percent", workload.get("current_memory", 0))
        workload["current_disk"]   = current.get("disk_used_percent", 0)
        workload["network_receive"] = current.get("network_bytes_received", 0)
        workload["network_send"]   = current.get("network_bytes_sent", 0)
        workload["disk_read"]      = current.get("disk_read_bytes", 0)
        workload["disk_write"]     = current.get("disk_write_bytes", 0)
        workload["swap_used"]      = current.get("swap_used_percent", 0)

    # ── Stage 2: Prediction Agent ─────────────────────────────────────────
    t = time.perf_counter()
    stages["prediction"] = prediction_agent.run(workload)
    stages["prediction"]["stage_latency_ms"] = round((time.perf_counter() - t) * 1000, 3)
    db.log_prediction(run_id, {
        "input_cpu":        workload.get("current_cpu", 0),
        "input_memory":     workload.get("current_memory", 0),
        "predicted_cpu":    stages["prediction"]["predicted_cpu"],
        "predicted_memory": stages["prediction"]["predicted_memory"],
    })
    db.log_agent_event(run_id, "PredictionAgent", "result", stages["prediction"])

    # ── Stage 3: RAG Agent ────────────────────────────────────────────────
    t = time.perf_counter()
    stages["rag"] = rag_agent.run(workload, top_k=5)
    stages["rag"]["stage_latency_ms"] = round((time.perf_counter() - t) * 1000, 3)
    db.log_rag(run_id, {
        "query_cpu":    workload.get("current_cpu", 0),
        "query_memory": workload.get("current_memory", 0),
        "retrieved_cases": [
            {"case_id": c["case_id"], "similarity": c["similarity"],
             "vm": c["selected_vm"], "result": c["result"]}
            for c in stages["rag"].get("retrieved_cases", [])
        ]
    })
    db.log_agent_event(run_id, "RAGAgent", "result", stages["rag"])

    # ── Stage 3.5: APRDA ──────────────────────────────────────────────────
    # Adaptive Predictive Resource Decision Algorithm.
    # Scores all feasible resources and selects the best one before Reasoning.
    t = time.perf_counter()
    try:
        from backend.agents import aprda as aprda_module
        feasible = (stages["mapping"].get("candidates") or
                    stages["mapping"].get("feasible_candidates", []))
        stages["aprda"] = aprda_module.run(
            request=workload,
            feasible_resources=feasible,
            prediction_result=stages["prediction"],
            rag_result=stages["rag"],
        )
        # Inject APRDA decision into workload so Reasoning / Execution can read it
        if stages["aprda"].get("status") == "SUCCESS":
            workload["aprda_selected_resource"] = stages["aprda"]["selected_resource"]
            workload["aprda_decision_score"]    = stages["aprda"]["decision_score"]
            workload["aprda_workload_class"]    = stages["aprda"]["workload_class"]
            workload["aprda_ranked_resources"]  = stages["aprda"]["ranked_resources"]
    except Exception as exc:
        # APRDA errors must not break the existing pipeline
        stages["aprda"] = {
            "algorithm": "APRDA",
            "status":    "ERROR",
            "error":     str(exc),
        }
        import logging
        logging.getLogger("APRDA").error(f"APRDA stage error: {exc}", exc_info=True)

    stages["aprda"]["stage_latency_ms"] = round((time.perf_counter() - t) * 1000, 3)
    db.log_agent_event(run_id, "APRDA", "result", stages["aprda"])
    db.log_aprda_decision(run_id, stages["aprda"], workload)

    # ── Stage 4: Reasoning Agent ──────────────────────────────────────────
    t = time.perf_counter()
    stages["reasoning"] = reasoning_agent.run(
        workload, stages["mapping"], stages["prediction"], stages["rag"]
    )
    stages["reasoning"]["stage_latency_ms"] = round((time.perf_counter() - t) * 1000, 3)
    db.log_agent_event(run_id, "ReasoningAgent", "result", stages["reasoning"])

    # ── Stage 5: Execution Agent ──────────────────────────────────────────
    t = time.perf_counter()
    stages["execution"] = execution_agent.run(stages["reasoning"], workload, run_id=run_id)
    stages["execution"]["stage_latency_ms"] = round((time.perf_counter() - t) * 1000, 3)

    end_to_end_ms = (time.perf_counter() - pipeline_start) * 1000.0

    mode         = workload.get("mode", "sim")
    final_status = stages["execution"].get("status", "FAILED")
    selected_vm  = stages["execution"].get("selected_vm")
    exec_reason  = stages["execution"].get("reason") or (
        stages["reasoning"].get("reasons", [""])[0]
        if stages["reasoning"].get("reasons") else ""
    )

    stage_latencies = {
        "mapping_ms":    stages["mapping"].get("stage_latency_ms", 0.0),
        "prediction_ms": stages["prediction"].get("stage_latency_ms", 0.0),
        "rag_ms":        stages["rag"].get("stage_latency_ms", 0.0),
        "aprda_ms":      stages["aprda"].get("stage_latency_ms", 0.0),
        "reasoning_ms":  stages["reasoning"].get("stage_latency_ms", 0.0),
        "execution_ms":  stages["execution"].get("stage_latency_ms", 0.0),
        "stage_sum_ms": round(
            stages["mapping"].get("stage_latency_ms", 0.0) +
            stages["prediction"].get("stage_latency_ms", 0.0) +
            stages["rag"].get("stage_latency_ms", 0.0) +
            stages["aprda"].get("stage_latency_ms", 0.0) +
            stages["reasoning"].get("stage_latency_ms", 0.0) +
            stages["execution"].get("stage_latency_ms", 0.0),
            3
        ),
        "total_ms": round(end_to_end_ms, 3)
    }

    # Log workload, allocation, performance
    db.log_workload(run_id, workload)
    db.log_allocation(run_id, {
        "selected_vm":       selected_vm,
        "requested_cpu":     workload.get("required_cpu", 0),
        "requested_memory":  workload.get("required_mem", 0),
        "requested_io":      0,
        "available_cpu":     stages["execution"].get("available_cpu_before", 0),
        "available_memory":  stages["execution"].get("available_mem_before", 0),
        "status":            final_status,
        "execution_latency_ms": stages["execution"].get("execution_latency_ms", 0),
        "strategy":          f"{strategy} ({'AWS' if mode == 'aws_live' else 'Sim'})",
        "mode":              mode,
        "reason":            exec_reason,
    })
    db.log_performance(run_id, {
        "strategy":            strategy,
        "response_time_ms":    end_to_end_ms,
        "decision_latency_ms": end_to_end_ms,
        "sla_violation":       stages["prediction"].get("sla_risk") == "HIGH",
        "cpu_utilization":     workload.get("current_cpu", 0),
        "allocation_success":  final_status in ("SUCCESS", "DRY_RUN"),
    })
    db.log_agent_event(run_id, "ExecutionAgent", "result", stages["execution"])

    return {
        "run_id":           run_id,
        "strategy":         strategy,
        "mode":             mode,
        "end_to_end_ms":    round(end_to_end_ms, 3),
        "stage_latencies":  stage_latencies,
        "cloudwatch_metrics": cw if mode == "aws_live" else None,
        "stages":           stages,
        "final_status":     final_status,
        "selected_vm":      selected_vm,
        "target_vm":        selected_vm,
        "reason":           exec_reason,
        "aprda_result":     stages.get("aprda"),
        "db_summary":       db.get_run_summary(run_id),
    }
