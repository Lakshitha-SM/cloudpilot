import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    import pytest
except ImportError:
    class PytestMock:
        def fixture(self, fn):
            return fn
        def raises(self, exc):
            class RaisesContext:
                def __enter__(self): pass
                def __exit__(self, exc_type, exc_val, exc_tb):
                    return exc_type is not None and issubclass(exc_type, exc)
            return RaisesContext()
        def approx(self, val):
            return val
    pytest = PytestMock()

from backend.agents import aprda

@pytest.fixture
def base_config():
    return {
        "weights": {
            "LOW":    {"capacity":0.15,"utilization":0.30,"prediction":0.10,"history":0.15,"sla":0.10,"efficiency":0.20},
            "NORMAL": {"capacity":0.20,"utilization":0.20,"prediction":0.20,"history":0.15,"sla":0.15,"efficiency":0.10},
            "HIGH":   {"capacity":0.25,"utilization":0.15,"prediction":0.25,"history":0.10,"sla":0.20,"efficiency":0.05},
            "SPIKE":  {"capacity":0.30,"utilization":0.20,"prediction":0.25,"history":0.05,"sla":0.15,"efficiency":0.05},
        },
        "sla_levels": {"LOW":1,"MEDIUM":2,"HIGH":3,"CRITICAL":4},
        "default_sla_priority": "MEDIUM",
        "workload_thresholds": {"low_max":40.0,"normal_max":65.0,"high_max":85.0},
        "missing_data_strategy": "renormalize",
        "capacity_ideal_ratio": 2.0,
        "capacity_penalty_factor": 0.5,
    }

@pytest.fixture
def base_request():
    return {
        "required_cpu": 30.0,
        "required_mem": 4.0,
        "sla_priority": "HIGH",
        "current_cpu": 50.0
    }

@pytest.fixture
def base_resources():
    return [
        {"id": "VM1", "vcpu": 64.0, "available_mem_gb": 8.0, "available_cpu_pct": 90.0, "current_utilization": 10.0},
        {"id": "VM2", "vcpu": 128.0, "available_mem_gb": 16.0, "available_cpu_pct": 70.0, "current_utilization": 30.0}
    ]

def test_config_validation(base_config):
    # Valid config shouldn't raise
    aprda.validate_weights(base_config)
    
    # Invalid config should raise ValueError
    base_config["weights"]["LOW"]["capacity"] = 0.99
    with pytest.raises(ValueError):
        aprda.validate_weights(base_config)

def test_workload_classification(base_config):
    assert aprda.classify_workload(30.0, base_config) == "LOW"
    assert aprda.classify_workload(50.0, base_config) == "NORMAL"
    assert aprda.classify_workload(75.0, base_config) == "HIGH"
    assert aprda.classify_workload(95.0, base_config) == "SPIKE"

def test_factor_capacity(base_config, base_request, base_resources):
    res1 = base_resources[0] # vcpu=64, req=30 -> ratio 2.13 (close to ideal 2.0)
    res2 = base_resources[1] # vcpu=128, req=30 -> ratio 4.26 (too big, penalized)
    
    c1 = aprda._factor_capacity(res1, base_request, base_config)
    c2 = aprda._factor_capacity(res2, base_request, base_config)
    
    assert c1 is not None and c2 is not None
    assert c1 > c2  # VM1 is closer to ideal ratio

def test_factor_utilization(base_resources):
    u1 = aprda._factor_utilization(base_resources[0]) # 10% util -> 0.9 headroom
    u2 = aprda._factor_utilization(base_resources[1]) # 30% util -> 0.7 headroom
    assert u1 == 0.9
    assert u2 == 0.7

def test_factor_prediction(base_resources, base_request):
    pred = {"predicted_cpu": 20.0, "current_cpu": 50.0}
    
    # VM1 has 90% available, future demand is 20%. Headroom 70%
    p1 = aprda._factor_prediction(base_resources[0], base_request, pred)
    assert p1 == 0.7

    # VM2 has 70% available, future demand is 20%. Headroom 50%
    p2 = aprda._factor_prediction(base_resources[1], base_request, pred)
    assert p2 == 0.5

