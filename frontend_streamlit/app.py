import streamlit as st
import requests
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import time
import json

st.set_page_config(layout="wide", page_title="CloudPilot Dashboard", page_icon="☁️")

API_URL = "http://localhost:8000/api"

# -- Utility Functions --
def fetch_health():
    try:
        return requests.get(f"{API_URL}/health", timeout=2).json()
    except:
        return None

def fetch_vms():
    try:
        return requests.get(f"{API_URL}/vms").json().get("vms", [])
    except:
        return []

def run_pipeline(workload):
    try:
        return requests.post(f"{API_URL}/pipeline/run", json=workload).json()
    except Exception as e:
        st.error(f"Pipeline error: {e}")
        return None

def run_compare(workload):
    try:
        return requests.post(f"{API_URL}/compare", json=workload).json()
    except:
        return None

def fetch_db_summary():
    try:
        return requests.get(f"{API_URL}/db/summary").json()
    except:
        return {}

# -- Sidebar --
st.sidebar.title("☁️ CloudPilot")
st.sidebar.subheader("Predictive Multi-Agent Cloud Resource Management")
st.sidebar.markdown("---")

page = st.sidebar.radio("Navigation", [
    "System Dashboard", 
    "Live Simulation",
    "Reactive vs CloudPilot", 
    "VM Infrastructure", 
    "Experiment Results"
])

st.sidebar.markdown("---")
health = fetch_health()
if health:
    st.sidebar.success("● SYSTEM ONLINE")
    st.sidebar.text(f"Backend: ONLINE\nML Model: {health.get('model', 'READY')}\nRAG: READY\nDatabase: CONNECTED")
else:
    st.sidebar.error("● SYSTEM OFFLINE")

# -- Pages --

if page == "System Dashboard":
    st.title("CLOUDPILOT")
    st.markdown("### Predictive Multi-Agent Cloud Resource Management")
    st.markdown("---")
    
    if not health:
        st.warning("Backend API is not reachable.")
        st.stop()
        
    st.subheader("REAL-TIME CLOUD STATE")
    vms = fetch_vms()
    total_cpu_cap = sum(v['vcpu'] for v in vms)
    total_mem_cap = sum(v['memory_gb'] for v in vms)
    total_cpu_used = sum(v['used_cpu_pct'] / 100.0 * v['vcpu'] for v in vms)
    total_mem_used = sum(v['used_mem_gb'] for v in vms)
    
    cpu_util = (total_cpu_used / total_cpu_cap * 100) if total_cpu_cap else 0
    mem_util = (total_mem_used / total_mem_cap * 100) if total_mem_cap else 0
    active_vms = sum(1 for v in vms if v['status'] != 'idle')
    
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Overall CPU Utilization", f"{cpu_util:.1f}%")
    c2.metric("Overall Memory Utilization", f"{mem_util:.1f}%")
    c3.metric("Active VMs", f"{active_vms} / {len(vms)}")
    c4.metric("CloudPilot Status", "OPTIMIZED", "Active")
    
    st.markdown("---")
    st.subheader("SYSTEM HEALTH AND METRICS")
    col1, col2, col3, col4 = st.columns(4)
    counts = health.get("table_counts", {})
    col1.metric("Simulations Run", counts.get("simulation_runs", 0))
    col2.metric("Allocations", counts.get("allocation_history", 0))
    col3.metric("Agent Events", counts.get("agent_events", 0))
    col4.metric("RAG Historical Cases", counts.get("rag_cases", 0))
    
    st.markdown("---")
    st.subheader("DECISION INTELLIGENCE MODEL")
    metrics = health.get("model_metrics", {})
    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Primary Model", health.get("model", "N/A"))
    m2.metric("MAE", metrics.get("mae", "N/A"))
    m3.metric("RMSE", metrics.get("rmse", "N/A"))
    m4.metric("R-Squared Score", metrics.get("r2", "N/A"))
    
    if vms:
        st.markdown("---")
        st.subheader("RESOURCE ALLOCATION")
        df_vms = pd.DataFrame(vms)
        df_vms['cpu_util_display'] = df_vms['used_cpu_pct']
        fig = px.bar(df_vms, x="id", y="cpu_util_display", color="status", 
                     title="Live VM CPU Utilization",
                     labels={"cpu_util_display": "CPU Used (%)", "id": "VM Instance"},
                     color_discrete_map={"idle": "#1f2937", "allocated": "#00e5ff", "overloaded": "#ef4444"})
        fig.update_layout(plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)")
        st.plotly_chart(fig, use_container_width=True)

