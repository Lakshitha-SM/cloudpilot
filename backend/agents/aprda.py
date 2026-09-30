"""
backend/agents/aprda.py
=======================
Adaptive Predictive Resource Decision Algorithm (APRDA)
--------------------------------------------------------
CloudPilot-specific resource-selection algorithm that combines outputs from:
  - Mapping Agent     (feasible resource pool + hard-constraint filtering)
  - Prediction Agent  (Random Forest workload prediction)
  - RAG Agent         (historical similarity via cosine search)

APRDA answers:
  "Among the feasible resources, which is the most suitable for the current
   application request considering current state, future workload, historical
   context, SLA requirements and efficiency?"

This is a project-specific decision algorithm, NOT a new machine-learning
model.  Random Forest remains the existing workload prediction algorithm;
APRDA is the downstream resource-selection scoring layer.

Complexity:
  Feasibility filtering : O(N)   — done by MappingAgent before APRDA
  Factor calculation    : O(N*K) — N resources × K=6 factors
  Ranking               : O(N log N)
  Overall APRDA core    : O(N*K + N log N)

(Random Forest inference, RAG retrieval, and AWS API latency are external
 to APRDA and are not included in its complexity.)

Author: CloudPilot team
"""

import time
import logging
import os
import math
from typing import Optional

logger = logging.getLogger("APRDA")

# ---------------------------------------------------------------------------
# Configuration loader
# ---------------------------------------------------------------------------