def test_factor_history():
    resource = {"id": "VM1"}
    rag = {
        "retrieved_cases": [
            {"selected_vm": "VM1", "similarity": 0.9, "result": "SUCCESS"},
            {"selected_vm": "VM1", "similarity": 0.8, "result": "FAILED"},
            {"selected_vm": "VM2", "similarity": 0.95, "result": "SUCCESS"}
        ]
    }
    # VM1 average sim: 0.85, success ratio: 0.5
    # score: 0.6 * 0.85 + 0.4 * 0.5 = 0.51 + 0.2 = 0.71
    h = aprda._factor_history(resource, rag)
    assert round(h, 2) == 0.71

def test_factor_history_no_cases():
    assert aprda._factor_history({"id": "VM1"}, {}) is None

def test_factor_sla(base_config, base_resources):
    # SLA levels: LOW=1, MEDIUM=2, HIGH=3, CRITICAL=4
    # priority_scale for CRITICAL = 4/4 = 1.0. S = headroom * (0.5 + 0.5*1.0) = headroom
    s1_crit = aprda._factor_sla(base_resources[0], "CRITICAL", base_config)
    assert s1_crit == 0.9  # Headroom is 0.9
    
    # priority_scale for LOW = 1/4 = 0.25. S = headroom * (0.5 + 0.5*0.25) = headroom * 0.625
    s1_low = aprda._factor_sla(base_resources[0], "LOW", base_config)
    assert s1_low == 0.9 * 0.625

def test_factor_efficiency(base_config, base_request, base_resources):
    e1 = aprda._factor_efficiency(base_resources[0], base_request, base_config)
    e2 = aprda._factor_efficiency(base_resources[1], base_request, base_config)
    
    # VM1 has less excess than VM2, so it should be more efficient
    assert e1 > e2

def test_run_empty_candidates(base_config, base_request):
    result = aprda.run(base_request, [], {}, {}, config=base_config)
    assert result["status"] == "NO_FEASIBLE_RESOURCE"
    assert result["selected_resource"] is None

def test_run_full_scoring(base_config, base_request, base_resources):
    pred = {"predicted_cpu": 70.0, "current_cpu": 50.0, "sla_risk": "HIGH"}
    rag = {
        "retrieved_cases": [
            {"selected_vm": "VM1", "similarity": 0.9, "result": "SUCCESS"}
        ]
    }
    
    result = aprda.run(base_request, base_resources, pred, rag, config=base_config)
    
    assert result["status"] == "SUCCESS"
    assert result["workload_class"] == "HIGH"  # 70% is HIGH
    assert result["selected_resource"] == "VM1" # VM1 scores better across the board
    assert "decision_score" in result
    assert "aprda_latency_ms" in result
    assert len(result["ranked_resources"]) == 2

def test_run_missing_data_renormalize(base_config, base_request, base_resources):
    # No RAG data -> history factor is None -> should renormalize
    pred = {"predicted_cpu": 50.0} # NORMAL class
    
    result = aprda.run(base_request, base_resources, pred, {}, config=base_config)
    
    assert result["status"] == "SUCCESS"
    assert "history" in result["ranked_resources"][0]["unavailable_factors"]
    # Check that the history weight was applied as 0 and others were scaled up
    weights = result["ranked_resources"][0]["weights_applied"]
    assert "history" not in weights
    assert abs(sum(weights.values()) - 1.0) < 0.001

if __name__ == "__main__":
    cfg = base_config()
    req = base_request()
    res = base_resources()
    test_config_validation(cfg)
    test_workload_classification(cfg)
    test_factor_capacity(cfg, req, res)
    test_factor_utilization(base_resources())
    test_factor_prediction(res, req)
    test_factor_history()
    test_factor_sla(cfg, res)
    test_factor_efficiency(cfg, req, res)
    test_run_empty_candidates(cfg, req)
    test_run_full_scoring(cfg, req, res)
    test_run_missing_data_renormalize(cfg, req, res)
    print("ALL APRDA UNIT TESTS PASSED SUCCESSFULLY!")