elif page == "Live Simulation":
    st.title("🔴 LIVE SIMULATION")
    st.markdown("Run realistic cloud workloads through the multi-agent pipeline.")
    
    col_ctrl, col_mon = st.columns([1, 2])
    
    with col_ctrl:
        st.subheader("Control Panel")
        scenario = st.selectbox("Workload Scenario", ["normal", "elevated", "batch_processing", "flash_sale"])
        
        if st.button("▶ RUN SINGLE WORKLOAD", use_container_width=True, type="primary"):
            wl = requests.get(f"{API_URL}/workload/generate?scenario={scenario}&step=0").json()
            st.session_state['current_wl'] = wl
            st.session_state['pipeline_result'] = run_pipeline(wl)
            
        st.markdown("---")
        st.markdown("### ⚡ ONE-CLICK DEMO")
        if st.button("▶ RUN E-COMMERCE FLASH SALE", use_container_width=True, type="primary"):
            st.session_state['flash_sale_running'] = True
            
    with col_mon:
        st.subheader("Live Workload Monitor")
        m1, m2, m3, m4 = st.columns(4)
        m_cpu = m1.empty()
        m_mem = m2.empty()
        m_rr = m3.empty()
        m_usr = m4.empty()
        
        m_cpu.metric("CPU Util", "N/A")
        m_mem.metric("Memory Util", "N/A")
        m_rr.metric("Req/Sec", "N/A")
        m_usr.metric("Active Users", "N/A")
        
        chart_placeholder = st.empty()
    
    # Handle Flash Sale Execution
    if st.session_state.get('flash_sale_running', False):
        st.markdown("### 🏃 Executing Flash Sale Sequence...")
        sequence = requests.get(f"{API_URL}/workload/flash-sale-sequence?steps=10").json()["steps"]
        
        history_df = []
        progress_bar = st.progress(0)
        
        res_placeholder = st.empty()
        
        for idx, wl in enumerate(sequence):
            # Update Monitors
            m_cpu.metric("CPU Util", f"{wl['current_cpu']}%", f"{wl['traffic_growth']*100:.1f}%")
            m_mem.metric("Memory Util", f"{wl['current_memory']}%")
            m_rr.metric("Req/Sec", wl['request_rate'])
            m_usr.metric("Active Users", wl['active_users'])
            
            # Run Pipeline
            res = run_pipeline(wl)
            st.session_state['pipeline_result'] = res
            
            # Update Chart
            history_df.append({
                "Step": idx,
                "CPU (Actual)": wl["current_cpu"],
                "CPU (Predicted)": res["stages"]["prediction"]["predicted_cpu"],
                "Request Rate": wl["request_rate"]
            })
            df_plot = pd.DataFrame(history_df)
            fig = px.line(df_plot, x="Step", y=["CPU (Actual)", "CPU (Predicted)"], title="Flash Sale CPU Trajectory")
            chart_placeholder.plotly_chart(fig, use_container_width=True)
            
            with res_placeholder.container():
                st.info(f"Step {idx+1}/10: Workload={wl['workload_intensity']} | Predicted={res['stages']['prediction']['predicted_cpu']}% | VM={res['selected_vm']} | Status={res['final_status']} | Latency={res['end_to_end_ms']}ms")
            
            progress_bar.progress((idx + 1) / len(sequence))
            time.sleep(1.5) # Allow human to see animation
            
        st.session_state['flash_sale_running'] = False
        st.success("Flash Sale Sequence Complete!")

    # Display Agent Pipeline details if available
    res = st.session_state.get('pipeline_result')
    if res:
        st.markdown("---")
        st.header("🧠 AGENT PIPELINE RESULTS")
        st.metric("Total Decision & Execution Latency", f"{res['end_to_end_ms']} ms")
        
        tabs = st.tabs(["🗺️ Mapping", "📈 Prediction", "🔎 RAG Retrieval", "🧠 Reasoning", "⚙️ Execution"])
        
        with tabs[0]:
            st.subheader("Mapping Agent")
            st.write(f"Evaluated VMs. Latency: {res['stages']['mapping']['latency_ms']} ms")
            cands = res['stages']['mapping']['candidates']
            if cands:
                st.table(pd.DataFrame(cands)[["vm_id", "available_cpu_pct", "available_mem_gb", "fit_score"]])
            
            rejs = res['stages']['mapping']['rejected']
            if rejs:
                st.write("Rejected VMs:")
                for r in rejs:
                    st.error(f"**{r['vm_id']}** - " + ", ".join(r['rejection_reasons']))
                    
        with tabs[1]:
            st.subheader("Prediction Agent")
            p = res['stages']['prediction']
            st.write(f"Latency: {p['latency_ms']} ms | Model: {p['model']}")
            col1, col2, col3 = st.columns(3)
            col1.metric("Predicted CPU", f"{p['predicted_cpu']}%")
            col2.metric("SLA Risk", p['sla_risk'])
            col3.metric("Trend", p['trend'])
            st.write(f"Confidence Range: {p['confidence_low']}% - {p['confidence_high']}%")
            
        with tabs[2]:
            st.subheader("Retrieval-Augmented Reasoning")
            rag = res['stages']['rag']
            st.write(f"Latency: {rag['latency_ms']} ms")
            if rag.get('retrieved_cases'):
                df_rag = pd.DataFrame(rag['retrieved_cases'])
                st.table(df_rag[["case_id", "similarity", "workload_cpu", "selected_vm", "result", "response_time_ms"]])
            else:
                st.info("No historical cases found.")
                
        with tabs[3]:
            st.subheader("Decision Intelligence")
            rs = res['stages']['reasoning']
            st.write(f"Latency: {rs['latency_ms']} ms")
            st.success(f"**Selected VM:** {rs['selected_vm']} (Score: {rs['score']})")
            st.markdown("**Reasoning Trace:**")
            for reason in rs.get('reasons', []):
                st.write(f"- {reason}")
                
        with tabs[4]:
            st.subheader("Execution Agent")
            ex = res['stages']['execution']
            st.write(f"Latency: {ex['execution_latency_ms']} ms")
            if ex['status'] == "SUCCESS":
                st.success(f"Allocation SUCCESS on {ex['selected_vm']}")
            else:
                st.error(f"Allocation FAILED: {ex.get('message', '')}")
            st.write(f"CPU Before: {ex['available_cpu_before']}% | After: {ex['available_cpu_after']}%")
            st.write(f"Mem Before: {ex['available_mem_before']}GB | After: {ex['available_mem_after']}GB")

