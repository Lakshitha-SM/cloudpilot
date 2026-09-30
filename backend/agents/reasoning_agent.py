"""
backend/agents/reasoning_agent.py
Composite scoring over candidate VMs using workload prediction + RAG context.
Produces a final VM decision with detailed explanation.

Expected mapping_result keys (from mapping_agent.run()):
    candidates: list of VM dicts with fields:
        vm_id, available_cpu_pct, available_mem_gb, io,
        current_utilization, fit_score, cost_per_hour
"""
import time

def run(
    workload: dict,
    mapping_result: dict,
    prediction_result: dict,
    rag_result: dict,
) -> dict:
    t0 = time.perf_counter()

    mode = workload.get("mode", "sim")

    # Read candidates — mapping_agent returns "candidates" and "feasible_candidates"
    candidates = mapping_result.get("candidates") or mapping_result.get("feasible_candidates", [])

    predicted_cpu = prediction_result.get("predicted_cpu", 50.0)
    sla_risk      = prediction_result.get("sla_risk", "MEDIUM")
    trend         = prediction_result.get("trend", "STABLE")
    rag_vm        = rag_result.get("suggested_vm")
    retrieved     = rag_result.get("retrieved_cases", [])
    top_rag_sim   = retrieved[0]["similarity"] if retrieved else 0.0

    evidence = {
        "current_cpu": workload.get("current_cpu", "N/A"),
        "current_memory": workload.get("current_memory", "N/A"),
        "current_disk": workload.get("current_disk", "N/A"),
        "network_receive": workload.get("network_receive", "N/A"),
        "network_send": workload.get("network_send", "N/A"),
        "predicted_demand": predicted_cpu,
        "historical_context": rag_vm if rag_vm else "none"
    }

    if not candidates:
        elapsed = (time.perf_counter() - t0) * 1000.0

        req_vcpu   = float(workload.get("required_vcpu") or workload.get("required_cpu", 0))
        req_mem_gb = float(workload.get("required_mem", 0))

        # Build a detailed AWS explanation for viva/demo
        if mode == "aws_live":
            rejected = mapping_result.get("rejected", [])
            rej_details = []
            for r in rejected:
                rej_details.append(f"{r['vm_id']}: {r['reason']}")
            rej_str = " | ".join(rej_details) if rej_details else "instance capacity insufficient"

            reason_msg = (
                f"The requested workload requires {req_vcpu:.0f} vCPU and {req_mem_gb:.1f} GB memory. "
                f"The currently discovered CloudPilot-managed AWS instance(s) do not satisfy these requirements "
                f"({rej_str}). "
                f"No currently available AWS resource can fulfill this request. "
                f"CloudPilot is operating in READ_ONLY / DRY_RUN mode — no EC2 instance will be modified, "
                f"created, terminated, or resized."
            )
        else:
            reason_msg = "No candidate VMs found — all VMs are overloaded, underprovisioned, or not running."

        return {
            "agent": "ReasoningAgent",
            "mode": mode,
            "decision": "NO_FEASIBLE_RESOURCE",
            "action": "none",
            "selected_vm": None,
            "target_vm": None,
            "score": 0.0,
            "reasons": [reason_msg],
            "reasoning": reason_msg,
            "evidence": evidence,
            "candidates_evaluated": 0,
            "latency_ms": round(elapsed, 3),
        }

    scored = []
    for vm in candidates:
        # Resilient field reads — support both aws_live and sim candidate formats
        vm_id        = vm.get("vm_id") or vm.get("id") or "unknown"
        avail_cpu    = float(vm.get("available_cpu_pct") or vm.get("available_cpu", 0))
        avail_mem    = float(vm.get("available_mem_gb") or vm.get("available_memory", 0))
        io           = vm.get("io", "Medium")
        utilization  = float(vm.get("current_utilization") or vm.get("used_cpu_pct", 0))
        fit          = float(vm.get("fit_score", 0)) / max(avail_cpu + avail_mem, 1.0)
        cost         = float(vm.get("cost_per_hour", 0.10))

        cpu_margin  = max(0.0, avail_cpu - predicted_cpu) / 100.0
        cost_inv    = 1.0 - min(cost / 0.50, 1.0)   # normalise to $0.50/h max
        rag_bonus   = 0.2 if vm_id == rag_vm else 0.0

        # Boost high-headroom VMs when SLA risk is HIGH or trend increasing
        if sla_risk == "HIGH":
            cpu_margin *= 1.5
        if trend == "INCREASING":
            fit *= 1.2

        composite = (0.30 * fit) + (0.30 * min(cpu_margin, 1.0)) + (0.20 * cost_inv) + rag_bonus
        scored.append((composite, vm_id, vm, avail_cpu, avail_mem))

    scored.sort(key=lambda x: x[0], reverse=True)
    best_score, best_vm_id, best_vm, best_cpu, best_mem = scored[0]

    reasons = []
    reasons.append(
        f"CPU requirement: {workload.get('required_cpu', 30):.1f}% — "
        f"{best_vm_id} has {best_cpu:.1f}% available"
    )
    reasons.append(
        f"Memory requirement: {workload.get('required_mem', 4):.1f} GB — "
        f"{best_vm_id} has {best_mem:.1f} GB available"
    )
    reasons.append(f"I/O class: {best_vm.get('io', 'N/A')} satisfies workload requirement")
    reasons.append(
        f"Predicted future CPU: {predicted_cpu:.1f}% — trend {trend} — SLA risk {sla_risk}"
    )
    if rag_vm == best_vm_id:
        reasons.append(
            f"RAG historical evidence: similar workloads successfully allocated to "
            f"{rag_vm} (top similarity: {top_rag_sim:.3f})"
        )
    elif rag_vm:
        reasons.append(
            f"RAG suggested {rag_vm} but {best_vm_id} scored higher on composite "
            f"fit ({best_score:.3f})"
        )
    reasons.append(
        f"Cost efficiency: ${best_vm.get('cost_per_hour', 0):.4f}/hr — "
        f"composite decision score: {best_score:.3f}"
    )
    if mode == "aws_live":
        reasons.append(
            f"AWS READ_ONLY mode: decision generated, no EC2 mutation will occur"
        )

    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    reasoning_str = " | ".join(reasons)

    return {
        "agent": "ReasoningAgent",
        "mode": mode,
        "decision": "ALLOCATE",
        "reasoning": reasoning_str,
        "evidence": evidence,
        # Provide both key names for execution_agent resilience
        "action": "allocate",
        "selected_vm": best_vm_id,
        "target_vm": best_vm_id,
        "score": round(best_score, 4),
        "reasons": reasons,
        "predicted_cpu": predicted_cpu,
        "sla_risk": sla_risk,
        "trend": trend,
        "rag_suggested_vm": rag_vm,
        "rag_top_similarity": round(top_rag_sim, 4),
        "candidates_evaluated": len(candidates),
        "vm_details": best_vm,
        "latency_ms": round(elapsed_ms, 3),
    }
