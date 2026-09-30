# CloudPilot — Demo Simulation

A visual, single-scenario demo of the Multi-Agent Decision Intelligence
Framework for Predictive Cloud Resource Management (Mapping, Prediction,
Reasoning, Execution agents), for your first project review.

## Run it

```
npm install
npm run dev
```

Open the local URL it prints (usually http://localhost:5173).

## What it shows

- Toggle between **"Without CloudPilot"** (naive VM pick, no forecasting,
  no memory of past incidents → ends in simulated SLA breach) and
  **"With CloudPilot"** (all four agents run in sequence → picks the
  safer VM using prediction + retrieved history).
- Click **Run Simulation** — it plays automatically end-to-end, no manual
  clicking through steps required.
- The System Log panel narrates exactly what each agent is doing, in the
  same language as the paper (Mapping → Prediction → Reasoning/RAG →
  Execution).
- All data (VM pool, predicted loads, retrieved history snippets) is
  mocked/hardcoded — this is a narrative simulation of the architecture,
  not the real Random Forest / ChromaDB / LLM pipeline. That's the honest
  framing to use in review: "this demonstrates the intended behavior of
  the system we're building."
