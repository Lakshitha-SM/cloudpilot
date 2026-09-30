# Adaptive Predictive Resource Decision Algorithm (APRDA)

## Overview

The **Adaptive Predictive Resource Decision Algorithm (APRDA)** is a CloudPilot-specific, multi-factor decision layer that integrates upstream predictions and hard constraints into a final optimal resource selection.

APRDA sits at Stage 3.5 of the CloudPilot pipeline, answering the question:
> "Among the pool of resources that are physically capable of hosting this application, which one is the *most optimal* right now, considering its current state, its predicted future state, historical successes, requested SLA, and resource efficiency?"

**Crucially, APRDA is NOT a machine-learning model.** It is a weighted scoring algorithm that *consumes* outputs from the Machine Learning pipeline (Random Forest) and the RAG Knowledge Base.

---

## The Six Factors

APRDA scores every feasible resource across six normalized factors ($0.0 \le \text{Factor} \le 1.0$):

1. **Capacity Suitability (C)**
   Measures how well the physical boundaries of the resource fit the request, heavily penalizing extreme over-provisioning (e.g., placing a 1-vCPU job on a 128-vCPU instance).

2. **Utilization / Headroom (U)**
   Rewards instances that currently have abundant free CPU and Memory, ensuring workload distribution across the pool.

3. **Prediction Suitability (P)**
   Uses the Random Forest model's prediction. If the predicted future CPU demand of the workload is high, APRDA ensures the resource has enough headroom to accommodate that future state, preventing proactive SLA breaches.

4. **Historical Similarity (H)**
   Consumes RAG cosine-similarity scores. If an instance was successfully used for a similar workload in the past, it receives a boost.

5. **SLA Suitability (S)**
   A dynamic scaling factor based on the request's SLA priority. CRITICAL requests demand heavily underutilized instances, whereas LOW priority requests can tolerate busier instances.

6. **Resource Efficiency (E)**
   A mathematical measure of wastage. $E = \frac{1}{1 + \text{excess ratio}}$. Rewards tighter packing where appropriate.

---

## Dynamic Weighting via Workload Classes

APRDA does not use static weights. It categorizes the incoming request into a **Workload Class** based on the Random Forest predicted CPU demand:

- **LOW** (< 40%): Emphasizes Utilization (U) and Efficiency (E).
- **NORMAL** (40% - 65%): Balanced approach.
- **HIGH** (65% - 85%): Emphasizes Prediction (P), Capacity (C), and SLA (S).
- **SPIKE** (>= 85%): Maximizes Capacity (C) and Prediction (P) to absorb the incoming surge.

Weights are loaded dynamically from `config/decision_weights.yaml`.

---

## Missing Data Strategy

If upstream agents fail to provide data (e.g., RAG is offline, or CloudWatch metrics are delayed), APRDA gracefully handles missing factors using the configured **Missing Data Strategy**:

- **Renormalize (Default)**: Drops the missing factor and scales the remaining weights proportionally so they sum to 1.0.
- **Neutral**: Assigns a static score (e.g., 0.5) to the missing factor.

---

## Pipeline Integration

```
1. Mapping Agent (Discovers feasible resources)
      ↓
2. Prediction Agent (Random Forest ML)
      ↓
3. RAG Agent (Retrieves case history)
      ↓
3.5 APRDA (Scoring & Ranking)   <-- [YOU ARE HERE]
      ↓
4. Reasoning Agent (Composite explanation)
      ↓
5. Execution Agent (DRY_RUN / Allocation)
```
