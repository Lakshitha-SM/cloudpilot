# CloudPilot Architecture Report

This report documents the existing CloudPilot repository structure and its readiness for the new Mobile Application, per the inspection requirements.

## 1. Backend Architecture
The backend is a FastAPI application located in `/backend`. It provides REST APIs for executing the AI pipeline and querying status.

- **Main Entrypoint:** `backend/server.py`
- **Existing API Routes:**
  - Health & Status: `/health`, `/api/health`, `/api/model/metadata`
  - AWS Integration: `/api/aws/status`, `/api/aws/instances`, `/api/aws/metrics/{id}`, `/api/aws/workload/*`
  - Workload Generation: `/api/workload/generate`, `/api/workload/flash-sale-sequence`
  - Individual Agents: `/api/agents/mapping`, `/api/agents/prediction`, `/api/agents/rag`, `/api/agents/reasoning`, `/api/agents/aprda`
  - Pipelines: `/api/pipeline/run`, `/api/baseline/reactive`, `/api/compare`, `/api/scenarios/flash-sale`
  - Database APIs: `/api/db/summary`, `/api/db/allocations`, `/api/db/aprda_decisions`
  - Live Stream: `/api/stream/workload` (SSE)

## 2. Frontend Architecture
The existing web application is built with React (`cloudpilot-demo/src/App.jsx`) and communicates with the FastAPI backend on `localhost:8000`.
**Requirement Met:** The web application will remain strictly unmodified during the mobile development phase.

## 3. Database Layer
Located in `backend/database/db.py`. It uses SQLite (`database/cloudpilot.db`) with tables:
- `simulation_runs`, `workload_history`, `predictions`, `rag_cases`, `allocation_history`, `agent_events`, `performance_metrics`, `aprda_decisions`

## 4. Multi-Agent AI Pipeline
The AI pipeline (`backend/agents/pipeline.py`) executes in the following sequence:
1. **Mapping Agent:** Filters AWS EC2 instances for hardware feasibility (`backend/agents/mapping_agent.py`). Integrates with `ec2_adapter.py`.
2. **Prediction Agent:** Uses Random Forest regression (`models/random_forest_v1.pkl`) via `backend/agents/prediction_agent.py` to predict future CPU utilization.
3. **RAG Agent:** Queries ChromaDB for historical case similarity (`backend/agents/rag_agent.py`).
4. **APRDA:** Custom scoring algorithm introduced in Stage 3.5, evaluating instances on C, U, P, H, S, E factors.
5. **Reasoning Agent:** Generates a final allocation decision based on the previous agents' outputs (`backend/agents/reasoning_agent.py`).
6. **Execution Agent:** Performs DRY_RUN allocation or updates local states.

## 5. AWS & CloudWatch Integration
- Handled by `backend/aws/aws_client.py`, `ec2_adapter.py`, and `cloudwatch_adapter.py`.
- Connects using `boto3`. The backend safely abstracts AWS interactions. The mobile app will strictly interact via the REST API, ensuring no AWS secrets are exposed to the client.

## 6. Gaps Identified for Mobile Requirements
The following backend endpoints and data structures are currently **missing** and must be added to support the Mobile App:
- **Authentication:** `login`, `signup`, `logout` (and user session tables).
- **CloudPilot Credits:** Tables to store user credit balances, streak tracking, and endpoints to claim Daily Check-in / Daily Spin rewards.
- **Cloud Lab & Challenges:** Tables and APIs to manage lab states, credit deduction, and challenge completion status.
- **Request History:** Need mobile-optimized endpoints to fetch the user's past requests.

## 7. Next Steps for Mobile Implementation
1. Initialize Expo React Native project at `/mobile`.
2. Add the required mobile-specific APIs (`/api/mobile/*`) to `backend/server.py` and new tables to `db.py` while ensuring strict backward compatibility for the web frontend.
3. Implement the Mobile App using React Native, Expo, and TypeScript, following the provided CloudPilot design language and required screens.
