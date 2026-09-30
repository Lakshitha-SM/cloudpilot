import time
import requests
import threading

class TrafficGenerator:
    def __init__(self):
        self.target_url = None
        self.running = False
        self.stats = {
            "active_users": 0,
            "requests_per_second": 0,
            "error_rate": 0.0,
            "response_time": 0.0
        }
        self.thread = None

    def start(self, target_url, scenario="normal"):
        """Start sending real traffic to a target URL."""
        if self.running:
            return
            
        self.target_url = target_url
        self.running = True
        
        # Scenario logic (how many virtual users to simulate)
        target_users = 20
        if scenario == "flash_sale":
            target_users = 300
        elif scenario == "spike":
            target_users = 150
            
        self.thread = threading.Thread(target=self._worker, args=(target_users,))
        self.thread.daemon = True
        self.thread.start()

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=2.0)

    def _worker(self, target_users):
        """A simple loop to generate requests and measure latency."""
        self.stats["active_users"] = target_users
        
        while self.running:
            start_time = time.perf_counter()
            successes = 0
            errors = 0
            
            # Simulate a batch of requests (e.g. 1/10th of target users per loop iteration)
            batch_size = max(1, target_users // 10)
            
            for _ in range(batch_size):
                if not self.running:
                    break
                try:
                    res = requests.get(self.target_url, timeout=2.0)
                    if res.status_code == 200:
                        successes += 1
                    else:
                        errors += 1
                except Exception:
                    errors += 1
            
            elapsed = time.perf_counter() - start_time
            if elapsed > 0:
                self.stats["requests_per_second"] = (successes + errors) / elapsed
            else:
                self.stats["requests_per_second"] = 0
                
            total = successes + errors
            self.stats["error_rate"] = (errors / total * 100) if total > 0 else 0
            self.stats["response_time"] = (elapsed / total * 1000) if total > 0 else 0
            
            time.sleep(1.0) # sleep between batches

traffic_generator = TrafficGenerator()