elif page == "Reactive vs CloudPilot":
    st.title("⚖️ REACTIVE VS CLOUDPILOT PROACTIVE")
    st.markdown("Compare traditional threshold-based reactive scaling vs CloudPilot's proactive multi-agent intelligence.")
    
    scenario = st.selectbox("Test Scenario", ["elevated", "flash_sale", "normal"])
    
    if st.button("RUN COMPARISON", type="primary"):
        with st.spinner("Running identical workloads through both strategies..."):
            wl = requests.get(f"{API_URL}/workload/generate?scenario={scenario}&step=0").json()
            comp = run_compare(wl)
            
        if comp:
            st.subheader("Comparison Results")
            c = comp["comparison"]
            
            col1, col2 = st.columns(2)
            
            with col1:
                st.error("### Traditional Reactive")
                st.metric("Status", c["reactive_status"])
                st.metric("Selected VM", str(c["reactive_vm"]))
                st.metric("Decision & Response Time", f"{c['reactive_response_ms']} ms")
                st.write("Uses simple >80% CPU threshold. Prone to SLA violations during rapid spikes.")
                
            with col2:
                st.success("### CloudPilot Proactive")
                st.metric("Status", c["cloudpilot_status"])
                st.metric("Selected VM", str(c["cloudpilot_vm"]))
                st.metric("Decision & Response Time", f"{c['cloudpilot_latency_ms']} ms")
                st.write("Uses Prediction + RAG to proactively secure resources before saturation.")

elif page == "VM Infrastructure":
    st.title("☁️ LIVE VM POOL")
    if st.button("Refresh State"):
        pass
    if st.button("Reset All VMs", type="primary"):
        requests.post(f"{API_URL}/vms/reset")
        st.success("VM pool reset!")
        
    vms = fetch_vms()
    if vms:
        df_vms = pd.DataFrame(vms)
        st.dataframe(df_vms, use_container_width=True)
        
        # Draw Utilization Charts
        fig = px.bar(df_vms, x="id", y=["used_cpu_pct", "available_cpu_pct"], title="CPU Allocation State", barmode='stack')
        st.plotly_chart(fig, use_container_width=True)

elif page == "Experiment Results":
    st.title("📊 EXPERIMENT RESULTS & HISTORY")
    
    summary = fetch_db_summary()
    st.write(summary.get("table_counts", {}))
    
    st.subheader("Recent Allocations")
    recent = summary.get("recent_allocations", [])
    if recent:
        st.dataframe(pd.DataFrame(recent))



