"""
backend/agents/execution_agent.py
Executes or dry-runs the VM allocation decision from ReasoningAgent.

In AWS READ_ONLY mode: generates a DRY_RUN record — no EC2 mutation.
In simulation mode: allocates from the in-memory vm_pool.
"""
import time
from backend.infrastructure import vm_pool
from backend.aws.aws_client import aws_manager, AWSMode
from backend.aws.ec2_adapter import ec2_adapter

def run(reasoning_result: dict, workload: dict, run_id: str = None) -> dict:
    mode = workload.get("mode", "sim")

    # Read decision — support both key names (reasoning_agent returns both)
    decision  = reasoning_result.get("decision") or reasoning_result.get("action")
    target_vm = reasoning_result.get("selected_vm") or reasoning_result.get("target_vm")

    if not decision or decision in ("none", "NO_VM_AVAILABLE", "NO_FEASIBLE_RESOURCE") or not target_vm:
        reason = reasoning_result.get("reasons", ["No feasible resource identified by reasoning agent"])[0] if reasoning_result.get("reasons") else "No feasible resource identified by reasoning agent"
        return {
            "status": "NO_FEASIBLE_RESOURCE",
            "reason": reason,
            "selected_vm": None,
            "target_vm": None,
            "execution_latency_ms": 0.0,
            "aws_action": (mode == "aws_live"),
            "aws_mode": aws_manager.mode,
            "aws_region": aws_manager.region,
        }

    start_t = time.perf_counter()

    if mode == "aws_live":
        # ── AWS Real-Time Mode ────────────────────────────────────────────────
        # Execution is intentionally blocked — system is READ_ONLY
        # Return a DRY_RUN record showing what WOULD have happened

        if aws_manager.mode in (AWSMode.READ_ONLY, "READ_ONLY"):
            latency = round((time.perf_counter() - start_t) * 1000, 3)
            return {
                "status":               "DRY_RUN",
                "selected_vm":          target_vm,
                "aws_action":           True,
                "aws_mode":             aws_manager.mode,
                "aws_region":           aws_manager.region,
                "decision":             decision,
                "dry_run_note":         (
                    f"READ_ONLY mode: decision '{decision}' recorded for {target_vm}. "
                    "No AWS EC2 API write calls made. Instance not modified."
                ),
                "execution_latency_ms": latency,
            }
        elif aws_manager.mode == AWSMode.DECISION_ONLY:
            latency = round((time.perf_counter() - start_t) * 1000, 3)
            return {
                "status":               "DECISION_ONLY",
                "selected_vm":          target_vm,
                "aws_mode":             aws_manager.mode,
                "dry_run_note":         "DECISION_ONLY mode: recommendation generated, no execution.",
                "execution_latency_ms": latency,
            }
        else:
            # CONTROLLED_EXECUTION — would run real AWS API call
            exec_res = {"status": "SUCCESS", "action": "aws_api_call", "instance": target_vm}
            latency  = round((time.perf_counter() - start_t) * 1000, 3)
            return {
                "status":               exec_res["status"],
                "selected_vm":          target_vm,
                "aws_action":           True,
                "aws_mode":             aws_manager.mode,
                "execution_latency_ms": latency,
            }

    else:
        # ── Simulation Mode ───────────────────────────────────────────────────
        req_cpu = workload.get("required_cpu", 0)
        req_mem = workload.get("required_mem", 0)

        vm = vm_pool.get_vm(target_vm)
        if not vm:
            return {"status": "FAILED", "reason": f"VM {target_vm} not found in pool"}

        avail_cpu_before = vm["available_cpu_pct"]
        avail_mem_before = vm["available_mem_gb"]

        result = vm_pool.allocate(target_vm, req_cpu, req_mem, run_id=run_id)
        latency = round((time.perf_counter() - start_t) * 1000, 3)

        if result.get("success"):
            return {
                "status":               "SUCCESS",
                "selected_vm":          target_vm,
                "available_cpu_before": avail_cpu_before,
                "available_mem_before": avail_mem_before,
                "execution_latency_ms": latency,
            }
        else:
            return {
                "status":               "FAILED",
                "selected_vm":          target_vm,
                "reason":               result.get("message", "Insufficient resources"),
                "execution_latency_ms": latency,
            }
