# CloudPilot Mobile & Backend API Contract Specification

> Architecture: FastAPI Core Backend ↔ React Native (Expo) Mobile Client  
> Specification Version: 2.0.0  
> Updated: 2026-09-28  

---

## 1. Network Topology & Environments

The CloudPilot mobile client connects via HTTP/HTTPS to the backend. Sensitive credentials (AWS Access Keys, Secret Keys, database files, and model weights) remain strictly on the backend.

- **MODE A — Local Development**:
  ```bash
  EXPO_PUBLIC_API_URL=http://<DEVELOPER_LAN_IP>:8000
  ```
- **MODE B — Deployed Production / Preview**:
  ```bash
  EXPO_PUBLIC_API_URL=https://<DEPLOYED_DOMAIN>
  ```
- **Runtime Override**: Accessible in `ProfileScreen → Developer Settings → Configure Backend URL`.

---

## 2. API Contract Specification Table

| METHOD | PATH | REQUEST BODY | RESPONSE BODY | ERRORS | AUTH | MODE SUPPORT |
|---|---|---|---|---|---|---|
| `GET` | `/api/health` | None | `{ status: "ok", version: "1.0.0", model: "RandomForestRegressor", model_metrics: { mae: 1.069, rmse: 5.008, r2: 0.109 } }` | `500 Internal Error` | None | Simulation & AWS |
| `GET` | `/api/version` | None | `{ status: "ok", version: "1.0.0", environment: "development" }` | `500` | None | Both |
| `GET` | `/api/system/status` | None | `{ status: "ok", latency_ms: number, services: { backend, database, aws, cloudwatch, ec2, prediction, rag, reasoning, aprda, rewards } }` | `500` | None | Both |
| `GET` | `/api/model/metadata` | None | `{ model_name: "RandomForestRegressor", hyperparameters: { n_estimators: 100 }, metrics: { mae, rmse, r2 } }` | `503 Service Unavailable` | None | Both |
| `GET` | `/api/aws/status` | None | `{ status: "CONNECTED" \| "DISCONNECTED", mode: "READ_ONLY", region: "us-east-1" }` | `500` | None | AWS Real-Time |
| `GET` | `/api/aws/instances` | None | `{ instances: [ { id, type, state, vcpu, memory_gb, az, tags } ], mode, region }` | `500` | None | AWS Real-Time |
| `GET` | `/api/aws/metrics/{id}` | None | `{ status: "OK", current: { cpu_utilization, memory_used_percent, net_bytes_recv, net_bytes_sent }, datapoints: { ... } }` | `404, 500` | None | AWS Real-Time |
| `POST` | `/api/agents/mapping` | `WorkloadRequest` | `{ agent: "MappingAgent", mode, candidates: [ ... ], rejected: [ { vm_id, reason } ], latency_ms }` | `400, 500` | None | Both |
| `POST` | `/api/agents/prediction` | `WorkloadRequest` | `{ agent: "PredictionAgent", predicted_cpu, data_source: "SIMULATION" \| "AWS_CLOUDWATCH", model_metrics, latency_ms }` | `400, 500` | None | Both |
| `POST` | `/api/agents/rag` | `WorkloadRequest` | `{ agent: "RAGAgent", query, case_base_size, retrieved_cases: [ { case_id, similarity, workload_cpu, selected_vm, result } ], suggested_vm, latency_ms }` | `400, 500` | None | Both |
| `POST` | `/api/agents/reasoning` | `WorkloadRequest` | `{ agent: "ReasoningAgent", reasoning: string, selected_vm, evidence, latency_ms }` | `400, 500` | None | Both |
| `POST` | `/api/agents/aprda` | `WorkloadRequest` | `{ algorithm: "APRDA", status: "SUCCESS", workload_class, selected_resource, decision_score, ranked_resources: [ { resource_id, score, components: { capacity, utilization, prediction, history, sla, efficiency } } ], weights_used, reason, aprda_latency_ms }` | `400, 500` | None | Both |
| `POST` | `/api/pipeline` | `WorkloadRequest` | `{ run_id, stages: { mapping, prediction, rag, reasoning, aprda, execution }, selected_vm, end_to_end_ms, final_status }` | `400, 500` | None | Both |
| `POST` | `/api/mobile/auth/signup` | `{ email, password }` | `{ token, user: { id, email, credits, daily_streak, last_checkin, last_spin } }` | `400 (Email exists)` | None | Both |
| `POST` | `/api/mobile/auth/login` | `{ email, password }` | `{ token, user: { id, email, credits, ... } }` | `401 (Invalid creds)` | None | Both |
| `GET` | `/api/mobile/profile/{id}` | None | `{ user: { id, email, credits, daily_streak }, history: [ ... ] }` | `404` | Bearer Token | Both |
| `POST` | `/api/mobile/rewards/checkin` | Query: `?user_id=N` | `{ status: "SUCCESS", reward, new_streak, day_in_cycle, new_credits }` | `400 (Already checked in today)` | None | Both |
| `GET` | `/api/mobile/rewards/spin/status` | Query: `?user_id=N` | `{ can_spin: boolean, last_spin: string, today: string, reason: string \| null }` | `404` | None | Both |
| `POST` | `/api/mobile/rewards/spin` | Query: `?user_id=N` | `{ status: "SUCCESS", reward, winning_index (0-7), new_credits }` | `400 (Daily spin already used)` | None | Both |
| `GET` | `/api/mobile/challenges` | Query: `?user_id=N` | `{ challenges: [ { id, title, desc, reward, completed, claimed } ] }` | `404` | None | Both |
| `POST` | `/api/mobile/challenges/claim` | Query: `?user_id=N&challenge_id=ID` | `{ status: "SUCCESS", reward, new_credits, challenge_id }` | `400 (Already claimed), 404` | None | Both |
| `POST` | `/api/mobile/labs/run` | `{ user_id, lab_id }` | `{ status: "SUCCESS", lab_id, credits_deducted, new_credits, timestamp }` | `400 (Insufficient credits), 404` | None | Both |
| `GET` | `/api/mobile/history/{id}` | None | `{ history: [ { id, run_id, selected_vm, requested_cpu, status, mode } ] }` | `404` | None | Both |
| `GET` | `/api/db/allocations` | Query: `?limit=N` | `{ allocations: [ ... ] }` | `500` | None | Both |
| `GET` | `/api/db/aprda_decisions`| Query: `?limit=N` | `{ aprda_decisions: [ ... ] }` | `500` | None | Both |

