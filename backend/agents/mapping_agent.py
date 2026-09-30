"""
backend/agents/mapping_agent.py
Maps workload requirements to feasible VMs (simulation) or real EC2 instances (aws_live).

Key contract with downstream agents:
  - Returns "candidates" list — reasoning_agent reads mapping_result["candidates"]
  - Each candidate contains: vm_id, available_cpu_pct, available_mem_gb,
    io, current_utilization, fit_score, cost_per_hour
"""
import time
from backend.infrastructure import vm_pool
from backend.aws.aws_client import aws_manager
from backend.aws.ec2_adapter import ec2_adapter
from backend.aws.cloudwatch_adapter import cloudwatch_adapter

# t3.micro instance type specs (vCPU / GiB RAM) — used when instance type is known
_INSTANCE_TYPE_SPECS = {
    "t3.nano":    {"vcpu": 2,  "memory_gb": 0.5},
    "t3.micro":   {"vcpu": 2,  "memory_gb": 1.0},
    "t3.small":   {"vcpu": 2,  "memory_gb": 2.0},
    "t3.medium":  {"vcpu": 2,  "memory_gb": 4.0},
    "t3.large":   {"vcpu": 2,  "memory_gb": 8.0},
    "t3.xlarge":  {"vcpu": 4,  "memory_gb": 16.0},
    "t3.2xlarge": {"vcpu": 8,  "memory_gb": 32.0},
    "t2.nano":    {"vcpu": 1,  "memory_gb": 0.5},
    "t2.micro":   {"vcpu": 1,  "memory_gb": 1.0},
    "t2.small":   {"vcpu": 1,  "memory_gb": 2.0},
    "t2.medium":  {"vcpu": 2,  "memory_gb": 4.0},
    "t2.large":   {"vcpu": 2,  "memory_gb": 8.0},
    "t2.xlarge":  {"vcpu": 4,  "memory_gb": 16.0},
    "m5.large":   {"vcpu": 2,  "memory_gb": 8.0},
    "m5.xlarge":  {"vcpu": 4,  "memory_gb": 16.0},
    "m5.2xlarge": {"vcpu": 8,  "memory_gb": 32.0},
    "c5.large":   {"vcpu": 2,  "memory_gb": 4.0},
    "c5.xlarge":  {"vcpu": 4,  "memory_gb": 8.0},
}

def _tag_value(tags: list, key: str) -> str:
    """Extract a tag value from an AWS tag list."""
    for t in tags or []:
        if t.get("Key") == key:
            return t.get("Value", "")
    return ""

def _normalize_aws_candidate(inst: dict, cw_metrics: dict = None) -> dict:
    """
    Convert a raw EC2 instance dict from ec2_adapter into the candidate format
    expected by reasoning_agent (and all downstream agents).
    Integrates real AWS CloudWatch CPU utilization if available.
    """
    instance_type = inst.get("type", "unknown")
    specs = _INSTANCE_TYPE_SPECS.get(instance_type, {"vcpu": 2, "memory_gb": 1.0})

    name = _tag_value(inst.get("tags", []), "Name") or inst.get("id")

    # CloudWatch live metrics integration
    current_cpu = 0.0
    cw_status = "NO_DATA"
    cw_ts = None
    cw_data_source = "AWS_EC2_CONFIG"

    if cw_metrics and cw_metrics.get("status") == "OK":
        current = cw_metrics.get("current", {})
        current_cpu = float(current.get("cpu_utilization") or 0.0)
        cw_status = "OK"
        cw_ts = cw_metrics.get("timestamp")
        cw_data_source = "AWS_CLOUDWATCH"

    available_cpu = round(max(0.0, 100.0 - current_cpu), 2)

    return {
        # Identity
        "vm_id":            inst.get("id"),
        "name":             name,
        "instance_type":    instance_type,
        "state":            inst.get("state", "unknown"),
        "az":               inst.get("az", ""),
        "tags":             inst.get("tags", []),
        "is_aws":           True,

        # Capacity
        "available_cpu_pct":  available_cpu,
        "available_mem_gb":   float(specs["memory_gb"]),
        "vcpu":               specs["vcpu"],

        # Live CloudWatch utilization
        "current_utilization": round(current_cpu, 4),
        "data_source":        cw_data_source,
        "cloudwatch_status":  cw_status,
        "cloudwatch_timestamp": cw_ts,
        "cloudwatch_metrics": cw_metrics,

        # IO & Network
        "io": "High",
        "network_gbps": 5.0,

        # Cost — t3.micro on-demand us-east-1 ~$0.0104/hr
        "cost_per_hour": 0.0104 if instance_type == "t3.micro" else 0.05,

        # Fit score initialized
        "fit_score": 0.0,
    }

