# Cloud Workload Dataset Documentation

## 1. Overview
- **Dataset Name**: GWA-T-12 Bitbrains Cloud Datacenter Workload Trace (fastStorage)
- **Source**: Grid Workloads Archive (GWA) / Distributed Systems Group, TU Delft
- **Original Context**: Performance traces from virtual machines hosted in a Bitbrains managed enterprise cloud datacenter (customers include major financial institutions, credit card operators, and enterprise web applications).
- **Extracted Records**: 18,427 rows across 50 representative VMs.
- **Trace Duration**: ~30 calendar days sampled sequentially.

## 2. Features and Schema

| Column | Type | Description | Source / Derivation |
| :--- | :--- | :--- | :--- |
| `timestamp` | String (ISO) | UTC Timestamp of workload snapshot | Converted from raw Unix epoch |
| `vm_id` | String | Virtual Machine identifier (VM_0001 to VM_0050) | Original Trace ID |
| `current_cpu` | Float (%) | Actual CPU Utilization at time $t$ | Direct measurement (0.0% to 100.0%) |
| `current_memory` | Float (%) | Actual Memory Utilization at time $t$ | Direct measurement (0.0% to 100.0%) |
| `current_io` | Float (MB/s) | Storage throughput (Read + Write) | Sum of disk read and write throughput |
| `current_network` | Float (MB/s) | Network throughput (Rx + Tx) | Sum of network received and transmitted |
| `previous_cpu` | Float (%) | CPU Utilization at $t-1$ | Lag feature (1-step history) |
| `previous_memory` | Float (%) | Memory Utilization at $t-1$ | Lag feature (1-step history) |
| `rolling_cpu_mean` | Float (%) | 5-step rolling average of CPU | Rolling window statistic |
| `rolling_cpu_std` | Float (%) | 5-step rolling standard deviation of CPU | Volatility / Burstiness indicator |
| `rolling_memory_mean`| Float (%) | 5-step rolling average of Memory | Rolling window statistic |
| `request_rate` | Float (req/s)| Estimated request throughput | Derived via Little's Law from Network & CPU load |
| `active_users` | Integer | Estimated concurrent user sessions | Proportional to request rate |
| `traffic_growth` | Float | Rate of change $\frac{CPU_t - CPU_{t-1}}{CPU_{t-1} + 1}$ | Velocity indicator |
| `hour` | Integer (0-23)| Hour of the day (UTC) | Diurnal pattern feature |
| `day` | Integer (0-6) | Day of week (0=Monday, 6=Sunday) | Weekly seasonality feature |
| `workload_intensity`| String | Qualitative scale: Low, Normal, Elevated, High, Extreme | Categorized based on resource pressure |
| `workload_type` | String | E-Commerce, Web Traffic, Flash Sale, Batch Processing, HPC | Cluster profile classification |
| `future_cpu` | Float (%) | Target: Future CPU utilization at $t + \Delta t$ | Supervised regression label |
| `future_memory` | Float (%) | Target: Future Memory utilization at $t + \Delta t$ | Secondary target |
| `future_request_rate`| Float (req/s)| Target: Future Request Rate at $t + \Delta t$ | Workload scaling target |

## 3. Preprocessing Steps Applied
1. **Raw Ingestion**: Extracted from raw Bitbrains trace archive files.
2. **Missing Value Handling**: Numeric columns converted to float64, missing or corrupt entries imputed with mean/zeros.
3. **Outlier Clipping**: CPU and Memory bounded in [0.0%, 100.0%].
4. **Chronological Sorting**: Sorted by Unix timestamp and VM identifier.
5. **Unit Normalization**: Throughput converted to standard MB/s.
6. **Feature Engineering**: Generated temporal, lag, rolling statistical, and rate-of-change metrics.
7. **Target Formulation**: Look-ahead horizon $t + H$ for supervised training.

## 4. Train / Test Split Methodology
- **Split Type**: Temporal chronological split (80% Train, 20% Test).
- Preserves time-series causality without future data leakage.

## 5. Limitations
- Trace measurements reflect virtualized enterprise datacenter loads; extreme single-event retail blackouts are simulated via controlled stress scenarios.