---

## 3. WorkloadRequest Standard Schema

```typescript
export interface WorkloadRequest {
  scenario?: string;            // e.g. "normal" | "flash_sale"
  current_cpu: number;          // 0.0 - 100.0 %
  current_memory: number;       // 0.0 - 100.0 %
  current_io?: number;          // 0.0 - 1.0 (or "Low"|"Medium"|"High")
  current_network?: number;     // 0.0 - 1.0
  request_rate?: number;        // Requests per second
  active_users?: number;        // Concurrency count
  workload_type?: string;       // "E-Commerce" | "Web Traffic" | "Analytics"
  required_cpu?: number;        // CPU requirement percentage
  required_vcpu?: number;       // Exact vCPU core count (1, 2, 4, 8)
  required_mem?: number;        // RAM in GB (0.5, 1.0, 2.0, 4.0, 8.0)
  required_io?: string;         // "Low" | "Medium" | "High"
  required_net?: number;        // Gbps
  mode: 'sim' | 'aws_live';     // Execution environment mode
}
```

---

## 4. Error Normalization Matrix

The centralized API client (`mobile/src/api/client.ts`) normalizes all HTTP and network errors before they reach the user interface:

| Error Type | Technical Code | User Message Shown | Can Retry |
|---|---|---|---|
| Timeout | `ECONNABORTED` / Timeout | "CloudPilot backend took too long to respond." | Yes |
| Offline / Network | `ERR_NETWORK` / Network Error | "Unable to reach CloudPilot backend. Check your connection." | Yes |
| Not Found | `404` | "CloudPilot service endpoint is unavailable." | No |
| Bad Request | `400` | Specific server message (e.g. "Daily spin already used. Come back tomorrow.") | No |
| Unauthorized | `401` | "Authentication required. Please log in again." | No |
| Internal Server Error | `500` | "CloudPilot backend encountered an internal error." | Yes |
| Server Unavailable | `502 / 503` | "CloudPilot service is temporarily unavailable." | Yes |