def run(workload: dict) -> dict:
    t0 = time.perf_counter()

    mode = workload.get("mode", "sim")

    # ── Parse resource requirements ─────────────────────────────────────────
    # required_vcpu  → exact vCPU count from the UI dropdown (preferred)
    # required_cpu   → also vCPU count (same field, legacy name kept for compat)
    # NEVER multiply these by 10 or any other factor.
    req_vcpu   = float(workload.get("required_vcpu") or workload.get("required_cpu") or 0)
    req_mem_gb = float(workload.get("required_mem", 0))   # exact GB from UI

    # In AWS mode, req_cpu is ALWAYS treated as the vCPU count (not a percentage).
    # The > 32 threshold check below is only for simulation % headroom (legacy).
    req_cpu_pct = 0.0   # Only set for sim % headroom (>32), not used in AWS mode

    print(f"\n[MappingAgent] REQUEST RECEIVED:")
    print(f"  required_vcpu={req_vcpu}  required_mem={req_mem_gb} GB  mode={mode}")

    cloudwatch_summary = None

    # ── Gather resource pool ──────────────────────────────────────────────────
    if mode == "aws_live":
        raw_instances = ec2_adapter.discover_instances()

        all_vms = []
        for inst in raw_instances:
            # Query CloudWatch CPUUtilization for this instance
            cw = cloudwatch_adapter.get_metrics(inst["id"], inst.get("type", "t3.micro"))
            if not cloudwatch_summary and cw.get("status") == "OK":
                cloudwatch_summary = cw
            all_vms.append(_normalize_aws_candidate(inst, cw))

    else:
        # Simulation mode — use in-process vm_pool
        # In sim mode, required_cpu may be a % headroom value (legacy behaviour)
        req_cpu_pct = float(workload.get("required_cpu", 0))
        raw_sim = vm_pool.get_all_vms()
        all_vms = []
        for v in raw_sim:
            all_vms.append({
                "vm_id":              v["id"],
                "name":               v["id"],
                "instance_type":      None,
                "state":              "running",
                "az":                 "",
                "is_aws":             False,
                "available_cpu_pct":  v["available_cpu_pct"],
                "available_mem_gb":   v["available_mem_gb"],
                "vcpu":               v["vcpu"],
                "current_utilization": v["used_cpu_pct"],
                "io":                 v["io"],
                "network_gbps":       v.get("network_gbps", 1.0),
                "cost_per_hour":      v["cost_per_hour"],
                "fit_score":          0.0,
            })

    # ── Feasibility filter ───────────────────────────────────────────────────
    feasible = []
    rejected = []
    for vm in all_vms:
        # Skip non-running AWS instances
        if mode == "aws_live" and vm.get("state") != "running":
            rejected.append({"vm_id": vm["vm_id"], "reason": f"state={vm['state']} (not running)"})
            continue

        avail_cpu_pct = float(vm["available_cpu_pct"])
        avail_mem_gb  = float(vm["available_mem_gb"])
        inst_vcpu     = float(vm.get("vcpu", 2))

        reason_parts = []

        if mode == "aws_live":
            # ── AWS mode: compare vCPU and memory against real EC2 capacity ──
            print(f"[MappingAgent] AWS CAPACITY CHECK for {vm['vm_id']}:")
            print(f"  requested_vcpu={req_vcpu}  instance_vcpu={inst_vcpu}")
            print(f"  requested_mem={req_mem_gb} GB  instance_mem={avail_mem_gb} GB")

            if req_vcpu > 0 and inst_vcpu < req_vcpu:
                reason_parts.append(
                    f"CPU: needs {req_vcpu:.0f} vCPU, instance has {inst_vcpu:.0f} vCPU"
                )
            if req_mem_gb > 0 and avail_mem_gb < req_mem_gb:
                reason_parts.append(
                    f"Memory: needs {req_mem_gb:.1f} GB, instance has {avail_mem_gb:.1f} GB"
                )
        else:
            # ── Simulation mode: vCPU check + optional % headroom check ──────
            if req_vcpu > 0 and inst_vcpu < req_vcpu:
                reason_parts.append(
                    f"CPU: needs {req_vcpu:.0f} vCPU, vm has {inst_vcpu:.0f} vCPU"
                )
            if req_mem_gb > 0 and avail_mem_gb < req_mem_gb:
                reason_parts.append(
                    f"Memory: needs {req_mem_gb:.1f} GB, vm has {avail_mem_gb:.1f} GB"
                )
            # Legacy % headroom check (only applies when req_cpu_pct > 32 in sim)
            if req_cpu_pct > 32 and avail_cpu_pct < req_cpu_pct:
                reason_parts.append(
                    f"CPU headroom: needs {req_cpu_pct:.1f}%, vm has {avail_cpu_pct:.1f}%"
                )

        if not reason_parts:
            cpu_margin = inst_vcpu - req_vcpu if req_vcpu > 0 else max(0, avail_cpu_pct - req_cpu_pct)
            mem_margin = avail_mem_gb - req_mem_gb
            vm["fit_score"] = round(cpu_margin + mem_margin, 2)
            feasible.append(vm)
            if mode == "aws_live":
                print(f"  -> FEASIBLE  fit_score={vm['fit_score']}")
        else:
            rejected.append({"vm_id": vm["vm_id"], "reason": ", ".join(reason_parts)})
            if mode == "aws_live":
                print(f"  -> REJECTED  reason={', '.join(reason_parts)}")

    feasible.sort(key=lambda x: x.get("fit_score", 0), reverse=True)

    if mode == "aws_live":
        print(f"[MappingAgent] RESULT: {len(feasible)} feasible, {len(rejected)} rejected\n")

    latency_ms = round((time.perf_counter() - t0) * 1000, 3)

    return {
        "agent":             "MappingAgent",
        "mode":              mode,
        "candidates_found":  len(all_vms),
        "feasible_count":    len(feasible),
        # "candidates" — key read by reasoning_agent and pipeline
        "candidates":        feasible,
        # "feasible_candidates" — kept for backward compatibility / API responses
        "feasible_candidates": feasible,
        "rejected":          rejected,
        "cloudwatch_metrics": cloudwatch_summary,
        "latency_ms":        latency_ms,
    }