def _load_config() -> dict:
    """Load decision_weights.yaml from config/ directory."""
    base = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    cfg_path = os.path.join(base, "config", "decision_weights.yaml")
    try:
        import yaml
        with open(cfg_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
    except ImportError:
        # PyYAML not available — use hardcoded defaults
        logger.warning("PyYAML not available — using built-in default APRDA weights.")
        return _default_config()
    except FileNotFoundError:
        logger.warning("decision_weights.yaml not found — using built-in default APRDA weights.")
        return _default_config()


def _default_config() -> dict:
    """Return a safe default configuration if YAML load fails."""
    return {
        "weights": {
            "LOW":    {"capacity":0.15,"utilization":0.30,"prediction":0.10,
                       "history":0.15,"sla":0.10,"efficiency":0.20},
            "NORMAL": {"capacity":0.20,"utilization":0.20,"prediction":0.20,
                       "history":0.15,"sla":0.15,"efficiency":0.10},
            "HIGH":   {"capacity":0.25,"utilization":0.15,"prediction":0.25,
                       "history":0.10,"sla":0.20,"efficiency":0.05},
            "SPIKE":  {"capacity":0.30,"utilization":0.20,"prediction":0.25,
                       "history":0.05,"sla":0.15,"efficiency":0.05},
        },
        "sla_levels": {"LOW":1,"MEDIUM":2,"HIGH":3,"CRITICAL":4},
        "default_sla_priority": "MEDIUM",
        "workload_thresholds": {"low_max":40.0,"normal_max":65.0,"high_max":85.0},
        "missing_data_strategy": "renormalize",
        "neutral_fallback_score": 0.5,
        "capacity_ideal_ratio": 2.0,
        "capacity_penalty_factor": 0.5,
    }


# ---------------------------------------------------------------------------
# Configuration validation
# ---------------------------------------------------------------------------

def validate_weights(config: dict) -> None:
    """
    Verify that every workload class weight set sums to 1.0 within tolerance.
    Raises ValueError with a clear message if any class fails.
    """
    tolerance = 1e-6
    weights_section = config.get("weights", {})
    for wclass, factors in weights_section.items():
        total = sum(factors.values())
        if abs(total - 1.0) > tolerance:
            raise ValueError(
                f"APRDA configuration error: weights for workload class '{wclass}' "
                f"sum to {total:.8f} but must sum to 1.0 (tolerance ±{tolerance}). "
                f"Check config/decision_weights.yaml."
            )
    logger.info("APRDA weight validation passed for all workload classes.")


# ---------------------------------------------------------------------------
# Workload classification
# ---------------------------------------------------------------------------

def classify_workload(predicted_cpu: float, config: dict) -> str:
    """
    Classify the predicted workload into LOW / NORMAL / HIGH / SPIKE using
    the thresholds from configuration.

    Args:
        predicted_cpu: Predicted CPU utilisation percentage (0–100).
        config: Loaded APRDA configuration dict.

    Returns:
        One of: "LOW", "NORMAL", "HIGH", "SPIKE"
    """
    thresholds = config.get("workload_thresholds", {})
    low_max    = float(thresholds.get("low_max",    40.0))
    normal_max = float(thresholds.get("normal_max", 65.0))
    high_max   = float(thresholds.get("high_max",   85.0))

    if predicted_cpu < low_max:
        return "LOW"
    elif predicted_cpu < normal_max:
        return "NORMAL"
    elif predicted_cpu < high_max:
        return "HIGH"
    else:
        return "SPIKE"


# ---------------------------------------------------------------------------
# Factor calculations (each returns a float in [0.0, 1.0])
# ---------------------------------------------------------------------------

def _factor_capacity(resource: dict, request: dict, config: dict) -> Optional[float]:
    """
    C — Capacity Suitability.

    Measures how well the resource capacity meets the request without
    excessive over-provisioning.  The score peaks around `capacity_ideal_ratio`
    times the requested capacity and falls off for much larger resources.

    Returns None if required data is missing.
    """
    req_vcpu   = float(request.get("required_vcpu") or request.get("required_cpu") or 0)
    req_mem_gb = float(request.get("required_mem", 0))

    inst_vcpu  = float(resource.get("vcpu", 0) or 0)
    inst_mem   = float(resource.get("available_mem_gb", 0) or 0)

    if req_vcpu <= 0 or req_mem_gb <= 0:
        # Cannot compute capacity suitability without request requirements
        return None
    if inst_vcpu <= 0 or inst_mem <= 0:
        return None

    ideal_ratio    = float(config.get("capacity_ideal_ratio",    2.0))
    penalty_factor = float(config.get("capacity_penalty_factor", 0.5))

    # CPU capacity suitability
    cpu_ratio = inst_vcpu / req_vcpu
    if cpu_ratio < 1.0:
        # Resource cannot satisfy request — should have been filtered; guard
        cpu_score = 0.0
    elif cpu_ratio <= ideal_ratio:
        cpu_score = cpu_ratio / ideal_ratio
    else:
        # Penalise over-provisioning
        overage   = cpu_ratio - ideal_ratio
        cpu_score = max(0.0, 1.0 - penalty_factor * overage / ideal_ratio)

    # Memory capacity suitability
    mem_ratio = inst_mem / req_mem_gb
    if mem_ratio < 1.0:
        mem_score = 0.0
    elif mem_ratio <= ideal_ratio:
        mem_score = mem_ratio / ideal_ratio
    else:
        overage   = mem_ratio - ideal_ratio
        mem_score = max(0.0, 1.0 - penalty_factor * overage / ideal_ratio)

    # Equal-weight average of CPU and memory scores
    return round(min(1.0, (cpu_score + mem_score) / 2.0), 4)


def _factor_utilization(resource: dict) -> Optional[float]:
    """
    U — Utilization / Headroom.

    Higher available headroom → higher score.
    Uses CPU utilisation as the primary metric; blends with memory if available.
    Returns None only if no utilisation data at all is available.
    """
    cpu_util  = resource.get("current_utilization")
    mem_util  = resource.get("cloudwatch_metrics", {})
    if isinstance(mem_util, dict):
        mem_util = mem_util.get("current", {}).get("memory_used_percent")
    else:
        mem_util = None

    if cpu_util is None:
        return None

    cpu_util = max(0.0, min(100.0, float(cpu_util)))
    cpu_headroom_score = 1.0 - (cpu_util / 100.0)

    if mem_util is not None:
        mem_util = max(0.0, min(100.0, float(mem_util)))
        mem_headroom_score = 1.0 - (mem_util / 100.0)
        return round((cpu_headroom_score + mem_headroom_score) / 2.0, 4)
    else:
        return round(cpu_headroom_score, 4)


def _factor_prediction(resource: dict, request: dict, prediction_result: dict) -> Optional[float]:
    """
    P — Prediction Suitability.

    Uses the Random Forest predicted_cpu to assess whether the resource can
    comfortably accommodate the predicted future workload.

    Logic:
        future_demand = current_cpu + predicted_cpu
        available_cpu_pct_on_resource — future_demand → headroom
        Score = headroom normalised to [0, 1].

    Returns None if prediction data is insufficient.
    """
    predicted_cpu = prediction_result.get("predicted_cpu")
    if predicted_cpu is None:
        return None

    current_cpu = float(prediction_result.get("current_cpu") or
                        request.get("current_cpu") or 0)

    # "available_cpu_pct" is a percentage of the resource's own capacity
    avail_cpu_pct = float(resource.get("available_cpu_pct") or 0)

    # Predict future utilisation on this resource (predicted_cpu is an
    # absolute % value on the host, not a delta we can simply add to avail).
    # We estimate: if predicted_cpu% is the expected total system CPU,
    # the resource needs at least that much headroom.
    future_demand_pct = float(predicted_cpu)
    headroom = avail_cpu_pct - future_demand_pct

    if avail_cpu_pct <= 0:
        return 0.0

    # Score: proportion of total resource capacity that remains after
    # meeting the predicted demand.
    score = headroom / 100.0
    return round(max(0.0, min(1.0, score)), 4)


def _factor_history(resource: dict, rag_result: dict) -> Optional[float]:
    """
    H — Historical Similarity.

    Uses the RAG retrieval result.  Rewards resources that were historically
    selected in similar situations with successful outcomes.

    Returns None if no RAG result is available.
    """
    if not rag_result:
        return None

    retrieved = rag_result.get("retrieved_cases", [])
    if not retrieved:
        return None

    vm_id = resource.get("vm_id") or resource.get("id") or ""

    # Look for cases that selected this resource and succeeded
    vm_similarities = []
    vm_successes    = 0
    all_sims        = [r["similarity"] for r in retrieved if r.get("similarity") is not None]

    for case in retrieved:
        sim = case.get("similarity", 0.0)
        if case.get("selected_vm") == vm_id:
            vm_similarities.append(sim)
            if case.get("result") == "SUCCESS":
                vm_successes += 1

    if not vm_similarities:
        # Resource not found in historical cases — use a neutral base
        # proportional to the lowest observed similarity
        if all_sims:
            h_score = min(all_sims) * 0.3  # modest penalty for no direct history
        else:
            h_score = 0.1
        return round(max(0.0, min(1.0, h_score)), 4)

    # Average similarity for this VM's historical cases
    avg_sim = sum(vm_similarities) / len(vm_similarities)

    # Success ratio among its cases
    success_ratio = vm_successes / len(vm_similarities)

    # Combined historical score
    h_score = 0.6 * avg_sim + 0.4 * success_ratio
    return round(max(0.0, min(1.0, h_score)), 4)


def _factor_sla(resource: dict, sla_priority: str, config: dict) -> Optional[float]:
    """
    S — SLA Suitability.

    Higher-priority requests should prefer resources with more headroom
    and lower utilisation.

    Formula:
        headroom_score = 1 - (current_utilization / 100)
        priority_scale = sla_level / max_sla_level
        S = headroom_score * (1 + priority_scale) / 2
          normalised to [0, 1]
    """
    cpu_util = resource.get("current_utilization")
    if cpu_util is None:
        return None

    sla_levels  = config.get("sla_levels", {"LOW":1,"MEDIUM":2,"HIGH":3,"CRITICAL":4})
    max_level   = max(sla_levels.values())
    sla_level   = sla_levels.get(sla_priority.upper(), sla_levels.get("MEDIUM", 2))

    cpu_util        = max(0.0, min(100.0, float(cpu_util)))
    headroom_score  = 1.0 - (cpu_util / 100.0)
    priority_scale  = sla_level / max_level   # 0.25 – 1.0

    # For CRITICAL: S is almost purely headroom_score.
    # For LOW: S is dampened — lower-priority requests can tolerate busier resources.
    s_score = headroom_score * (0.5 + 0.5 * priority_scale)
    return round(max(0.0, min(1.0, s_score)), 4)


def _factor_efficiency(resource: dict, request: dict, config: dict) -> Optional[float]:
    """
    E — Resource Efficiency.

    Measures whether the resource satisfies the request without unnecessary
    wastage.  A smaller feasible resource that exactly meets the requirement
    scores better than a much larger one.

    E = 1 / (1 + over-provision-ratio)   normalised to [0,1]

    "Over-provision ratio" is the combined excess capacity relative to the
    request, normalised by the request size.
    """
    req_vcpu   = float(request.get("required_vcpu") or request.get("required_cpu") or 0)
    req_mem_gb = float(request.get("required_mem", 0))
    inst_vcpu  = float(resource.get("vcpu", 0) or 0)
    inst_mem   = float(resource.get("available_mem_gb", 0) or 0)

    if req_vcpu <= 0 or req_mem_gb <= 0 or inst_vcpu <= 0 or inst_mem <= 0:
        return None

    cpu_excess = max(0.0, inst_vcpu  - req_vcpu)   / req_vcpu
    mem_excess = max(0.0, inst_mem   - req_mem_gb)  / req_mem_gb

    avg_excess = (cpu_excess + mem_excess) / 2.0

    # Decay function: score is high when excess is small
    e_score = 1.0 / (1.0 + avg_excess)
    return round(max(0.0, min(1.0, e_score)), 4)


# ---------------------------------------------------------------------------
# Weight renormalisation
# ---------------------------------------------------------------------------

def _renormalize_weights(base_weights: dict, unavailable_keys: list) -> dict:
    """
    Remove unavailable factor keys from base_weights and renormalise the
    remaining weights so they still sum to 1.0.

    Returns the renormalised weight dict (keys that were available only).
    """
    available = {k: v for k, v in base_weights.items() if k not in unavailable_keys}
    total = sum(available.values())
    if total <= 0:
        # All factors unavailable — return equal weights for available ones
        n = len(available)
        return {k: (1.0 / n if n > 0 else 0.0) for k in available}
    return {k: v / total for k, v in available.items()}


# ---------------------------------------------------------------------------
# Main APRDA function
# ---------------------------------------------------------------------------

def run(
    request:           dict,
    feasible_resources: list,
    prediction_result: dict,
    rag_result:        dict,
    config:            Optional[dict] = None,
) -> dict:
    """
    Execute APRDA on the feasible resource pool.

    Args:
        request:            Workload/request dict (required_vcpu, required_mem,
                            sla_priority, current_cpu, …).
        feasible_resources: List of candidate resource dicts, already filtered
                            by the Mapping Agent for hard constraints.
        prediction_result:  Output of PredictionAgent.run() — contains
                            predicted_cpu, current_cpu, trend, sla_risk.
        rag_result:         Output of RAGAgent.run() — contains retrieved_cases
                            and suggested_vm.
        config:             Pre-loaded config dict (loads from YAML if None).

    Returns:
        Structured APRDA result dict as specified in the CloudPilot algorithm
        documentation.
    """
    aprda_start = time.perf_counter()

    # ── Load / validate configuration ─────────────────────────────────────
    if config is None:
        config = _load_config()

    try:
        validate_weights(config)
    except ValueError as e:
        return {
            "algorithm": "APRDA",
            "status":    "CONFIG_ERROR",
            "error":     str(e),
        }

    # ── Handle empty candidate pool ────────────────────────────────────────
    if not feasible_resources:
        aprda_ms = (time.perf_counter() - aprda_start) * 1000.0
        logger.info("APRDA: no feasible resources — returning NO_FEASIBLE_RESOURCE.")
        return {
            "algorithm":         "APRDA",
            "status":            "NO_FEASIBLE_RESOURCE",
            "workload_class":    None,
            "selected_resource": None,
            "decision_score":    None,
            "ranked_resources":  [],
            "weights_used":      {},
            "reason":            "No feasible resource passed the hard-constraint filter.",
            "aprda_latency_ms":  round(aprda_ms, 3),
        }

    # ── Determine SLA priority ─────────────────────────────────────────────
    sla_priority = request.get("sla_priority") or request.get("sla_level") or ""
    sla_levels   = config.get("sla_levels", {"LOW":1,"MEDIUM":2,"HIGH":3,"CRITICAL":4})
    if sla_priority.upper() not in sla_levels:
        # Derive from prediction SLA risk if SLA priority not explicitly set
        sla_risk_map = {"HIGH": "HIGH", "MEDIUM": "MEDIUM", "LOW": "LOW"}
        pred_risk = (prediction_result or {}).get("sla_risk", "")
        sla_priority = sla_risk_map.get(pred_risk.upper(), config.get("default_sla_priority", "MEDIUM"))

    # ── Classify workload ──────────────────────────────────────────────────
    predicted_cpu  = float((prediction_result or {}).get("predicted_cpu") or 0.0)
    workload_class = classify_workload(predicted_cpu, config)
    logger.info(
        f"APRDA: workload_class={workload_class}  predicted_cpu={predicted_cpu:.1f}%  "
        f"sla_priority={sla_priority}  candidates={len(feasible_resources)}"
    )

    # ── Load weights for this workload class ───────────────────────────────
    all_weights    = config.get("weights", {})
    base_weights   = dict(all_weights.get(workload_class, all_weights.get("NORMAL", {})))
    factor_keys    = ["capacity", "utilization", "prediction", "history", "sla", "efficiency"]

    missing_strategy = config.get("missing_data_strategy", "renormalize")

    # ── Score each feasible resource ───────────────────────────────────────
    scored_resources = []

    for resource in feasible_resources:
        vm_id = resource.get("vm_id") or resource.get("id") or "unknown"

        # Calculate raw factor values
        raw_C = _factor_capacity(resource,   request, config)
        raw_U = _factor_utilization(resource)
        raw_P = _factor_prediction(resource,  request, prediction_result or {})
        raw_H = _factor_history(resource,    rag_result or {})
        raw_S = _factor_sla(resource,        sla_priority, config)
        raw_E = _factor_efficiency(resource,  request, config)

        raw_factors = {
            "capacity":    raw_C,
            "utilization": raw_U,
            "prediction":  raw_P,
            "history":     raw_H,
            "sla":         raw_S,
            "efficiency":  raw_E,
        }

        # Identify unavailable factors
        unavailable = [k for k, v in raw_factors.items() if v is None]

        # Apply missing-data strategy
        if missing_strategy == "renormalize":
            effective_weights = _renormalize_weights(base_weights, unavailable)
        else:
            # "neutral" strategy — fill missing with neutral score
            neutral = float(config.get("neutral_fallback_score", 0.5))
            for k in unavailable:
                raw_factors[k] = neutral
            effective_weights = dict(base_weights)

        # Replace None with 0 for scoring (unavailable factors with renormalize
        # already have weight 0, so this is safe)
        final_factors = {
            k: (v if v is not None else 0.0)
            for k, v in raw_factors.items()
        }

        # Compute weighted APRDA score
        aprda_score = sum(
            effective_weights.get(k, 0.0) * final_factors[k]
            for k in factor_keys
        )
        aprda_score = round(max(0.0, min(1.0, aprda_score)), 4)

        # Log unavailable factors
        if unavailable:
            logger.info(
                f"APRDA [{vm_id}]: unavailable factors={unavailable} "
                f"strategy={missing_strategy} effective_weights={effective_weights}"
            )

        scored_resources.append({
            "resource_id":         vm_id,
            "score":               aprda_score,
            "feasible":            True,
            "components": {
                "capacity":    round(final_factors["capacity"],    4),
                "utilization": round(final_factors["utilization"], 4),
                "prediction":  round(final_factors["prediction"],  4),
                "history":     round(final_factors["history"],     4),
                "sla":         round(final_factors["sla"],         4),
                "efficiency":  round(final_factors["efficiency"],  4),
            },
            "unavailable_factors": unavailable,
            "weights_applied":     {k: round(v, 6) for k, v in effective_weights.items()},
            # Pass through original resource metadata for downstream use
            "_resource":           resource,
        })

    # ── Rank feasible resources ────────────────────────────────────────────
    scored_resources.sort(key=lambda x: x["score"], reverse=True)

    aprda_ms = (time.perf_counter() - aprda_start) * 1000.0

    # ── Build result ───────────────────────────────────────────────────────
    best   = scored_resources[0]
    reason = (
        f"Resource '{best['resource_id']}' selected based on feasibility, "
        f"available headroom (U={best['components']['utilization']:.3f}), "
        f"predicted workload suitability (P={best['components']['prediction']:.3f}), "
        f"historical similarity (H={best['components']['history']:.3f}), "
        f"SLA suitability (S={best['components']['sla']:.3f}), "
        f"and resource efficiency (E={best['components']['efficiency']:.3f}). "
        f"Workload classified as '{workload_class}'. APRDA score: {best['score']:.4f}."
    )

    # Strip internal _resource key from returned list
    ranked_for_output = [
        {k: v for k, v in r.items() if k != "_resource"}
        for r in scored_resources
    ]

    result = {
        "algorithm":         "APRDA",
        "status":            "SUCCESS",
        "workload_class":    workload_class,
        "sla_priority":      sla_priority,
        "selected_resource": best["resource_id"],
        "decision_score":    best["score"],
        "ranked_resources":  ranked_for_output,
        "weights_used":      {
            "workload_class": workload_class,
            "factors":        {k: round(v, 6) for k, v in base_weights.items()},
        },
        "prediction_inputs": {
            "predicted_cpu":     predicted_cpu,
            "current_cpu":       float((prediction_result or {}).get("current_cpu") or 0),
            "trend":             (prediction_result or {}).get("trend", "N/A"),
            "sla_risk":          (prediction_result or {}).get("sla_risk", "N/A"),
        },
        "rag_inputs": {
            "case_base_size":    (rag_result or {}).get("case_base_size", 0),
            "retrieved_cases":   len((rag_result or {}).get("retrieved_cases", [])),
            "suggested_vm":      (rag_result or {}).get("suggested_vm"),
        },
        "candidates_evaluated": len(feasible_resources),
        "reason":            reason,
        "aprda_latency_ms":  round(aprda_ms, 3),
    }

    logger.info(
        f"APRDA decision: selected={best['resource_id']}  "
        f"score={best['score']:.4f}  workload={workload_class}  "
        f"latency={aprda_ms:.2f}ms"
    )
    return result
