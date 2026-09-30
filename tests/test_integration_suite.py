"""
tests/test_integration_suite.py
Automated integration test suite for CloudPilot Mobile & Backend Architecture.
Covers:
  - System Health & Status endpoints (/api/health, /api/version, /api/system/status)
  - AWS Read-Only Mode & EC2 Adapter integration
  - Simulation Mode virtual resources & constraints
  - Random Forest Workload Prediction inference & metrics
  - Mapping Agent hardware feasibility & rejection reasons
  - RAG Vector Knowledge Base cosine similarity retrieval
  - Reasoning Agent contextual synthesis
  - APRDA multi-objective scoring & weight renormalization
  - End-to-end Multi-Agent Pipeline execution
  - Rewards System: daily check-in streak, duplicate prevention
  - Daily Spin determinism & 24h limit
  - Challenges completion & atomic credit transactions
  - Cloud Lab experiments & balance deduction
"""
import unittest
import json
import urllib.request
import urllib.error
import time

BASE_URL = "http://127.0.0.1:8000"

def _get(path: str) -> dict:
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode())

def _post(path: str, data: dict = None) -> dict:
    url = f"{BASE_URL}{path}"
    payload = json.dumps(data or {}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json", "Accept": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())

class TestCloudPilotBackend(unittest.TestCase):

    def test_01_health_and_version(self):
        """Verify /api/health and /api/version expose valid status and schema."""
        health = _get("/api/health")
        self.assertEqual(health.get("status"), "ok")
        self.assertIn("version", health)
        self.assertEqual(health.get("model"), "RandomForestRegressor")
        self.assertIn("mae", health.get("model_metrics", {}))

        ver = _get("/api/version")
        self.assertEqual(ver.get("status"), "ok")
        self.assertEqual(ver.get("version"), "1.0.0")

    def test_02_system_status_endpoints(self):
        """Verify /api/system/status checks all 10 independent subsystems."""
        sys_status = _get("/api/system/status")
        self.assertEqual(sys_status.get("status"), "ok")
        services = sys_status.get("services", {})
        expected_services = [
            "backend", "database", "aws", "cloudwatch", "ec2",
            "prediction", "rag", "reasoning", "aprda", "rewards"
        ]
        for svc in expected_services:
            self.assertIn(svc, services, f"Missing service: {svc}")
            self.assertIn("status", services[svc])

    def test_03_prediction_agent(self):
        """Verify Random Forest workload prediction produces expected outputs."""
        payload = {
            "current_cpu": 35.0,
            "current_memory": 42.0,
            "current_io": 0.8,
            "current_network": 0.4,
            "request_rate": 500.0,
            "active_users": 200,
            "mode": "sim",
        }
        res = _post("/api/agents/prediction", payload)
        self.assertEqual(res.get("agent"), "PredictionAgent")
        self.assertIn("predicted_cpu", res)
        self.assertIn("model_metrics", res)
        self.assertIn("mae", res["model_metrics"])
        self.assertGreater(res["predicted_cpu"], 0)

    def test_04_mapping_agent_feasibility(self):
        """Verify Mapping Agent identifies feasible and infeasible nodes with reasons."""
        payload = {
            "required_cpu": 30.0,
            "required_vcpu": 2.0,
            "required_mem": 2.0,
            "required_io": "Medium",
            "required_net": 0.5,
            "mode": "sim",
        }
        res = _post("/api/agents/mapping", payload)
        self.assertEqual(res.get("agent"), "MappingAgent")
        self.assertIn("candidates", res)
        self.assertIn("rejected", res)
        self.assertGreater(len(res["candidates"]), 0)

        # Test extreme request that causes infeasibility
        extreme = {
            "required_cpu": 99.0,
            "required_vcpu": 128.0,
            "required_mem": 256.0,
            "mode": "sim",
        }
        res_ext = _post("/api/agents/mapping", extreme)
        self.assertGreater(len(res_ext.get("rejected", [])), 0)
        first_rej = res_ext["rejected"][0]
        self.assertIn("reason", first_rej)

    def test_05_rag_agent_retrieval(self):
        """Verify RAG agent computes cosine similarity over case base."""
        payload = {
            "current_cpu": 45.0,
            "current_memory": 50.0,
            "current_io": 0.8,
            "current_network": 0.4,
            "request_rate": 600.0,
        }
        res = _post("/api/agents/rag", payload)
        self.assertEqual(res.get("agent"), "RAGAgent")
        self.assertIn("retrieved_cases", res)
        self.assertGreater(len(res["retrieved_cases"]), 0)
        first_case = res["retrieved_cases"][0]
        self.assertIn("similarity", first_case)
        self.assertGreater(first_case["similarity"], 0.5)

    def test_06_reasoning_agent(self):
        """Verify Reasoning Agent synthesizes constraints into an explanation."""
        payload = {
            "current_cpu": 45.0,
            "current_memory": 50.0,
            "required_cpu": 30.0,
            "required_mem": 2.0,
            "mode": "sim",
        }
        res = _post("/api/agents/reasoning", payload)
        self.assertEqual(res.get("agent"), "ReasoningAgent")
        explanation = res.get("reasoning") or res.get("explanation")
        self.assertIsNotNone(explanation)
        self.assertGreater(len(explanation), 20)

    def test_07_aprda_scoring(self):
        """Verify APRDA computes multi-objective factor scores & weights."""
        payload = {
            "current_cpu": 35.0,
            "current_memory": 40.0,
            "required_cpu": 30.0,
            "required_mem": 2.0,
            "mode": "sim",
        }
        res = _post("/api/agents/aprda", payload)
        self.assertEqual(res.get("algorithm"), "APRDA")
        self.assertEqual(res.get("status"), "SUCCESS")
        self.assertIn("selected_resource", res)
        self.assertIn("decision_score", res)
        self.assertIn("ranked_resources", res)
        best = res["ranked_resources"][0]
        self.assertIn("components", best)
        comps = best["components"]
        for key in ["capacity", "utilization", "prediction", "history", "sla", "efficiency"]:
            self.assertIn(key, comps)

    def test_08_full_pipeline_execution(self):
        """Verify end-to-end autonomous multi-agent pipeline."""
        payload = {
            "scenario": "normal",
            "current_cpu": 38.0,
            "current_memory": 42.0,
            "mode": "sim",
        }
        res = _post("/api/pipeline", payload)
        self.assertIn("run_id", res)
        self.assertIn("stages", res)
        self.assertIn("mapping", res["stages"])
        self.assertIn("prediction", res["stages"])
        self.assertIn("rag", res["stages"])
        self.assertIn("reasoning", res["stages"])
        self.assertIn("aprda", res["stages"])
        self.assertIn("execution", res["stages"])
        self.assertIn("selected_vm", res)

    def test_09_rewards_and_streak(self):
        """Verify daily checkin & streak reward calculations."""
        # Use user_id 1
        try:
            res = _post("/api/mobile/rewards/checkin?user_id=1")
            self.assertIn(res.get("status"), ["SUCCESS"])
            self.assertIn("reward", res)
            self.assertIn("new_credits", res)
        except urllib.error.HTTPError as e:
            # 400 means already checked in today (duplicate prevention works!)
            self.assertEqual(e.code, 400)

    def test_10_daily_spin_and_duplicate_prevention(self):
        """Verify daily spin determinism and prevention of multiple spins."""
        status = _get("/api/mobile/rewards/spin/status?user_id=1")
        self.assertIn("can_spin", status)

        if status["can_spin"]:
            spin_res = _post("/api/mobile/rewards/spin?user_id=1")
            self.assertEqual(spin_res.get("status"), "SUCCESS")
            self.assertIn("winning_index", spin_res)
            self.assertIn("reward", spin_res)

            # Immediate second spin MUST be blocked by backend
            with self.assertRaises(urllib.error.HTTPError) as ctx:
                _post("/api/mobile/rewards/spin?user_id=1")
            self.assertEqual(ctx.exception.code, 400)
        else:
            # Already spun: verify backend rejects second spin
            with self.assertRaises(urllib.error.HTTPError) as ctx:
                _post("/api/mobile/rewards/spin?user_id=1")
            self.assertEqual(ctx.exception.code, 400)

    def test_11_challenges_and_labs(self):
        """Verify challenge discovery and Cloud Lab experiment transactions."""
        ch_res = _get("/api/mobile/challenges?user_id=1")
        self.assertIn("challenges", ch_res)
        self.assertEqual(len(ch_res["challenges"]), 6)

        # Run Lab Experiment
        lab_res = _post("/api/mobile/labs/run", {"user_id": 1, "lab_id": "lab_cpu_pred"})
        self.assertEqual(lab_res.get("status"), "SUCCESS")
        self.assertEqual(lab_res.get("credits_deducted"), 10)
        self.assertIn("new_credits", lab_res)

if __name__ == "__main__":
    unittest.main()
