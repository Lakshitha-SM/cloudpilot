"""
backend/server.py
CloudPilot FastAPI backend — port 8000
All routes return real computed data. No hardcoded metrics.
"""
import sys, os, json, time, asyncio
from datetime import datetime, timezone
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


from backend.aws.aws_client import aws_manager
from backend.aws.ec2_adapter import ec2_adapter
from backend.aws.cloudwatch_adapter import cloudwatch_adapter
from backend.workload.traffic_generator import traffic_generator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from backend.agents import pipeline
from backend.agents import mapping_agent, prediction_agent, rag_agent, reasoning_agent, execution_agent
from backend.baseline import reactive
from backend.infrastructure import vm_pool
from backend.database import db
from backend.workload import generator
from backend.ml.predictor import get_metadata
from backend.mobile_api import mobile_router

app = FastAPI(title="CloudPilot API", version="1.0.0")

app.include_router(mobile_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Models ────────────────────────────────────────────────────────────────────
class WorkloadRequest(BaseModel):
    scenario: str = "normal"
    current_cpu: float = 35.0
    current_memory: float = 42.0
    current_io: float = 0.8
    current_network: float = 0.4
    request_rate: float = 500.0
    active_users: int = 200
    workload_type: str = "E-Commerce"
    workload_type_code: int = 1
    workload_intensity: str = "Normal"
    required_cpu: float = 30.0
    required_vcpu: Optional[float] = None
    required_mem: float = 4.0
    required_io: str = "Medium"
    required_net: float = 0.5
    previous_cpu: float = 30.0
    rolling_cpu_mean: float = 33.0
    rolling_cpu_std: float = 3.5
    rolling_memory_mean: float = 40.0
    traffic_growth: float = 0.05
    hour: int = 14
    day: int = 1
    mode: str = 'sim'

# ── Health ────────────────────────────────────────────────────────────────────

# --- AWS Integration Endpoints ---

@app.get("/api/aws/status")
def get_aws_status():
    return aws_manager.check_connection()

@app.get("/api/aws/instances")
def get_aws_instances():
    instances = ec2_adapter.discover_instances()
    return {"instances": instances, "mode": aws_manager.mode, "region": aws_manager.region}

@app.get("/api/aws/metrics/{instance_id}")
def get_aws_metrics(instance_id: str):
    return cloudwatch_adapter.get_metrics(instance_id)

@app.post("/api/aws/workload/start")
def start_aws_workload(target_url: str, scenario: str = "normal"):
    traffic_generator.start(target_url, scenario)
    return {"status": "started", "target": target_url, "scenario": scenario}

@app.post("/api/aws/workload/stop")
def stop_aws_workload():
    traffic_generator.stop()
    return {"status": "stopped"}

@app.get("/api/aws/workload/live")
def get_aws_workload_live():
    return traffic_generator.stats

# --- End AWS Integration Endpoints ---


@app.get("/")
@app.get("/api")
def root():
    return {
        "status": "ok",
        "service": "CloudPilot Core Backend API",
        "version": "1.0.0",
        "health": "/api/health",
        "docs": "/docs",
        "openapi": "/openapi.json"
    }

@app.get("/api/version")
@app.get("/api/version/")
def api_version():
    return {
        "status": "ok",
        "version": "1.0.0",
        "name": "CloudPilot Core Backend",
        "environment": os.environ.get("ENVIRONMENT", "development"),
        "timestamp": datetime.now(timezone.utc).isoformat() if "timezone" in globals() else time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

@app.get("/health")
@app.get("/health/")
@app.get("/api/health")
@app.get("/api/health/")
def health():
    return {
        "status": "ok",
        "service": "CloudPilot Core API",
        "version": "1.0.0",
        "environment": os.environ.get("ENVIRONMENT", "production"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

@app.get("/api/system/status")
def system_status():
    t0 = time.perf_counter()
    backend_status = {
        "status": "CONNECTED",
        "name": "CloudPilot Core API",
        "version": "1.0.0",
        "uptime": "online"
    }

    # Database
    try:
        counts = db.get_table_counts()
        db_status = {"status": "CONNECTED", "tables": counts, "path": db.DB_PATH}
    except Exception as e:
        db_status = {"status": "UNAVAILABLE", "error": str(e)}

    # AWS
    try:
        aws_info = aws_manager.check_connection()
        aws_conn = aws_info.get("status") == "CONNECTED"
        aws_status = {
            "status": "CONNECTED" if aws_conn else ("NOT CONFIGURED" if "not found" in str(aws_info.get("error", "")).lower() else "UNAVAILABLE"),
            "region": aws_info.get("region", "us-east-1"),
            "mode": aws_info.get("mode", "READ_ONLY"),
            "read_only": True,
            "error": aws_info.get("error")
        }
    except Exception as e:
        aws_status = {"status": "UNAVAILABLE", "error": str(e)}

    # CloudWatch
    if aws_status["status"] == "CONNECTED":
        cw_status = {"status": "CONNECTED", "namespace": "AWS/EC2", "monitoring": "Active"}
    else:
        cw_status = {"status": "NOT CONFIGURED", "message": "CloudWatch requires active AWS credentials"}

    # EC2 Resources
    if aws_status["status"] == "CONNECTED":
        try:
            instances = ec2_adapter.discover_instances()
            ec2_status = {"status": "CONNECTED", "count": len(instances)}
        except Exception as e:
            ec2_status = {"status": "UNAVAILABLE", "error": str(e)}
    else:
        ec2_status = {"status": "NOT CONFIGURED", "message": "EC2 integration inactive (Simulation Mode available)"}

    # Prediction Model
    try:
        meta = get_metadata()
        pred_status = {
            "status": "CONNECTED",
            "model_name": meta.get("model_name", "RandomForestRegressor"),
            "metrics": meta.get("metrics", {}),
            "hyperparameters": meta.get("hyperparameters", {}),
            "prediction_horizon": meta.get("prediction_horizon", "~10 min")
        }
    except Exception as e:
        pred_status = {"status": "UNAVAILABLE", "error": str(e)}

    # RAG Knowledge Base
    try:
        from backend.agents import rag_agent
        rag_agent._load_cases()
        rag_status = {
            "status": "CONNECTED",
            "case_base_size": len(rag_agent._cases),
            "vector_index": "Bitbrains FastStorage Knowledge Base"
        }
    except Exception as e:
        rag_status = {"status": "UNAVAILABLE", "error": str(e)}

    # Reasoning Agent
    try:
        from backend.agents import reasoning_agent
        reasoning_status = {"status": "CONNECTED", "engine": "Heuristic Multi-Criteria Policy Engine"}
    except Exception as e:
        reasoning_status = {"status": "UNAVAILABLE", "error": str(e)}

    # APRDA Engine
    try:
        from backend.agents import aprda as aprda_module
        aprda_status = {
            "status": "CONNECTED",
            "algorithm": "Adaptive Predictive Resource Decision Algorithm",
            "default_weights": aprda_module._load_config().get("weights", {}).get("NORMAL", {})
        }
    except Exception as e:
        aprda_status = {"status": "UNAVAILABLE", "error": str(e)}

    # Rewards Service
    try:
        with db._conn() as con:
            user_cnt = con.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        rewards_status = {"status": "CONNECTED", "registered_users": user_cnt}
    except Exception as e:
        rewards_status = {"status": "UNAVAILABLE", "error": str(e)}

    latency_ms = round((time.perf_counter() - t0) * 1000.0, 2)
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat() if "timezone" in globals() else time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "latency_ms": latency_ms,
        "services": {
            "backend": backend_status,
            "database": db_status,
            "aws": aws_status,
            "cloudwatch": cw_status,
            "ec2": ec2_status,
            "prediction": pred_status,
            "rag": rag_status,
            "reasoning": reasoning_status,
            "aprda": aprda_status,
            "rewards": rewards_status,
        }
    }

# ── Model metadata ─────────────────────────────────────────────────────────────
@app.get("/api/model/metadata")
def model_metadata():
    try:
        return get_metadata()
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))

# ── VM Pool ───────────────────────────────────────────────────────────────────
@app.get("/api/vms")
def get_vms():
    return {"vms": vm_pool.get_all_vms()}

@app.post("/api/vms/reset")
def reset_vms():
    vm_pool.reset_all()
    return {"status": "reset", "vms": vm_pool.get_all_vms()}

# ── Workload generation ───────────────────────────────────────────────────────
@app.get("/api/workload/generate")
def gen_workload(scenario: str = "normal", step: int = 0):
    wl = generator.generate_single(scenario, step)
    return wl

@app.get("/api/workload/flash-sale-sequence")
def flash_sale_sequence(steps: int = 10):
    return {"steps": generator.generate_flash_sale_sequence(steps)}

# ── Individual agents ─────────────────────────────────────────────────────────
@app.post("/api/agents/mapping")
def run_mapping(req: WorkloadRequest):
    return mapping_agent.run(req.model_dump())

@app.post("/api/agents/prediction")
def run_prediction(req: WorkloadRequest):
    return prediction_agent.run(req.model_dump())

@app.post("/api/agents/rag")
def run_rag(req: WorkloadRequest, top_k: int = 5):
    return rag_agent.run(req.model_dump(), top_k=top_k)


@app.post("/api/agents/reasoning")
def run_reasoning(req: WorkloadRequest):
    wl   = req.model_dump()
    mapp = mapping_agent.run(wl)
    pred = prediction_agent.run(wl)
    rag  = rag_agent.run(wl)
    return reasoning_agent.run(wl, mapp, pred, rag)

@app.post("/api/agents/aprda")
def run_aprda(req: WorkloadRequest):
    wl   = req.model_dump()
    mapp = mapping_agent.run(wl)
    pred = prediction_agent.run(wl)
    rag  = rag_agent.run(wl)
    
    from backend.agents import aprda as aprda_module
    feasible = mapp.get("candidates") or mapp.get("feasible_candidates", [])
    
    return aprda_module.run(
        request=wl,
        feasible_resources=feasible,
        prediction_result=pred,
        rag_result=rag
    )
@app.post("/api/pipeline")
def run_full_pipeline(req: WorkloadRequest):
    wl = req.model_dump()
    run_id = db.new_run(wl.get("scenario", "manual"))
    result = pipeline.run_pipeline(wl, run_id=run_id, strategy="CloudPilot")
    return result

# ── Reactive baseline ─────────────────────────────────────────────────────────
@app.post("/api/baseline/reactive")
def run_reactive(req: WorkloadRequest):
    wl = req.model_dump()
    run_id = db.new_run("reactive-baseline")
    return reactive.run(wl, run_id=run_id)

# ── Comparison: CloudPilot vs Reactive on same workload ──────────────────────
@app.post("/api/compare")
def compare(req: WorkloadRequest):
    wl = req.model_dump()
    # Reset VM pool for fair comparison
    vm_pool.reset_all()
    run_cp = db.new_run("comparison-cloudpilot")
    cp_result = pipeline.run_pipeline(wl, run_id=run_cp, strategy="CloudPilot")

    vm_pool.reset_all()
    run_rx = db.new_run("comparison-reactive")
    rx_result = reactive.run(wl, run_id=run_rx)

    return {
        "cloudpilot": cp_result,
        "reactive": rx_result,
        "comparison": {
            "cloudpilot_status": cp_result.get("final_status"),
            "reactive_status": rx_result.get("status"),
            "cloudpilot_vm": cp_result.get("selected_vm"),
            "reactive_vm": rx_result.get("selected_vm"),
            "cloudpilot_latency_ms": cp_result.get("end_to_end_ms"),
            "reactive_response_ms": rx_result.get("response_time_ms"),
            "cloudpilot_uses_prediction": True,
            "cloudpilot_uses_rag": True,
            "reactive_uses_prediction": False,
            "reactive_threshold_pct": 80.0,
        }
    }

# ── Flash sale scenario ───────────────────────────────────────────────────────
@app.post("/api/scenarios/flash-sale")
def flash_sale(steps: int = 8):
    run_id = db.new_run("flash_sale")
    sequence = generator.generate_flash_sale_sequence(steps)
    results  = []
    vm_pool.reset_all()
    for wl in sequence:
        r = pipeline.run_pipeline(wl, run_id=run_id, strategy="CloudPilot")
        results.append({
            "step": wl["step"],
            "current_cpu": wl["current_cpu"],
            "workload_intensity": wl["workload_intensity"],
            "predicted_cpu": r["stages"]["prediction"]["predicted_cpu"],
            "selected_vm": r.get("selected_vm"),
            "status": r.get("final_status"),
            "latency_ms": r.get("end_to_end_ms"),
        })
    return {"run_id": run_id, "scenario": "flash_sale", "steps": results}

# ── Database ──────────────────────────────────────────────────────────────────
@app.get("/api/db/summary")
def db_summary():
    return {
        "table_counts": db.get_table_counts(),
        "recent_allocations": db.get_recent_allocations(10),
    }

@app.get("/api/db/allocations")
def db_allocations(limit: int = 20):
    return {"allocations": db.get_recent_allocations(limit)}

@app.get("/api/db/aprda_decisions")
def db_aprda_decisions(limit: int = 20):
    return {"aprda_decisions": db.get_recent_aprda_decisions(limit)}

# ── SSE live stream ───────────────────────────────────────────────────────────
@app.get("/api/stream/workload")
async def stream_workload(scenario: str = "normal"):
    """Server-Sent Events: streams live workload metrics every 2 seconds."""
    async def event_generator():
        step = 0
        while True:
            wl = generator.generate_single(scenario, step)
            data = json.dumps(wl)
            yield f"data: {data}\n\n"
            step += 1
            await asyncio.sleep(2.0)
    return StreamingResponse(event_generator(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("backend.server:app", host="0.0.0.0", port=port, reload=False)

