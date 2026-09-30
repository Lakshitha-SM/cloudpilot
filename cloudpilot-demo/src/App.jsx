import { useState, useRef, useCallback, useMemo, useEffect } from 'react'

const VM_SEED = [
  { id: 'vm-01', cpu: 32, mem: 28, io: 'std', region: 'ap-south-1a' },
  { id: 'vm-02', cpu: 71, mem: 65, io: 'std', region: 'ap-south-1a' },
  { id: 'vm-03', cpu: 18, mem: 22, io: 'high', region: 'ap-south-1b' },
  { id: 'vm-04', cpu: 54, mem: 40, io: 'std', region: 'ap-south-1b' },
  { id: 'vm-05', cpu: 12, mem: 15, io: 'high', region: 'ap-south-1c' },
  { id: 'vm-06', cpu: 88, mem: 79, io: 'std', region: 'ap-south-1c' },
]

const VM_DETAILS = {
  'vm-01': { cpuUtil: 42, memUtil: 31, io: 'Medium', bandwidth: 'Low', availability: 'Available', score: 72 },
  'vm-02': { cpuUtil: 81, memUtil: 69, io: 'Medium', bandwidth: 'Medium', availability: 'Busy', score: 41 },
  'vm-03': { cpuUtil: 58, memUtil: 44, io: 'High', bandwidth: 'High', availability: 'Available', score: 84 },
  'vm-04': { cpuUtil: 64, memUtil: 52, io: 'Medium', bandwidth: 'Medium', availability: 'Busy', score: 61 },
  'vm-05': { cpuUtil: 25, memUtil: 21, io: 'High', bandwidth: 'High', availability: 'Available', score: 94 },
  'vm-06': { cpuUtil: 92, memUtil: 88, io: 'Medium', bandwidth: 'High', availability: 'Overloaded', score: 33 },
}

const REQUEST = { cpu: 4, mem: 8, io: 'high', label: '4 vCPU · 8 GB RAM · High I/O' }
const DEFAULT_REQUEST = { cpu: 4, memory: 8, io: 'High', bandwidth: 'High', workloadType: 'E-Commerce', traffic: 'High' }

const CPU_OPTIONS = [1, 2, 4, 8, 16]
const MEMORY_OPTIONS = [0.5, 1, 2, 4, 8, 16, 32]
const IOTYPES = ['Low', 'Medium', 'High']
const BANDWIDTHS = ['Low', 'Medium', 'High']
const WORKLOAD_TYPES = ['Normal', 'Web Traffic', 'E-Commerce', 'Flash Sale', 'Batch Processing', 'High Performance Computing']
const TRAFFIC_LEVELS = ['Low', 'Medium', 'High', 'Extreme']

const PREDICTED = {
  'vm-01': 46, 'vm-02': 81, 'vm-03': 84, 'vm-04': 62, 'vm-05': 24, 'vm-06': 93,
}

const HISTORY_DOCS = [
  { vm: 'vm-03', text: 'vm-03 saturated to 91% CPU under similar high-I/O burst — allocation delayed 14 min', sim: 0.89 },
  { vm: 'vm-05', text: 'vm-05 completed 6 comparable high-I/O jobs with zero saturation events', sim: 0.94 },
  { vm: 'vm-01', text: 'vm-01 held steady under moderate load, no I/O class match', sim: 0.41 },
]

const SCENARIOS = {
  normal: {
    label: 'Normal Workload',
    currentCpu: 42,
    currentMemory: 36,
    currentIo: 'Medium',
    currentBandwidth: 'Medium',
    incoming: 1200,
    predicted: 1600,
    intensity: 'Moderate',
    predictedCpu: 58,
    predictedMemory: 49,
    predictedIo: 'Medium',
    predictedBandwidth: 'Medium',
    horizon: 'Next 5 minutes',
    responseTime: 126,
    alert: 'Healthy',
  },
  gradual: {
    label: 'Gradual Increase',
    currentCpu: 54,
    currentMemory: 47,
    currentIo: 'Medium',
    currentBandwidth: 'Medium',
    incoming: 2400,
    predicted: 3100,
    intensity: 'Elevated',
    predictedCpu: 69,
    predictedMemory: 61,
    predictedIo: 'High',
    predictedBandwidth: 'High',
    horizon: 'Next 10 minutes',
    responseTime: 148,
    alert: 'Healthy',
  },
  spike: {
    label: 'Sudden Traffic Spike',
    currentCpu: 66,
    currentMemory: 59,
    currentIo: 'High',
    currentBandwidth: 'High',
    incoming: 4800,
    predicted: 6200,
    intensity: 'High',
    predictedCpu: 81,
    predictedMemory: 74,
    predictedIo: 'High',
    predictedBandwidth: 'High',
    horizon: 'Next 8 minutes',
    responseTime: 182,
    alert: 'At Risk',
  },
  flash: {
    label: 'E-Commerce Flash Sale',
    currentCpu: 45,
    currentMemory: 42,
    currentIo: 'High',
    currentBandwidth: 'High',
    incoming: 1000,
    predicted: 8500,
    intensity: 'Extreme',
    predictedCpu: 91,
    predictedMemory: 82,
    predictedIo: 'High',
    predictedBandwidth: 'High',
    horizon: 'Next 3 minutes',
    responseTime: 208,
    alert: 'At Risk',
  },
  extreme: {
    label: 'Extreme Workload',
    currentCpu: 78,
    currentMemory: 71,
    currentIo: 'High',
    currentBandwidth: 'High',
    incoming: 9000,
    predicted: 12500,
    intensity: 'Critical',
    predictedCpu: 96,
    predictedMemory: 89,
    predictedIo: 'High',
    predictedBandwidth: 'High',
    horizon: 'Next 2 minutes',
    responseTime: 244,
    alert: 'Critical',
  },
}

const EXECUTION_STEPS = [
  'Request validated',
  'VM selected',
  'Resource availability checked',
  'VM reservation initiated',
  'Resources allocated',
  'Allocation verified',
  'Database/log updated',
]

const MODEL_HISTORY = [
  { workload: 34, predicted: 39 },
  { workload: 41, predicted: 48 },
  { workload: 56, predicted: 59 },
  { workload: 61, predicted: 65 },
  { workload: 68, predicted: 73 },
  { workload: 74, predicted: 79 },
  { workload: 81, predicted: 86 },
]

function nowStamp() {
  const d = new Date()
  return d.toTimeString().slice(0, 8)
}

const STEPS_WITH = ['idle', 'mapping', 'prediction', 'rag', 'aprda', 'reasoning', 'execution', 'done']
const STEPS_WITHOUT = ['idle', 'reactive-pick', 'degrading', 'failed']

const initialAgentStatus = {
  mapping: 'IDLE',
  prediction: 'IDLE',
  rag: 'IDLE',
  aprda: 'IDLE',
  reasoning: 'IDLE',
  execution: 'IDLE',
}

function evaluateModel(points) {
  const errors = points.map(p => p.predicted - p.workload)
  const mae = errors.reduce((sum, value) => sum + Math.abs(value), 0) / points.length
  const rmse = Math.sqrt(errors.reduce((sum, value) => sum + value * value, 0) / points.length)
  const mean = points.reduce((sum, point) => sum + point.workload, 0) / points.length
  const ssTot = points.reduce((sum, point) => sum + (point.workload - mean) ** 2, 0)
  const ssRes = points.reduce((sum, point) => sum + (point.predicted - point.workload) ** 2, 0)
  const r2 = ssTot === 0 ? 1 : 1 - (ssRes / ssTot)

  return {
    mae: mae.toFixed(2),
    rmse: rmse.toFixed(2),
    r2: r2.toFixed(3),
  }
}

function calculateDecisionScores(vms, requestConfig, workload) {
  const values = vms.map(vm => {
    const detail = VM_DETAILS[vm.id] || {}
    const cpuHeadroom = Math.max(0, 100 - (detail.cpuUtil || 0))
    const memHeadroom = Math.max(0, 100 - (detail.memUtil || 0))
    const ioBonus = vm.io === requestConfig.io.toLowerCase() || requestConfig.io === 'High' ? 18 : 8
    const bandwidthBonus = detail.bandwidth === requestConfig.bandwidth ? 12 : 5
    const predictionPenalty = Math.max(0, PREDICTED[vm.id] - workload.predictedCpu)
    const historicalBoost = vm.id === 'vm-05' ? 18 : vm.id === 'vm-03' ? 10 : 6
    const score = Math.min(99, Math.round(
      cpuHeadroom * 0.18 +
      memHeadroom * 0.16 +
      ioBonus +
      bandwidthBonus +
      historicalBoost +
      (requestConfig.cpu <= 8 ? 12 : 7) -
      (detail.cpuUtil || 0) * 0.12 -
      predictionPenalty * 0.18
    ))

    return { ...vm, detail, score }
  })

  return values.sort((a, b) => b.score - a.score)
}

function getCandidateVMs() {
  return VM_SEED.filter(v => v.cpu < 60 && v.mem < 60)
}

function buildDecisionText(selectedVm, requestConfig, workload) {
  if (selectedVm === 'vm-05') {
    return 'VM-05 was selected because it meets the CPU and memory constraints, supports the required high I/O profile, keeps current utilization low, and aligns with historical cases that performed successfully under similar workload spikes.'
  }

  const vm = VM_SEED.find(v => v.id === selectedVm)
  return `${selectedVm} was chosen because it satisfies the request profile, maintains acceptable latency for the ${workload.label || 'current workload'}, and offers the best balance of resource headroom, history alignment, and SLA protection.`
}

function downloadJson(name, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${name}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

function linePath(points) {
  return points
    .map((p, index) => `${index === 0 ? 'M' : 'L'} ${index * 24} ${110 - p}`)
    .join(' ')
}

export default function App() {
    const [mode, setMode] = useState('with') // 'with' or 'without'
  const [awsMode, setAwsMode] = useState(false) // false=simulation, true=aws live
  const [awsLiveMetrics, setAwsLiveMetrics] = useState(null) // latest CW metrics from the pipeline run
  const [awsStatus, setAwsStatus] = useState({ connection: 'PENDING', mode: 'READ_ONLY', target: '', running: false, stats: null })
  const [awsInstances, setAwsInstances] = useState([])   // real EC2 instances from /api/aws/instances
  const [awsLoading, setAwsLoading] = useState(false)    // loading spinner flag
  const [awsError, setAwsError] = useState(null)         // error message string or null
  const [awsRegion, setAwsRegion] = useState('us-east-1') // from /api/aws/status response
    const [phase, setPhase] = useState('idle')
  const [vmState, setVmState] = useState(() =>
    Object.fromEntries(VM_SEED.map(v => [v.id, { status: 'idle', note: '' }]))
  )
  const [candidates, setCandidates] = useState([])
  const [chosen, setChosen] = useState(null)
  const [log, setLog] = useState([])
  const [running, setRunning] = useState(false)
  const [request, setRequest] = useState(DEFAULT_REQUEST)
  const [scenarioKey, setScenarioKey] = useState('normal')
  const [agentStatus, setAgentStatus] = useState(initialAgentStatus)
  const [executionState, setExecutionState] = useState(EXECUTION_STEPS.map((step, index) => ({ step, done: index === 0 })))
  const [summary, setSummary] = useState(null)
  const [decisionText, setDecisionText] = useState('')
  const [history, setHistory] = useState([])
  const [awsAgentTrace, setAwsAgentTrace] = useState(null) // real pipeline result in AWS mode
  const [expanded, setExpanded] = useState({
    mapping: true,
    prediction: true,
    workflow: true,
    reasoning: true,
    charts: true,
  })
  const timers = useRef([])
  const logEndRef = useRef(null)

  const workload = SCENARIOS[scenarioKey]

  const requestLabel = `${request.cpu} vCPU • ${request.memory === 0.5 ? '512 MB' : request.memory + ' GB'} RAM • ${request.io} I/O`

  // ── AWS helpers ───────────────────────────────────────────────────────────────

  /** Transform an EC2 instance object from /api/aws/instances into a VM card descriptor. */
  function transformAwsInstanceToVm(inst) {
    const nameTag = inst.tags?.find(t => t.Key === 'Name')?.Value || inst.id
    return {
      id: inst.id,
      name: nameTag,
      type: inst.type,
      state: inst.state,
      az: inst.az,
      tags: inst.tags || [],
      isAws: true,
      metrics: inst.metrics,
    }
  }

  const fetchAwsInstances = useCallback(async () => {
    setAwsLoading(true)
    setAwsError(null)
    try {
      const res = await fetch('/api/aws/instances')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      
      const instances = data.instances || []
      const instancesWithMetrics = await Promise.all(instances.map(async (inst) => {
        try {
          const mRes = await fetch(`/api/aws/metrics/${inst.id}`)
          if (mRes.ok) {
            const mData = await mRes.json()
            return { ...inst, metrics: mData }
          }
        } catch(e) {
          console.error("Metric fetch failed", e)
        }
        return inst
      }))
      
      setAwsInstances(instancesWithMetrics)
    } catch (e) {
      setAwsError('Unable to load AWS instances — check backend connectivity')
      setAwsInstances([])
    } finally {
      setAwsLoading(false)
    }
  }, [])

  // ─────────────────────────────────────────────────────────────────────────────

  const pushLog = useCallback((text, tone = 'info') => {
    setLog(l => [...l, { text, tone, t: nowStamp() }])
  }, [])

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [log])

  // In AWS mode: show the real EC2 instances as candidates (populated from awsInstances state).
  // In sim mode: filter VM_SEED as before.
  const candidateList = useMemo(() => {
    if (awsMode) {
      return awsInstances.map(inst => ({
        id: inst.id,
        name: inst.tags?.find(t => t.Key === 'Name')?.Value || inst.id,
        type: inst.type,
        state: inst.state,
        az: inst.az,
        isAws: true,
      }))
    }
    return getCandidateVMs()
  }, [awsMode, awsInstances])

  const decisionScores = useMemo(() => calculateDecisionScores(VM_SEED, request, workload), [request, workload])
  const recommendedVm = decisionScores[0]?.id || 'vm-05'

  const modelMetrics = useMemo(() => evaluateModel(MODEL_HISTORY), [])

  const chartSeries = [24, 38, 46, 58, 70, 88, 76]
  const predictedSeries = [32, 46, 61, 77, 84, 90, 96]

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  const schedule = (fn, delay) => {
    const id = setTimeout(fn, delay)
    timers.current.push(id)
  }

  const reset = () => {
    clearTimers()
    setRunning(false)
    setPhase('idle')
    setLog([])
    setCandidates([])
    setChosen(null)
    setSummary(null)
    setDecisionText('')
    setHistory([])
    setAwsAgentTrace(null)
    setAwsLiveMetrics(null)
    setAgentStatus(initialAgentStatus)
    setExecutionState(EXECUTION_STEPS.map((step, index) => ({ step, done: index === 0 })))
    setVmState(Object.fromEntries(VM_SEED.map(v => [v.id, { status: 'idle', note: '' }])))
  }

  const switchMode = (m) => {
    if (running) return
    reset()
    setMode(m)
  }

  const updateAgentStatus = (agent, status) => {
    setAgentStatus(current => ({ ...current, [agent]: status }))
  }

  const updateExecutionSteps = (index, done = true) => {
    setExecutionState(current => current.map((step, i) => ({ ...step, done: i < index ? true : (i === index ? done : false) })))
  }

  const runWithout = async () => {
    setRunning(true)
    setAgentStatus(initialAgentStatus)
    setExecutionState(EXECUTION_STEPS.map((step, index) => ({ step, done: index === 0 })))
    pushLog(`Incoming request → ${requestLabel}`, 'req')

    if (awsMode) {
       // AWS mode triggers traffic generator and reads real AWS metrics
       if(awsStatus.connection === 'DISCONNECTED') {
          pushLog("AWS ACTION FAILED: AWS credentials not found. Cannot execute live AWS test.", "error")
          setRunning(false)
          return
       }
       pushLog("AWS REAL-TIME MODE -> Connecting to AWS and starting traffic...", "info")
       fetch(`http://localhost:8000/api/aws/workload/start?target_url=http://example-target.com&scenario=${scenario}`, {method: 'POST'})
       
       // Delay mapping agent to allow metrics to gather
       setTimeout(async () => {
         // ... Proceed with normal pipeline call using AWS EC2 candidates ...
       }, 2000)
    }

    try {
      const res = await fetch('http://localhost:8000/api/baseline/reactive', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            mode: awsMode ? 'aws_live' : 'sim',
          required_vcpu: request.cpu,    // exact vCPU — no multiplication
          required_cpu:  request.cpu,    // same exact value
          required_mem: request.memory,
          required_io: request.io,
          current_cpu: SCENARIOS[scenarioKey].currentCpu,
          current_memory: SCENARIOS[scenarioKey].currentMemory,
        })
      });
      const data = await res.json();
      
      const vmIdStr = data.selected_vm ? data.selected_vm.toLowerCase().replace('vm0', 'vm-0') : 'vm-03';

      schedule(() => {
        setPhase('reactive-pick')
        pushLog('No predictive analysis → request routed reactively')
        setVmState(s => ({ ...s, [vmIdStr]: { status: 'chosen', note: 'reactive selection' } }))
        setChosen(vmIdStr)
        setDecisionText(data.reason)
      }, 700)

      schedule(() => {
        setPhase('degrading')
        pushLog(`Reactive execution: ${data.status}`, data.status === 'SUCCESS' ? 'info' : 'warn')
        setVmState(s => ({ ...s, [vmIdStr]: { status: data.status === 'SUCCESS' ? 'chosen' : 'failed', note: data.status } }))
      }, 2000)

      schedule(() => {
        setPhase('failed')
        if(data.status !== 'SUCCESS') {
           pushLog('SLA breached', 'error');
           updateAgentStatus('execution', 'ERROR');
        } else {
           pushLog('Reactive allocation succeeded', 'info');
           updateAgentStatus('execution', 'COMPLETED');
        }
        setExecutionState(EXECUTION_STEPS.map((step, index) => ({ step, done: index === 0 ? true : index === 6 ? false : false })))
        setSummary({
          selectedVM: vmIdStr,
          allocationDelay: data.decision_latency_ms + 'ms',
          predictedWorkload: 'N/A',
          actualWorkload: 'N/A',
          cpuUtilization: 'N/A',
          memoryUtilization: 'N/A',
          slaStatus: data.sla_violation ? 'BREACHED' : 'OK',
          decisionScore: 'N/A',
        })
        setHistory(h => [{
          requestId: `REQ-${Math.floor(Math.random() * 900 + 100)}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          type: 'Reactive',
          vm: vmIdStr,
          status: data.status,
          latency: data.response_time_ms + 'ms',
        }, ...h])
        setPhase('done')
        setRunning(false)
      }, 3300)
    } catch(e) {
      console.error(e)
      setRunning(false)
    }
  }

  // ── AWS Real-Time pipeline run ────────────────────────────────────────────
  // Calls the real backend pipeline and drives all UI state from the response.
  const runWithAws = async () => {
    setRunning(true)
    setAgentStatus(initialAgentStatus)
    setExecutionState(EXECUTION_STEPS.map((step, index) => ({ step, done: index === 0 })))
    setAwsAgentTrace(null)

    pushLog(`[AWS MODE] Incoming request -> ${requestLabel}`, 'req')
    pushLog(`[AWS MODE] Calling backend pipeline with mode=aws_live ...`, 'info')

    // Build the exact payload — never transform vCPU values
    const workloadPayload = {
      mode: 'aws_live',
      scenario: scenarioKey,
      // ── Resource requirements (sent as-is from the UI dropdowns) ──────────
      required_vcpu: request.cpu,       // exact vCPU count from dropdown (e.g. 1, 2, 4)
      required_cpu:  request.cpu,       // same value — NO multiplication
      required_mem:  request.memory,    // exact GB from dropdown
      required_io:   request.io,
      // ── Workload context (prediction inputs only, NOT capacity requirements) ──
      current_cpu:        workload.currentCpu,
      current_memory:     workload.currentMemory,
      current_io:         workload.currentIo === 'High' ? 0.9 : workload.currentIo === 'Medium' ? 0.5 : 0.2,
      current_network:    0.5,
      request_rate:       workload.incoming,
      workload_type:      request.workloadType || 'E-Commerce',
      workload_type_code: 1,
      workload_intensity: workload.intensity || 'Moderate',
    }

    // Debug log — must match what appears in AWS Resource Evaluation
    pushLog(
      `[AWS MODE] REQUEST PAYLOAD → CPU=${workloadPayload.required_vcpu} vCPU | ` +
      `Mem=${workloadPayload.required_mem} GB | I/O=${workloadPayload.required_io}`,
      'info'
    )

    try {
      // ── Stage 1: Mapping Agent ──────────────────────────────────────────
      setPhase('mapping')
      updateAgentStatus('mapping', 'PROCESSING')
      pushLog('[AWS MODE] Mapping Agent -> querying /api/aws/instances ...', 'info')

      const res = await fetch('/api/pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workloadPayload),
      })

      if (!res.ok) throw new Error(`Backend returned HTTP ${res.status}`)
      const data = await res.json()

      const stg = data.stages || {}
      const mapping    = stg.mapping    || {}
      const prediction = stg.prediction || {}
      const rag        = stg.rag        || {}
      const reasoning  = stg.reasoning  || {}
      const execution  = stg.execution  || {}

      // ── Mapping Agent result ────────────────────────────────────────────
      const awsCandidates = mapping.candidates || mapping.feasible_candidates || []
      const rejected      = mapping.rejected || []

      setCandidates(awsCandidates.map(c => c.vm_id || c.id))
      updateAgentStatus('mapping', 'COMPLETED')
      updateExecutionSteps(0, true)

      const candidateIds = awsCandidates.map(c => c.vm_id || c.id).join(', ') || 'none'
      pushLog(
        `[AWS MODE] Mapping Agent -> discovered ${mapping.candidates_found || 0} instance(s), ` +
        `${mapping.feasible_count || 0} candidate(s): ${candidateIds}`,
        mapping.feasible_count > 0 ? 'info' : 'warn'
      )
      rejected.forEach(r => pushLog(`  -> REJECTED ${r.vm_id}: ${r.reason}`, 'warn'))

      // ── Stage 2: Prediction Agent ───────────────────────────────────────
      await new Promise(r => setTimeout(r, 600))
      setPhase('prediction')
      updateAgentStatus('prediction', 'PROCESSING')
      pushLog(
        `[AWS MODE] Prediction Agent -> predicted CPU ${(prediction.predicted_cpu || 0).toFixed(1)}% ` +
        `| SLA risk: ${prediction.sla_risk || 'N/A'} | trend: ${prediction.trend || 'N/A'}`,
        'info'
      )
      pushLog('  NOTE: Workload metrics from simulation scenario (CloudWatch not yet integrated)', 'warn')
      updateAgentStatus('prediction', 'COMPLETED')

      // ── Stage 3: RAG ────────────────────────────────────────────────────
      await new Promise(r => setTimeout(r, 500))
      setPhase('rag')
      updateAgentStatus('rag', 'PROCESSING')
      const ragCases = rag.retrieved_cases || []
      pushLog(`[AWS MODE] RAG -> retrieved ${ragCases.length} historical case(s) from dataset`, 'rag')
      ragCases.slice(0, 3).forEach(c =>
        pushLog(`  -> case ${c.case_id} (sim=${c.similarity.toFixed(3)}) selected_vm=${c.selected_vm}`, 'rag')
      )
      updateAgentStatus('rag', 'COMPLETED')

      // ── Stage 3.5: APRDA ────────────────────────────────────────────────
      await new Promise(r => setTimeout(r, 400))
      setPhase('aprda')
      updateAgentStatus('aprda', 'PROCESSING')
      const aprdaResult = stg.aprda || {}
      if (aprdaResult.status === 'SUCCESS') {
         pushLog(`[AWS MODE] APRDA -> scored ${aprdaResult.candidates_evaluated} candidates. Selected: ${aprdaResult.selected_resource} (Score: ${(aprdaResult.decision_score || 0).toFixed(4)})`, 'info')
      } else {
         pushLog(`[AWS MODE] APRDA -> Failed to score candidates: ${aprdaResult.error || aprdaResult.reason || 'Unknown error'}`, 'warn')
      }
      updateAgentStatus('aprda', 'COMPLETED')

      // ── Stage 4: Reasoning Agent ────────────────────────────────────────
      await new Promise(r => setTimeout(r, 500))
      const reasoningDecision = reasoning.decision || 'N/A'
      const selectedVm = reasoning.selected_vm || execution.selected_vm || null

      pushLog(
        `[AWS MODE] Reasoning Agent -> decision: ${reasoningDecision} | ` +
        `selected: ${selectedVm || 'none'} | score: ${(reasoning.score || 0).toFixed(3)}`,
        reasoningDecision === 'ALLOCATE' ? 'reason' : 'warn'
      );
      (reasoning.reasons || []).forEach(r => pushLog(`  -> ${r}`, 'rag'))
      updateAgentStatus('reasoning', 'COMPLETED')

      // Update chosen VM in UI
      if (selectedVm) {
        setChosen(selectedVm)
        setDecisionText(
          `[AWS Real-Time] ${reasoningDecision}: ${selectedVm} ` +
          (reasoning.reasons?.[0] ? `— ${reasoning.reasons[0]}` : '')
        )
      }

      updateExecutionSteps(1)
      updateExecutionSteps(2)
      updateExecutionSteps(3)

      // ── Stage 5: Execution Agent ────────────────────────────────────────
      await new Promise(r => setTimeout(r, 400))
      setPhase('execution')
      updateAgentStatus('execution', 'PROCESSING')
      const execStatus = execution.status || 'N/A'

      pushLog(
        `[AWS MODE] Execution Agent -> status: ${execStatus} | ` +
        `AWS mode: ${execution.aws_mode || 'READ_ONLY'}`,
        execStatus === 'DRY_RUN' ? 'success' : 'warn'
      )
      if (execution.dry_run_note) {
        pushLog(`  -> ${execution.dry_run_note}`, 'info')
      }

      updateExecutionSteps(4)
      updateExecutionSteps(5)
      updateExecutionSteps(6)
      updateAgentStatus('execution', 'COMPLETED')

      // ── Store the full trace for the Agent Trace panel ──────────────────
      setAwsAgentTrace({
        runId:       data.run_id,
        endToEndMs:  data.end_to_end_ms,
        finalStatus: data.final_status,
        selectedVm,
        mapping,
        prediction,
        rag,
        aprda:       stg.aprda,
        reasoning,
        execution,
      })

      // ── Pull live CloudWatch metrics from the mapping stage ─────────────
      const cwMetrics = mapping.cloudwatch_metrics
      const cwCurrent = cwMetrics?.current || {}
      const hasCw = cwMetrics?.status === 'OK'
      const cwTs = cwMetrics?.timestamp ? new Date(cwMetrics.timestamp).toLocaleTimeString() : null
      setAwsLiveMetrics(hasCw ? cwCurrent : null)

      // ── Allocation Summary ──────────────────────────────────────────────
      const finalDecision = reasoning.decision || 'N/A'
      const isNoFeasible = finalDecision === 'NO_FEASIBLE_RESOURCE'
      setSummary({
        selectedVM:        isNoFeasible ? 'NO FEASIBLE AWS RESOURCE' : (selectedVm || 'Awaiting decision'),
        allocationDelay:   `${(data.end_to_end_ms || 0).toFixed(0)}ms`,
        predictedWorkload: `${(prediction.predicted_cpu || 0).toFixed(1)}%`,
        decision:          finalDecision,
        decisionSource:    'AWS EC2 + CloudWatch',
        mode:              'AWS_REALTIME',
        // Real CloudWatch values
        cpuUtilization:    hasCw && cwCurrent.cpu_utilization != null
          ? `${cwCurrent.cpu_utilization.toFixed(2)}% (CloudWatch${cwTs ? ' · ' + cwTs : ''})`
          : 'Awaiting CloudWatch data',
        memoryUtilization: hasCw && cwCurrent.memory_used_percent != null
          ? `${cwCurrent.memory_used_percent.toFixed(2)}% (CloudWatch)`
          : 'Awaiting CloudWatch data',
        diskUtilization:   hasCw && cwCurrent.disk_used_percent != null
          ? `${cwCurrent.disk_used_percent.toFixed(2)}% (CloudWatch)`
          : 'Not reported by AWS',
        networkIn:         hasCw && cwCurrent.network_bytes_received != null
          ? `${(cwCurrent.network_bytes_received / 1024).toFixed(1)} KB/s (CloudWatch)`
          : 'Not reported by AWS',
        networkOut:        hasCw && cwCurrent.network_bytes_sent != null
          ? `${(cwCurrent.network_bytes_sent / 1024).toFixed(1)} KB/s (CloudWatch)`
          : 'Not reported by AWS',
        actualWorkload:    hasCw && cwCurrent.cpu_utilization != null
          ? `${cwCurrent.cpu_utilization.toFixed(2)}% CPU (CloudWatch)`
          : 'Awaiting CloudWatch data',
        slaStatus:         (() => {
          if (!hasCw) return 'Awaiting CloudWatch data'
          const cpu = cwCurrent.cpu_utilization ?? 0
          const mem = cwCurrent.memory_used_percent ?? 0
          if (cpu > 85 || mem > 80) return 'AT RISK'
          return 'HEALTHY'
        })(),
        decisionScore:     isNoFeasible ? 'N/A — No feasible resource' : `${((reasoning.score || 0) * 100).toFixed(1)}%`,
        rejectedInstances: mapping.rejected || [],
        instanceDetails:   mapping.candidates_found ? {
          name: awsInstances[0]?.name || 'CloudPilot-Test-01',
          type: awsInstances[0]?.type || 't3.micro',
          capacity: awsInstances[0] ? `${awsInstances[0].vcpu || 2} vCPU / ${awsInstances[0].memory_gb || 1} GiB` : 'unknown',
        } : null,
      })

      const finalDec = reasoning.decision || 'N/A'
      setHistory(h => [{
        requestId:      `REQ-${Math.floor(Math.random() * 900 + 100)}`,
        timestamp:      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        cpu:            request.cpu,
        memory:         request.memory,
        workload:       scenarioKey,
        runMode:        'AWS_REALTIME',
        instancesConsidered: (mapping.candidates || []).map(c => c.vm_id).join(', ') ||
                             (mapping.rejected || []).map(r => r.vm_id).join(', ') || 'none',
        selectedVm:     finalDec === 'NO_FEASIBLE_RESOURCE'
          ? 'NO_FEASIBLE_RESOURCE'
          : (selectedVm || 'none'),
        allocationTime: `${(data.end_to_end_ms || 0).toFixed(0)}ms`,
        slaStatus:      prediction.sla_risk === 'HIGH' ? 'At Risk' : 'Healthy',
        outcome:        finalDec === 'NO_FEASIBLE_RESOURCE' ? 'NO_FEASIBLE_RESOURCE' :
                        execStatus === 'DRY_RUN' ? 'DRY_RUN (READ_ONLY)' : execStatus,
      }, ...h].slice(0, 6))

      setPhase('done')
      const finalDecisionForLog = reasoning.decision || data.final_status
      pushLog(
        `[AWS MODE] Pipeline complete — ${data.end_to_end_ms?.toFixed(0)}ms — ` +
        `decision: ${finalDecisionForLog} — NO AWS MUTATION`,
        finalDecisionForLog === 'ALLOCATE' || finalDecisionForLog === 'DRY_RUN' ? 'success' : 'warn'
      )
      if (finalDecisionForLog === 'NO_FEASIBLE_RESOURCE') {
        pushLog(
          `[AWS MODE] ${reasoning.reasoning || 'Requested resources exceed capacity of all discovered AWS instances. CloudPilot is operating in READ_ONLY/DRY_RUN mode.'}`,
          'warn'
        )
      }

    } catch (err) {
      pushLog(`[AWS MODE] Pipeline error: ${err.message}`, 'error')
      updateAgentStatus('mapping', 'ERROR')
    } finally {
      setRunning(false)
    }
  }

  // ── Simulation pipeline run (WITH CloudPilot) — completely unchanged ──────
  const runWith = () => {
    if (awsMode) { runWithAws(); return }

    setRunning(true)
    setAgentStatus(initialAgentStatus)
    setExecutionState(EXECUTION_STEPS.map((step, index) => ({ step, done: index === 0 })))
    pushLog(`Incoming request → ${requestLabel}`, 'req')

    schedule(() => {
      setPhase('mapping')
      updateAgentStatus('mapping', 'PROCESSING')
      const ok = getCandidateVMs()
      setCandidates(ok.map(v => v.id))
      pushLog(`Mapping Agent — filtered ${VM_SEED.length} VMs → ${ok.length} meet CPU/RAM/I-O fit`)
      setVmState(s => {
        const next = { ...s }
        VM_SEED.forEach(v => {
          next[v.id] = ok.find(o => o.id === v.id)
            ? { status: 'candidate', note: `${v.cpu}% CPU now` }
            : { status: 'excluded', note: 'below spec' }
        })
        return next
      })
      updateExecutionSteps(0, true)
      updateAgentStatus('mapping', 'COMPLETED')
    }, 700)

    schedule(() => {
      setPhase('prediction')
      updateAgentStatus('prediction', 'PROCESSING')
      pushLog('Prediction Agent — Random Forest scoring next-60-min load per candidate')
      setVmState(s => {
        const next = { ...s }
        Object.keys(PREDICTED).forEach(id => {
          if (next[id]?.status === 'candidate') {
            next[id] = { status: 'predicted', note: `predicted ${PREDICTED[id]}% in 60m` }
          }
        })
        return next
      })
      updateAgentStatus('prediction', 'COMPLETED')
    }, 2100)

    schedule(() => {
      setPhase('rag')
      updateAgentStatus('rag', 'PROCESSING')
      pushLog('RAG Agent — querying ChromaDB for similar past allocations')
      HISTORY_DOCS.forEach((doc, index) => {
        schedule(() => pushLog(`  ↳ retrieved: "${doc.text}" (similarity ${doc.sim})`, 'rag'), index * 380)
      })
      schedule(() => updateAgentStatus('rag', 'COMPLETED'), HISTORY_DOCS.length * 380 + 100)
    }, 3600)

    schedule(() => {
      setPhase('aprda')
      updateAgentStatus('aprda', 'PROCESSING')
      pushLog('APRDA — Scoring candidates on C, U, P, H, S, E factors', 'info')
      schedule(() => updateAgentStatus('aprda', 'COMPLETED'), 500)
    }, 5000)

    schedule(() => {
      setPhase('reasoning')
      updateAgentStatus('reasoning', 'PROCESSING')
      pushLog('Reasoning Agent — LLM weighing fit + prediction + retrieved history + APRDA score → vm-05', 'reason')
      setVmState(s => ({
        ...s,
        'vm-03': { ...s['vm-03'], status: 'risky', note: 'predicted 84% + past saturation on file' },
        'vm-05': { status: 'chosen', note: 'predicted 24% + clean history' },
      }))
      setChosen('vm-05')
      setDecisionText(buildDecisionText('vm-05', request, workload))
      updateExecutionSteps(1)
      updateExecutionSteps(2)
      updateExecutionSteps(3)
      setSummary({
        selectedVM: 'vm-05',
        allocationDelay: '2.6s',
        predictedWorkload: '82%',
        actualWorkload: '38%',
        cpuUtilization: '25%',
        memoryUtilization: '18%',
        slaStatus: 'HEALTHY',
        decisionScore: '94%',
      })
      updateAgentStatus('reasoning', 'COMPLETED')
    }, 5900)

    schedule(() => {
      setPhase('execution')
      updateAgentStatus('execution', 'PROCESSING')
      updateExecutionSteps(4)
      pushLog('Execution Agent — reserving vm-05, writing allocation record to SQLite')
      setVmState(s => ({ ...s, 'vm-05': { status: 'active', note: 'reserved · stable' } }))
    }, 7100)

    schedule(() => {
      updateExecutionSteps(5)
      updateExecutionSteps(6)
      updateAgentStatus('execution', 'COMPLETED')
      setPhase('done')
      pushLog('Allocation complete — vm-05 stable, no SLA risk', 'success')
      setHistory(h => [{
        requestId: `REQ-${Math.floor(Math.random() * 900 + 100)}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        cpu: request.cpu,
        memory: request.memory,
        workload: scenarioKey,
        selectedVm: 'vm-05',
        allocationTime: '2600 ms',
        slaStatus: 'Healthy',
        outcome: 'Success',
      }, ...h].slice(0, 6))
      setRunning(false)
    }, 8200)
  }

  const run = () => {
    if (running) return
    reset()
    schedule(() => (mode === 'with' ? runWith() : runWithout()), 30)
  }

  const [systemHealth, setSystemHealth] = useState({ backend: 'PENDING', ml: 'PENDING', rag: 'PENDING', vms: 'PENDING', db: 'PENDING' })

  useEffect(() => {
    fetch('http://localhost:8000/api/health')
      .then(res => res.json())
      .then(data => {
          setSystemHealth({
            backend: 'ONLINE',
            ml: data.model ? 'READY' : 'OFFLINE',
            rag: 'READY',
            vms: 'ACTIVE',
            db: 'CONNECTED'
          });
      })
      .catch(() => {
          setSystemHealth({ backend: 'OFFLINE', ml: 'UNAVAILABLE', rag: 'UNAVAILABLE', vms: 'UNAVAILABLE', db: 'UNAVAILABLE' });
      });
  }, [])

  
  useEffect(() => {
    if (!awsMode) {
      // Leaving AWS mode — clear instance data so simulation state is clean
      setAwsInstances([])
      setAwsError(null)
      setAwsLoading(false)
      return
    }

    // ── Entered AWS Real-Time Mode ─────────────────────────────────────────────
    // 1. Immediately fetch status (for connection state + region)
    const fetchStatus = () =>
      fetch('/api/aws/status')
        .then(r => r.json())
        .then(s => {
          setAwsStatus(prev => ({ ...prev, connection: s.status, mode: s.mode }))
          if (s.region) setAwsRegion(s.region)
        })
        .catch(() => setAwsStatus(prev => ({ ...prev, connection: 'DISCONNECTED' })))

    // 2. Immediately fetch instances
    fetchStatus()
    fetchAwsInstances()

    // 3. Poll status every 15 s and instances every 15 s
    const statusIntv = setInterval(fetchStatus, 15000)
    const instanceIntv = setInterval(fetchAwsInstances, 15000)

    // 4. Keep the workload/live stats poll (existing behavior)
    const liveIntv = setInterval(() => {
      fetch('/api/aws/workload/live')
        .then(r => r.json())
        .then(stats => setAwsStatus(prev => ({ ...prev, stats })))
        .catch(() => {})
    }, 3000)

    return () => {
      clearInterval(statusIntv)
      clearInterval(instanceIntv)
      clearInterval(liveIntv)
    }
  }, [awsMode, fetchAwsInstances])

  const handleRequestChange = (key, value) => {
    setRequest(current => ({ ...current, [key]: value }))
  }

  const steps = mode === 'with' ? STEPS_WITH : STEPS_WITHOUT
  const stepIndex = steps.indexOf(phase)

  return (
    <div className="app">
      <header className="hero">
        <div style={{display: 'flex', justifyContent: 'center', marginBottom: '20px', gap: '10px'}}>
            <button className={`modebtn ${!awsMode ? 'active on' : 'off'}`} onClick={() => setAwsMode(false)} disabled={running}>SIMULATION MODE</button>
            <button className={`modebtn ${awsMode ? 'active on' : 'off'}`} style={{background: awsMode ? '#f59e0b' : ''}} onClick={() => setAwsMode(true)} disabled={running}>AWS REAL-TIME MODE</button>
          </div>
          <div className="eyebrow">{awsMode ? "LIVE AWS DATA" : "SIMULATION ENVIRONMENT"}</div>
        <h1>CloudPilot</h1>
        <p className="sub">
          Predictive cloud resource allocation using multi-agent decision intelligence,
          machine learning, and retrieval-augmented reasoning.
        </p>
        <div style={{marginTop: '15px', fontSize: '12px', display: 'flex', gap: '15px', justifyContent: 'center', fontWeight: 'bold'}}>
          <span style={{color: systemHealth.backend === 'ONLINE' ? '#10b981' : '#ef4444'}}>● Backend API — {systemHealth.backend}</span>
          <span style={{color: systemHealth.ml === 'READY' ? '#10b981' : '#ef4444'}}>● ML Prediction Model — {systemHealth.ml}</span>
          <span style={{color: systemHealth.rag === 'READY' ? '#10b981' : '#ef4444'}}>● RAG Knowledge Base — {systemHealth.rag}</span>
          <span style={{color: systemHealth.vms === 'ACTIVE' ? '#10b981' : '#ef4444'}}>● VM Resource Pool — {systemHealth.vms}</span>
          <span style={{color: systemHealth.db === 'CONNECTED' ? '#10b981' : '#ef4444'}}>● SQLite Database — {systemHealth.db}</span>
        </div>
      </header>

      <div className="modebar">
        <button
          className={`modebtn ${mode === 'without' ? 'active off' : ''}`}
          onClick={() => switchMode('without')}
          disabled={running}
        >
          Without CloudPilot
        </button>
        <button
          className={`modebtn ${mode === 'with' ? 'active on' : ''}`}
          onClick={() => switchMode('with')}
          disabled={running}
        >
          With CloudPilot
        </button>
      </div>

      <section className="request-panel">
        <div className="panel-header-row">
          <div className="panel-title">APPLICATION RESOURCE REQUEST</div>
            <p style={{fontSize: "13px", margin: "5px 0 15px", opacity: 0.7}}>Define the resource requirements and expected workload characteristics of an incoming application request.</p>
          <button className="action-link" type="button" onClick={() => setRequest(DEFAULT_REQUEST)} disabled={running}>Use default</button>
        </div>

        <div className="request-form-grid">
          <label>
            <span>CPU</span>
            <select value={request.cpu} onChange={e => handleRequestChange('cpu', Number(e.target.value))} disabled={running}>
              {CPU_OPTIONS.map(option => <option key={option} value={option}>{option} vCPU</option>)}
            </select>
          </label>
          <label>
            <span>Memory</span>
            <select value={request.memory} onChange={e => handleRequestChange('memory', Number(e.target.value))} disabled={running}>
              {MEMORY_OPTIONS.map(option => <option key={option} value={option}>{option === 0.5 ? '512 MB' : option + ' GB'}</option>)}
            </select>
          </label>
          <label>
            <span>I/O Requirement</span>
            <select value={request.io} onChange={e => handleRequestChange('io', e.target.value)} disabled={running}>
              {IOTYPES.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <span>Bandwidth</span>
            <select value={request.bandwidth} onChange={e => handleRequestChange('bandwidth', e.target.value)} disabled={running}>
              {BANDWIDTHS.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <span>Workload Type</span>
            <select value={request.workloadType} onChange={e => handleRequestChange('workloadType', e.target.value)} disabled={running}>
              {WORKLOAD_TYPES.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <span>Expected Traffic</span>
            <select value={request.traffic} onChange={e => handleRequestChange('traffic', e.target.value)} disabled={running}>
              {TRAFFIC_LEVELS.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </div>

        <div className="request-summary-box">
          <span className="dot" /> ACTIVE APPLICATION REQUEST: <strong>{requestLabel}</strong>
        </div>
      </section>

      <section className="scenario-panel">
        <div className="panel-header-row">
          <div className="panel-title">Workload Scenario</div>
        </div>
        <div className="scenario-grid">
          {Object.entries(SCENARIOS).map(([key, item]) => (
            <button
              type="button"
              key={key}
              className={`scenario-chip ${scenarioKey === key ? 'active' : ''}`}
              onClick={() => setScenarioKey(key)}
              disabled={running}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="workload-metrics-grid">
          <div className="mini-stat"><span>Current CPU Utilization</span><strong>{workload.currentCpu}%</strong></div>
          <div className="mini-stat"><span>Current Memory Utilization</span><strong>{workload.currentMemory}%</strong></div>
          <div className="mini-stat"><span>Current I/O</span><strong>{workload.currentIo}</strong></div>
          <div className="mini-stat"><span>Current Bandwidth</span><strong>{workload.currentBandwidth}</strong></div>
          <div className="mini-stat"><span>Incoming Requests</span><strong>{workload.incoming}/min</strong></div>
          <div className="mini-stat"><span>Predicted Requests</span><strong>{workload.predicted}/min</strong></div>
          <div className="mini-stat"><span>Workload Intensity</span><strong>{workload.intensity}</strong></div>
        </div>
      </section>

      <div className="request-bar">
        <div className="request-label">
          <span className="dot" /> Request: <code>{requestLabel}</code>
        </div>
        <div className="request-actions">
          <button className="run-btn" onClick={run} disabled={running}>
            {running ? 'Running…' : awsMode ? '▶ Run AWS Decision' : '▶ Run Simulation'}
          </button>
          <button className="reset-btn" onClick={reset} disabled={running}>Reset</button>
        </div>
      </div>

      <div className="pipeline">
        {steps.filter(s => s !== 'idle').map((s, i) => {
          const activeIdx = stepIndex - 1
          const state = i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'pending'
          return (
            <div className={`pipe-node ${state} ${mode}`} key={s}>
              <span className="pipe-num">{i + 1}</span>
              <span className="pipe-label">{labelFor(s)}</span>
            </div>
          )
        })}
      </div>

      <section className="agent-status-panel">
        <div className="panel-title">Real-time Agent Status</div>
        <div className="agent-row">
          {Object.entries(agentStatus).map(([agent, status]) => (
            <div className="agent-card" key={agent}>
              <div className="agent-label">{labelForAgent(agent)}</div>
              <div className={`status-pill ${status.toLowerCase()}`}>{status}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="stage">
        <section className="vm-grid">
          <div className="panel-title">VM Pool</div>

          {awsMode ? (
            /* ── AWS Real-Time Mode ──────────────────────────────────────── */
            <div>
              {/* Status banner — data comes from /api/aws/status */}
              <div className="aws-status-banner">
                <span className="aws-status-dot">⬤</span>
                <span className="aws-status-label">AWS Real-Time Mode</span>
                <span className={`aws-status-pill ${awsStatus.connection === 'CONNECTED' ? 'connected' : 'disconnected'}`}>
                  AWS {awsStatus.connection}
                </span>
                <span className="aws-region-label">Region: {awsRegion}</span>
              </div>

              {/* Loading state */}
              {awsLoading && (
                <div className="aws-loading">⏳ Loading AWS instances…</div>
              )}

              {/* Error state — shown only if not loading */}
              {!awsLoading && awsError && (
                <div className="aws-error">⚠ {awsError}</div>
              )}

              {/* Instance cards — real EC2 data from /api/aws/instances */}
              {!awsLoading && !awsError && (
                <div className="grid enhanced-grid">
                  {awsInstances.length === 0 ? (
                    <div className="aws-empty">No managed AWS instances found.</div>
                  ) : (
                    awsInstances.map(inst => {
                      const vm = transformAwsInstanceToVm(inst)
                      const isRunning = vm.state === 'running'
                      return (
                        <div className="vm-card idle aws-instance-card" key={vm.id}>
                          <div className="vm-id-row">
                            <div className="vm-id">{vm.name}</div>
                            <div className="vm-tag aws-tag">AWS INSTANCE</div>
                          </div>
                          <div className="vm-region">{vm.az}</div>
                          <div className="vm-meta">
                            <span>{vm.type}</span>
                            <span style={{ color: isRunning ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                              {vm.state.toUpperCase()}
                            </span>
                          </div>
                          <div className="vm-note">{vm.id}</div>
                          <div className="vm-metrics" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '0.8rem' }}>
                            <span>CPU: {vm.metrics?.current?.cpu_utilization != null ? `${vm.metrics.current.cpu_utilization}%` : 'N/A'}</span>
                            <span>Mem: {vm.metrics?.current?.memory_used_percent != null ? `${vm.metrics.current.memory_used_percent}%` : 'N/A'}</span>
                            <span>Disk: {vm.metrics?.current?.disk_used_percent != null ? `${vm.metrics.current.disk_used_percent}%` : 'N/A'}</span>
                            <span>Swap: {vm.metrics?.current?.swap_used_percent != null ? `${vm.metrics.current.swap_used_percent}%` : 'N/A'}</span>
                            <span>Net In: {vm.metrics?.current?.network_bytes_received != null ? `${(vm.metrics.current.network_bytes_received / 1024).toFixed(1)} KB` : 'N/A'}</span>
                            <span>Net Out: {vm.metrics?.current?.network_bytes_sent != null ? `${(vm.metrics.current.network_bytes_sent / 1024).toFixed(1)} KB` : 'N/A'}</span>
                            <span>Disk R/W: {vm.metrics?.current?.disk_read_bytes != null ? `${(vm.metrics.current.disk_read_bytes / 1024).toFixed(1)}` : 'N/A'} / {vm.metrics?.current?.disk_write_bytes != null ? `${(vm.metrics.current.disk_write_bytes / 1024).toFixed(1)}` : 'N/A'} KB</span>
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#666', marginTop: '6px' }}>
                            Source: {vm.metrics?.status === 'OK' ? 'AWS CloudWatch' : 'unavailable'} 
                            {vm.metrics?.timestamp ? ` • ${new Date(vm.metrics.timestamp).toLocaleTimeString()}` : ''}
                          </div>
                          {/* Extra tags (skip the Name tag since we already show it as title) */}
                          {vm.tags.filter(t => t.Key !== 'Name').map(tag => (
                            <div key={tag.Key} className="vm-note aws-tag-row">
                              {tag.Key}={tag.Value}
                            </div>
                          ))}
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ── Simulation Mode — unchanged original VM_SEED render ──────── */
            <div className="grid enhanced-grid">
              {VM_SEED.map(v => {
                const st = vmState[v.id] || { status: 'idle', note: '' }
                const detail = VM_DETAILS[v.id]
                return (
                  <div className={`vm-card ${st.status} ${chosen === v.id ? 'highlight' : ''}`} key={v.id}>
                    <div className="vm-id-row">
                      <div className="vm-id">{v.id}</div>
                      <div className="vm-tag">{tagFor(st.status)}</div>
                    </div>
                    <div className="vm-region">{v.region}</div>
                    <div className="vm-meta">
                      <span>CPU {v.cpu}</span>
                      <span>Mem {v.mem}</span>
                      <span>{detail.io}</span>
                    </div>
                    <div className="vm-note">{st.note || `${v.cpu}% CPU · ${v.mem}% MEM`}</div>
                    <div className="vm-metrics">
                      <span>Util: {detail.cpuUtil}%</span>
                      <span>Score: {detail.score}%</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>


        <section className="log-panel">
          <div className="panel-header-row">
            <div className="panel-title">System Log</div>
            <button className="action-link" type="button" onClick={() => setLog([])}>Clear log</button>
          </div>
          <div className="log-body">
            {log.length === 0 && <div className="log-empty">{awsMode ? 'Press ▶ Run AWS Decision to start.' : 'Press ▶ Run Simulation to start.'}</div>}
            {log.map((l, i) => (
              <div className={`log-line ${l.tone}`} key={i}>
                <span className="log-t">{l.t}</span> {l.text}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </section>
      </div>

      <div className="panel-stack">
        <details className="info-panel" open={expanded.mapping}>
          <summary onClick={event => { event.preventDefault(); setExpanded(v => ({ ...v, mapping: !v.mapping })) }}>Mapping Agent</summary>
          <div className="panel-body">
            <div className="mini-caption">Input</div>
            <div className="pill-row">
              <span className="mini-pill">CPU: {request.cpu} vCPU</span>
              <span className="mini-pill">Memory: {request.memory} GB</span>
              <span className="mini-pill">I/O: {request.io}</span>
              <span className="mini-pill">Bandwidth: {request.bandwidth}</span>
            </div>
            <div className="mini-caption">Processing</div>
            <p>Scan VM pool, compare capabilities, filter incompatible hosts, and generate the final candidate list.</p>
            <div className="mini-caption">Output: Candidate {awsMode ? 'AWS Instances' : 'VMs'}</div>
            <div className="candidate-list">
              {candidateList.length ? candidateList.map(vm => (
                <div key={vm.id} className={`candidate-card ${vm.id === chosen ? 'selected' : ''}`}>
                  <span>{vm.name || vm.id}</span>
                  <span className="checkmark">{vm.isAws ? '[AWS]' : '✓'}</span>
                </div>
              )) : <span className="muted-text">No candidates yet.</span>}
            </div>
            {awsMode ? (
              /* AWS candidate table — shows real EC2 fields */
              <div className="candidate-table">
                <div className="candidate-head">
                  <span>Instance ID</span><span>Name</span><span>Type</span>
                  <span>State</span><span>AZ</span>
                </div>
                {candidateList.map(vm => (
                  <div className="candidate-row" key={vm.id}>
                    <span style={{fontFamily:'monospace',fontSize:'11px'}}>{vm.id}</span>
                    <span>{vm.name || '—'}</span>
                    <span>{vm.type || '—'}</span>
                    <span style={{color: vm.state === 'running' ? '#10b981' : '#ef4444'}}>
                      {(vm.state || '—').toUpperCase()}
                    </span>
                    <span>{vm.az || '—'}</span>
                  </div>
                ))}
              </div>
            ) : (
              /* Simulation candidate table — original unchanged */
              <div className="candidate-table">
                <div className="candidate-head"><span>VM</span><span>CPU</span><span>Mem</span><span>I/O</span><span>Util</span><span>Availability</span><span>Region</span></div>
                {candidateList.map(vm => (
                  <div className="candidate-row" key={vm.id}>
                    <span>{vm.id}</span>
                    <span>{vm.cpu}</span>
                    <span>{vm.mem}</span>
                    <span>{vm.io}</span>
                    <span>{VM_DETAILS[vm.id]?.cpuUtil}%</span>
                    <span>{VM_DETAILS[vm.id]?.availability}</span>
                    <span>{vm.region}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="status-note">Mapping Agent: {awsMode ? `AWS Real-Time Mode — ${candidateList.length} instance(s) found` : 'Completed'}</div>
          </div>
        </details>

        <details className="info-panel" open={expanded.prediction}>
          <summary onClick={event => { event.preventDefault(); setExpanded(v => ({ ...v, prediction: !v.prediction })) }}>Prediction Insights</summary>
          <div className="panel-body prediction-layout">
            <div className="prediction-metrics">
              <div className="metric-row"><span>Current Workload</span><strong>{workload.currentCpu}% CPU</strong></div>
              <div className="metric-row"><span>Prediction Horizon</span><strong>{workload.horizon}</strong></div>
              <div className="metric-row"><span>Predicted CPU</span><strong>{workload.predictedCpu}%</strong></div>
              <div className="metric-row"><span>Predicted Memory</span><strong>{workload.predictedMemory}%</strong></div>
              <div className="metric-row"><span>Predicted I/O</span><strong>{workload.predictedIo}</strong></div>
              <div className="metric-row"><span>Predicted Traffic</span><strong>{workload.predicted}/min</strong></div>
            </div>
            <div className="chart-box">
              <div className="chart-title">Historical Workload vs Predicted Workload</div>
              <svg viewBox="0 0 220 120" preserveAspectRatio="none">
                <path d="M 0 90 L 220 90 M 0 0 L 0 90" className="axis" />
                <path d={linePath(chartSeries)} className="historical-line" />
                <path d={linePath(predictedSeries)} className="predicted-line" />
              </svg>
              <div className="legend-row">
                <span><i className="legend-dot history" /> Historical</span>
                <span><i className="legend-dot predicted" /> Predicted</span>
              </div>
            </div>
          </div>
        </details>

        <div className="info-panel">
          <div className="panel-header-row"><div className="panel-title">Prediction Model Performance</div></div>
          <div className="panel-body performance-grid">
            <div className="performance-card"><span>Model</span><strong>Simulated Random Forest</strong></div>
            <div className="performance-card"><span>MAE</span><strong>{modelMetrics.mae}</strong></div>
            <div className="performance-card"><span>RMSE</span><strong>{modelMetrics.rmse}</strong></div>
            <div className="performance-card"><span>R² Score</span><strong>{modelMetrics.r2}</strong></div>
          </div>
        </div>

        <details className="info-panel" open={expanded.reasoning}>
          <summary onClick={event => { event.preventDefault(); setExpanded(v => ({ ...v, reasoning: !v.reasoning })) }}>Decision Intelligence / RAG Reasoning</summary>
          <div className="panel-body reasoning-grid">
            <div>
              <div className="mini-caption">Retrieved Historical Cases</div>
              <ul className="case-list">
                <li><strong>Case #102</strong> — Workload: Flash Sale, CPU 88%, Memory 81%, Selected VM: VM-05, Outcome: Successful</li>
                <li><strong>Case #087</strong> — Workload: E-Commerce Spike, CPU 91%, Selected VM: VM-07, Outcome: Successful</li>
                <li><strong>Case #053</strong> — Workload: High Throughput, CPU 74%, Selected VM: VM-05, Outcome: Successful</li>
              </ul>
            </div>
            <div>
              <div className="mini-caption">Retrieved Knowledge</div>
              <div className="flow-stack">
                <span>Current Workload</span>
                <span>↓</span>
                <span>Prediction</span>
                <span>↓</span>
                <span>Decision Rules</span>
                <span>↓</span>
                <span>Recommended VM</span>
              </div>
            </div>
          </div>
          <div className="reasoning-note">{decisionText || buildDecisionText(chosen || recommendedVm, request, workload)}</div>
        </details>

        <div className="score-panel">
          <div className="panel-header-row"><div className="panel-title">{awsMode ? 'AWS Resource Evaluation' : 'Decision Score'}</div></div>
          {awsMode ? (
            <div className="score-grid">
              {/* AWS mode: show real instance evaluations from awsAgentTrace */}
              {awsAgentTrace ? (
                <>
                  {/* Candidates that passed */}
                  {(awsAgentTrace.mapping?.candidates || []).map(c => (
                    <div key={c.vm_id} className="score-card selected">
                      <span style={{fontFamily:'monospace',fontSize:'11px'}}>{c.name || c.vm_id}</span>
                      <span style={{fontSize:'10px',color:'#6ee7b7'}}>{c.instance_type}</span>
                      <strong style={{color:'#10b981'}}>FEASIBLE</strong>
                      <span style={{fontSize:'10px'}}>Score: {(awsAgentTrace.reasoning?.score || 0).toFixed(3)}</span>
                    </div>
                  ))}
                  {/* Rejected instances */}
                  {(awsAgentTrace.mapping?.rejected || []).map(r => (
                    <div key={r.vm_id} className="score-card" style={{borderColor:'#ef4444'}}>
                      <span style={{fontFamily:'monospace',fontSize:'11px'}}>{r.vm_id}</span>
                      <strong style={{color:'#ef4444'}}>REJECTED</strong>
                      <span style={{fontSize:'10px',color:'#f87171'}}>{r.reason}</span>
                    </div>
                  ))}
                  {/* No instances at all */}
                  {(awsAgentTrace.mapping?.candidates || []).length === 0 &&
                   (awsAgentTrace.mapping?.rejected || []).length === 0 && (
                    <div className="score-card" style={{borderColor:'#6b7280'}}>
                      <span>No AWS instances discovered</span>
                    </div>
                  )}
                </>
              ) : (
                <div style={{padding:'12px',color:'#9ca3af',fontSize:'13px'}}>
                  {phase === 'idle' ? 'Press ▶ Run AWS Decision to evaluate resources.' : 'Evaluating AWS instances…'}
                </div>
              )}
            </div>
          ) : (
            <div className="score-grid">
              {decisionScores.map(vm => (
                <div key={vm.id} className={`score-card ${vm.id === (chosen || recommendedVm) ? 'selected' : ''}`}>
                  <span>{vm.id}</span>
                  <strong>{vm.score}%</strong>
                </div>
              ))}
            </div>
          )}
          <div className="status-note">
            {awsMode
              ? (awsAgentTrace
                  ? `Decision: ${awsAgentTrace.reasoning?.decision || 'N/A'} | Source: AWS EC2 + CloudWatch`
                  : 'Waiting for AWS decision')
              : `Recommended VM: ${chosen || recommendedVm}`
            }
          </div>
        </div>

        <div className="execution-panel">
          <div className="panel-header-row">
            <div className="panel-title">Execution Agent</div>
            {awsMode && <span style={{fontSize:'10px',padding:'2px 8px',background:'#1d4ed8',color:'white',borderRadius:'4px'}}>READ_ONLY / DRY_RUN</span>}
          </div>
          <div className="execution-body">
            <div className="step-list">
              {awsMode ? (
                /* AWS-specific execution steps */
                [
                  { label: 'Request validated', done: phase !== 'idle' },
                  { label: 'AWS instances discovered', done: ['prediction','reasoning','execution','done'].includes(phase) },
                  { label: 'Resource capacity checked', done: ['prediction','reasoning','execution','done'].includes(phase) },
                  { label: 'CloudWatch metrics checked', done: ['reasoning','execution','done'].includes(phase) },
                  { label: 'Resource mapping completed', done: ['reasoning','execution','done'].includes(phase) },
                  { label: awsAgentTrace?.reasoning?.decision === 'NO_FEASIBLE_RESOURCE' ? 'No feasible AWS resource — decision logged' : 'Optimal resource selected', done: phase === 'done' },
                  { label: 'DRY_RUN — No AWS mutation performed', done: phase === 'done' },
                ].map((item, idx) => (
                  <div className={`step-row ${item.done ? 'done' : ''}`} key={idx}>
                    <span className="step-icon">{item.done ? '✓' : '•'}</span>
                    <span>{item.label}</span>
                  </div>
                ))
              ) : (
                executionState.map((item, index) => (
                  <div className={`step-row ${item.done ? 'done' : ''}`} key={item.step}>
                    <span className="step-icon">{item.done ? '✓' : '•'}</span>
                    <span>{item.step}</span>
                  </div>
                ))
              )}
            </div>
            <div className="execution-metrics">
              {awsMode ? (
                /* AWS mode metrics — all sourced from backend pipeline */
                phase === 'idle' ? (
                  <div style={{color:'#9ca3af',fontSize:'13px',padding:'8px'}}>Waiting for AWS decision…</div>
                ) : (
                  <>
                    <div className="metric-row"><span>Decision Time</span><strong>{summary?.allocationDelay || '—'}</strong></div>
                    <div className="metric-row"><span>AWS Decision</span>
                      <strong style={{color: summary?.decision === 'NO_FEASIBLE_RESOURCE' ? '#ef4444' : summary?.decision === 'ALLOCATE' ? '#10b981' : '#f59e0b'}}>
                        {summary?.decision || (running ? 'PROCESSING…' : '—')}
                      </strong>
                    </div>
                    {summary?.decision === 'NO_FEASIBLE_RESOURCE' ? (
                      <>
                        <div className="metric-row"><span>Requested CPU</span><strong>{request.cpu} vCPU</strong></div>
                        <div className="metric-row"><span>Requested Memory</span><strong>{request.memory} GB</strong></div>
                        <div className="metric-row"><span>Status</span><strong style={{color:'#ef4444'}}>NO_FEASIBLE_RESOURCE</strong></div>
                        {summary?.rejectedInstances?.length > 0 && (
                          <div className="metric-row"><span>Rejection reason</span><strong style={{fontSize:'11px',color:'#f87171'}}>{summary.rejectedInstances[0]?.reason}</strong></div>
                        )}
                        <div className="metric-row"><span>AWS Mode</span><strong>READ_ONLY — No mutation</strong></div>
                      </>
                    ) : summary?.decision === 'ALLOCATE' ? (
                      <>
                        <div className="metric-row"><span>Selected Instance</span><strong>{summary?.selectedVM}</strong></div>
                        <div className="metric-row"><span>Requested CPU</span><strong>{request.cpu} vCPU</strong></div>
                        <div className="metric-row"><span>Requested Memory</span><strong>{request.memory} GB</strong></div>
                        <div className="metric-row"><span>Status</span><strong style={{color:'#10b981'}}>DRY_RUN (READ_ONLY)</strong></div>
                        <div className="metric-row"><span>AWS Mode</span><strong>READ_ONLY — No mutation</strong></div>
                      </>
                    ) : null}
                  </>
                )
              ) : (
                /* Simulation mode metrics */
                <>
                  <div className="metric-row"><span>Allocation Time</span><strong>{summary?.allocationDelay || '2.6s'}</strong></div>
                  <div className="metric-row"><span>Allocated VM</span><strong>{chosen || recommendedVm}</strong></div>
                  {chosen === 'NO_FEASIBLE_RESOURCE' ? (
                    <>
                      <div className="metric-row"><span>Allocated CPU</span><strong>N/A</strong></div>
                      <div className="metric-row"><span>Allocated Memory</span><strong>N/A</strong></div>
                      <div className="metric-row"><span>Status</span><strong>FAILED</strong></div>
                    </>
                  ) : (
                    <>
                      <div className="metric-row"><span>Allocated CPU</span><strong>{request.cpu} vCPU</strong></div>
                      <div className="metric-row"><span>Allocated Memory</span><strong>{request.memory} GB</strong></div>
                      <div className="metric-row"><span>Status</span><strong>{running ? 'PROCESSING' : 'SUCCESS'}</strong></div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <details className="info-panel" open={expanded.workflow}>
          <summary onClick={event => { event.preventDefault(); setExpanded(v => ({ ...v, workflow: !v.workflow })) }}>Agent Workflow</summary>
          <div className="panel-body workflow-flow">
            <span>USER REQUEST</span>
            <span>↓</span>
            <span>RESOURCE REQUIREMENTS</span>
            <span>↓</span>
            <span>MAPPING AGENT</span>
            <span>↓</span>
            <span>CANDIDATE VMs</span>
            <span>↓</span>
            <span>PREDICTION AGENT</span>
            <span>↓</span>
            <span>FUTURE WORKLOAD</span>
            <span>↓</span>
            <span>REASONING AGENT + RAG</span>
            <span>↓</span>
            <span>OPTIMAL VM DECISION</span>
            <span>↓</span>
            <span>EXECUTION AGENT</span>
            <span>↓</span>
            <span>RESOURCE ALLOCATION</span>
            <span>↓</span>
            <span>LOGGING / DATABASE</span>
          </div>
        </details>

        <details className="info-panel" open={expanded.charts}>
          <summary onClick={event => { event.preventDefault(); setExpanded(v => ({ ...v, charts: !v.charts })) }}>
            {awsMode ? 'AWS Real-Time Metrics & Predictions' : 'Resource Utilization Graphs (Simulation)'}
          </summary>
          {awsMode ? (
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#9ca3af', marginBottom: '12px', letterSpacing: '0.05em' }}>ACTUAL AWS RESOURCE METRICS</div>
                <div className="chart-grid">
                  <div className="mini-chart" style={{ justifyContent: 'space-between' }}>
                    <div className="mini-chart-header"><span>CPU Utilization</span><strong>{awsLiveMetrics?.cpu_utilization != null ? `${awsLiveMetrics.cpu_utilization.toFixed(2)}%` : 'N/A'}</strong></div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '12px', borderTop: '1px solid #374151', paddingTop: '6px' }}>AWS CloudWatch</div>
                  </div>
                  <div className="mini-chart" style={{ justifyContent: 'space-between' }}>
                    <div className="mini-chart-header"><span>Memory Utilization</span><strong>{awsLiveMetrics?.memory_used_percent != null ? `${awsLiveMetrics.memory_used_percent.toFixed(2)}%` : 'N/A'}</strong></div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '12px', borderTop: '1px solid #374151', paddingTop: '6px' }}>{awsLiveMetrics?.memory_used_percent != null ? 'AWS CloudWatch Agent' : 'CloudWatch Agent unavailable'}</div>
                  </div>
                  <div className="mini-chart" style={{ justifyContent: 'space-between' }}>
                    <div className="mini-chart-header"><span>Disk Utilization</span><strong>{awsLiveMetrics?.disk_used_percent != null ? `${awsLiveMetrics.disk_used_percent.toFixed(2)}%` : 'N/A'}</strong></div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '12px', borderTop: '1px solid #374151', paddingTop: '6px' }}>{awsLiveMetrics?.disk_used_percent != null ? 'AWS CloudWatch Agent' : 'CloudWatch Agent unavailable'}</div>
                  </div>
                  <div className="mini-chart" style={{ justifyContent: 'space-between' }}>
                    <div className="mini-chart-header"><span>Network In</span><strong>{awsLiveMetrics?.network_bytes_received != null ? `${(awsLiveMetrics.network_bytes_received / 1024).toFixed(2)} KB/s` : 'N/A'}</strong></div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '12px', borderTop: '1px solid #374151', paddingTop: '6px' }}>AWS CloudWatch</div>
                  </div>
                  <div className="mini-chart" style={{ justifyContent: 'space-between' }}>
                    <div className="mini-chart-header"><span>Network Out</span><strong>{awsLiveMetrics?.network_bytes_sent != null ? `${(awsLiveMetrics.network_bytes_sent / 1024).toFixed(2)} KB/s` : 'N/A'}</strong></div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '12px', borderTop: '1px solid #374151', paddingTop: '6px' }}>AWS CloudWatch</div>
                  </div>
                  <div className="mini-chart" style={{ justifyContent: 'space-between' }}>
                    <div className="mini-chart-header"><span>Disk Read</span><strong>{awsLiveMetrics?.disk_read_bytes != null ? `${(awsLiveMetrics.disk_read_bytes / 1024).toFixed(2)} KB/s` : 'N/A'}</strong></div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '12px', borderTop: '1px solid #374151', paddingTop: '6px' }}>AWS CloudWatch</div>
                  </div>
                  <div className="mini-chart" style={{ justifyContent: 'space-between' }}>
                    <div className="mini-chart-header"><span>Disk Write</span><strong>{awsLiveMetrics?.disk_write_bytes != null ? `${(awsLiveMetrics.disk_write_bytes / 1024).toFixed(2)} KB/s` : 'N/A'}</strong></div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '12px', borderTop: '1px solid #374151', paddingTop: '6px' }}>AWS CloudWatch</div>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#9ca3af', marginBottom: '12px', letterSpacing: '0.05em' }}>CLOUDPILOT WORKLOAD ANALYSIS</div>
                {awsLoading ? (
                  <div style={{ color: '#9ca3af', fontSize: '14px', fontStyle: 'italic', padding: '16px' }}>Loading workload...</div>
                ) : !awsAgentTrace?.prediction ? (
                  <div style={{ color: '#ef4444', fontSize: '14px', padding: '16px' }}>Current Workload: N/A (Prediction model unavailable)</div>
                ) : (
                  <div className="workload-analysis-card" style={{ background: '#1f2937', padding: '16px', borderRadius: '8px', border: '1px solid #374151' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', textAlign: 'center', marginBottom: '16px' }}>
                      
                      {/* Current */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '8px' }}>Current</div>
                        <strong style={{ fontSize: '18px', color: '#e5e7eb' }}>
                          {awsAgentTrace.prediction.current_cpu != null ? `${awsAgentTrace.prediction.current_cpu.toFixed(2)}%` : 'N/A'}
                        </strong>
                        <div className="bar-container" style={{ height: '60px', width: '20px', background: '#374151', borderRadius: '4px', marginTop: '8px', position: 'relative', overflow: 'hidden' }}>
                           <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${Math.min(100, awsAgentTrace.prediction.current_cpu || 0)}%`, background: '#10b981', transition: 'height 0.5s' }} />
                        </div>
                        <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '8px' }}>{awsAgentTrace.prediction.data_source || 'AWS CloudWatch'}</div>
                      </div>

                      {/* Historical */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '8px' }}>Historical</div>
                        <strong style={{ fontSize: '18px', color: '#e5e7eb' }}>
                          {awsAgentTrace.prediction.input_features?.previous_cpu != null ? `${awsAgentTrace.prediction.input_features.previous_cpu.toFixed(2)}%` : 'Insufficient data'}
                        </strong>
                        <div className="bar-container" style={{ height: '60px', width: '20px', background: '#374151', borderRadius: '4px', marginTop: '8px', position: 'relative', overflow: 'hidden' }}>
                           <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${Math.min(100, awsAgentTrace.prediction.input_features?.previous_cpu || 0)}%`, background: '#6366f1', transition: 'height 0.5s' }} />
                        </div>
                        <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '8px' }}>Historical workload data</div>
                      </div>

                      {/* Predicted */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '8px' }}>Predicted</div>
                        <strong style={{ fontSize: '18px', color: '#e5e7eb' }}>
                          {awsAgentTrace.prediction.predicted_cpu != null ? `${awsAgentTrace.prediction.predicted_cpu.toFixed(2)}%` : 'Prediction unavailable'}
                        </strong>
                        <div className="bar-container" style={{ height: '60px', width: '20px', background: '#374151', borderRadius: '4px', marginTop: '8px', position: 'relative', overflow: 'hidden' }}>
                           <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${Math.min(100, awsAgentTrace.prediction.predicted_cpu || 0)}%`, background: '#f59e0b', transition: 'height 0.5s' }} />
                        </div>
                        <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '8px' }}>{awsAgentTrace.prediction.model || 'Random Forest'}</div>
                      </div>

                    </div>

                    {/* Metadata */}
                    <div style={{ borderTop: '1px solid #374151', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#9ca3af' }}>
                      <div><strong>Data Source:</strong> {awsAgentTrace.prediction.data_source || 'AWS CloudWatch'}</div>
                      <div><strong>Prediction Model:</strong> {awsAgentTrace.prediction.model || 'Random Forest'}</div>
                      {awsAgentTrace.prediction.prediction_horizon && <div><strong>Horizon:</strong> {awsAgentTrace.prediction.prediction_horizon}</div>}
                    </div>

                    {/* Flow */}
                    <div style={{ marginTop: '12px', fontSize: '10px', color: '#6b7280', textAlign: 'center' }}>
                      AWS CloudWatch → Current Workload → Historical Window → {awsAgentTrace.prediction.model || 'Random Forest'} Prediction → Predicted Workload → Reasoning Agent
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="panel-body chart-grid">
              {[
                { label: 'CPU Utilization', current: workload.currentCpu, predicted: workload.predictedCpu, color: 'cyan' },
                { label: 'Memory Utilization', current: workload.currentMemory, predicted: workload.predictedMemory, color: 'violet' },
                { label: 'I/O Utilization', current: 68, predicted: workload.predictedCpu / 1.2, color: 'amber' },
                { label: 'Network Bandwidth', current: 73, predicted: 88, color: 'red' },
                { label: 'Workload Trend', current: workload.currentCpu, predicted: workload.predictedCpu, color: 'green' },
              ].map(item => (
                <div className="mini-chart" key={item.label}>
                  <div className="mini-chart-header">
                    <span>{item.label}</span>
                    <strong>{item.predicted}%</strong>
                  </div>
                  <div className="bar-stack">
                    <div className={`bar ${item.color}`} style={{ height: `${item.current}%` }} />
                    <div className={`bar predicted ${item.color}`} style={{ height: `${item.predicted}%` }} />
                  </div>
                  <div className="chart-labels"><span>Current</span><span>Historical</span><span>Predicted</span></div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '12px', borderTop: '1px solid #374151', paddingTop: '6px' }}>SIMULATION</div>
                </div>
              ))}
            </div>
          )}
        </details>

        <div className="info-panel">
          <div className="panel-header-row"><div className="panel-title">SLA Monitor</div></div>
          <div className="panel-body sla-grid">
            {awsMode ? (
              /* AWS mode: show real CloudWatch values vs thresholds */
              <>
                <div className="metric-row"><span>CPU Threshold (configured)</span><strong>85%</strong></div>
                <div className="metric-row"><span>Memory Threshold (configured)</span><strong>80%</strong></div>
                <div className="metric-row"><span>Current AWS CPU (CloudWatch)</span>
                  <strong style={{color: (awsLiveMetrics?.cpu_utilization ?? 0) > 85 ? '#ef4444' : '#10b981'}}>
                    {awsLiveMetrics?.cpu_utilization != null
                      ? `${awsLiveMetrics.cpu_utilization.toFixed(2)}%`
                      : 'Awaiting CloudWatch data'}
                  </strong>
                </div>
                <div className="metric-row"><span>Current AWS Memory (CloudWatch)</span>
                  <strong style={{color: (awsLiveMetrics?.memory_used_percent ?? 0) > 80 ? '#ef4444' : '#10b981'}}>
                    {awsLiveMetrics?.memory_used_percent != null
                      ? `${awsLiveMetrics.memory_used_percent.toFixed(2)}%`
                      : 'Awaiting CloudWatch data'}
                  </strong>
                </div>
                <div className="metric-row"><span>Current AWS Disk (CloudWatch)</span>
                  <strong>
                    {awsLiveMetrics?.disk_used_percent != null
                      ? `${awsLiveMetrics.disk_used_percent.toFixed(2)}%`
                      : 'Not reported by AWS'}
                  </strong>
                </div>
                <div className="metric-row"><span>SLA Status</span>
                  <strong className={
                    !awsLiveMetrics ? '' :
                    (awsLiveMetrics.cpu_utilization > 85 || awsLiveMetrics.memory_used_percent > 80) ? 'risk' : 'healthy'
                  }>
                    {awsLiveMetrics
                      ? ((awsLiveMetrics.cpu_utilization > 85 || awsLiveMetrics.memory_used_percent > 80) ? 'AT RISK' : 'HEALTHY')
                      : 'Awaiting data'}
                  </strong>
                </div>
              </>
            ) : (
              /* Simulation mode: show scenario values */
              <>
                <div className="metric-row"><span>Response Time</span><strong>{workload.responseTime} ms</strong></div>
                <div className="metric-row"><span>Target Response Time</span><strong>&lt; 200 ms</strong></div>
                <div className="metric-row"><span>CPU Threshold</span><strong>85%</strong></div>
                <div className="metric-row"><span>Memory Threshold</span><strong>80%</strong></div>
                <div className="metric-row"><span>SLA Status</span><strong className={workload.alert === 'Healthy' ? 'healthy' : 'risk'}>{workload.alert}</strong></div>
              </>
            )}
          </div>
        </div>

        <div className="comparison-panel">
          <div className="panel-header-row">
            <div className="panel-title">Traditional vs CloudPilot</div>
            <span style={{fontSize:'10px',color:'#9ca3af',padding:'2px 6px',border:'1px solid #374151',borderRadius:'4px'}}>Evaluation Benchmark</span>
          </div>
          <div style={{fontSize:'11px',color:'#6b7280',marginBottom:'8px',padding:'0 4px'}}>Values from experimental evaluation — not live AWS measurements.</div>
          <table className="comparison-table">
            <thead>
              <tr><th>Metric</th><th>Traditional</th><th>CloudPilot</th></tr>
            </thead>
            <tbody>
              <tr><td>Allocation Delay</td><td>4.7s</td><td>2.6s</td></tr>
              <tr><td>SLA Risk</td><td>High</td><td>Low</td></tr>
              <tr><td>Prediction</td><td>No</td><td>Yes (ML + CloudWatch)</td></tr>
              <tr><td>Historical Knowledge</td><td>No</td><td>Yes (RAG / ChromaDB)</td></tr>
              <tr><td>Automation</td><td>Partial</td><td>Yes</td></tr>
              <tr><td>Resource Utilization</td><td>62%</td><td>86%</td></tr>
            </tbody>
          </table>
        </div>

        {summary && (
          <div className="info-panel">
            <div className="panel-header-row">
              <div className="panel-title">Allocation Summary</div>
              {summary.mode === 'AWS_REALTIME' && (
                <span style={{fontSize:'10px',padding:'2px 8px',background:'#d97706',color:'white',borderRadius:'4px'}}>AWS REAL-TIME</span>
              )}
            </div>
            <div className="panel-body summary-grid">
              {summary.mode === 'AWS_REALTIME' ? (
                /* AWS-mode summary with real CloudWatch values */
                <>
                  <div className="metric-row"><span>AWS Decision</span>
                    <strong style={{color: summary.decision === 'NO_FEASIBLE_RESOURCE' ? '#ef4444' : '#10b981'}}>
                      {summary.decision}
                    </strong>
                  </div>
                  {summary.instanceDetails && (
                    <>
                      <div className="metric-row"><span>AWS Instance</span><strong>{summary.instanceDetails.name}</strong></div>
                      <div className="metric-row"><span>Instance Type</span><strong>{summary.instanceDetails.type}</strong></div>
                      <div className="metric-row"><span>Instance Capacity</span><strong>{summary.instanceDetails.capacity}</strong></div>
                    </>
                  )}
                  <div className="metric-row"><span>Requested CPU</span><strong>{request.cpu} vCPU</strong></div>
                  <div className="metric-row"><span>Requested Memory</span><strong>{request.memory} GB</strong></div>
                  <div className="metric-row"><span>Decision Time</span><strong>{summary.allocationDelay}</strong></div>
                  <div className="metric-row"><span>Predicted CPU Demand</span><strong>{summary.predictedWorkload}</strong></div>
                  <div className="metric-row"><span>Actual CPU (CloudWatch)</span><strong>{summary.cpuUtilization}</strong></div>
                  <div className="metric-row"><span>Actual Memory (CloudWatch)</span><strong>{summary.memoryUtilization}</strong></div>
                  <div className="metric-row"><span>Disk Utilization</span><strong>{summary.diskUtilization}</strong></div>
                  <div className="metric-row"><span>Network In</span><strong>{summary.networkIn}</strong></div>
                  <div className="metric-row"><span>Network Out</span><strong>{summary.networkOut}</strong></div>
                  <div className="metric-row"><span>SLA Status</span><strong style={{color: summary.slaStatus === 'HEALTHY' ? '#10b981' : '#f59e0b'}}>{summary.slaStatus}</strong></div>
                  <div className="metric-row"><span>Decision Score</span><strong>{summary.decisionScore}</strong></div>
                  <div className="metric-row"><span>Decision Source</span><strong>{summary.decisionSource}</strong></div>
                  {summary.decision === 'NO_FEASIBLE_RESOURCE' && (
                    <div style={{gridColumn:'1/-1',marginTop:'8px',padding:'10px',background:'#1f1515',border:'1px solid #7f1d1d',borderRadius:'6px',fontSize:'12px',color:'#fca5a5',lineHeight:'1.6'}}>
                      ⚠ The requested workload requires {request.cpu} vCPU and {request.memory} GB memory.
                      The currently discovered CloudPilot-managed AWS instance is a {summary.instanceDetails?.type || 't3.micro'} with {summary.instanceDetails?.capacity || 'limited'} capacity.
                      No currently available AWS resource satisfies the request.
                      CloudPilot is operating in READ_ONLY / DRY_RUN mode — no EC2 mutation performed.
                    </div>
                  )}
                </>
              ) : (
                /* Simulation-mode summary */
                <>
                  <div className="metric-row"><span>Selected VM</span><strong>{summary.selectedVM}</strong></div>
                  <div className="metric-row"><span>Allocation Delay</span><strong>{summary.allocationDelay}</strong></div>
                  <div className="metric-row"><span>Predicted Workload</span><strong>{summary.predictedWorkload}</strong></div>
                  <div className="metric-row"><span>Actual Workload</span><strong>{summary.actualWorkload}</strong></div>
                  <div className="metric-row"><span>CPU Utilization</span><strong>{summary.cpuUtilization}</strong></div>
                  <div className="metric-row"><span>Memory Utilization</span><strong>{summary.memoryUtilization}</strong></div>
                  <div className="metric-row"><span>SLA Status</span><strong>{summary.slaStatus}</strong></div>
                  <div className="metric-row"><span>Decision Score</span><strong>{summary.decisionScore}</strong></div>
                </>
              )}
            </div>
          </div>
        )}

        <div className="info-panel">
          <div className="panel-header-row"><div className="panel-title">Allocation History</div></div>
          <div className="panel-body history-table-wrap">
            <table className="history-table">
              <thead>
                <tr><th>Request ID</th><th>Mode</th><th>Timestamp</th><th>CPU</th><th>Mem</th><th>Workload</th><th>Instance/VM</th><th>Time</th><th>SLA</th><th>Outcome</th></tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr><td colSpan="10" className="muted-text">No allocation history yet.</td></tr>
                ) : history.map(entry => (
                  <tr key={`${entry.requestId}-${entry.timestamp}`}>
                    <td>{entry.requestId}</td>
                    <td>
                      <span style={{
                        fontSize:'10px', padding:'1px 5px', borderRadius:'3px',
                        background: entry.runMode === 'AWS_REALTIME' ? '#92400e' : '#1e3a5f',
                        color: 'white'
                      }}>
                        {entry.runMode === 'AWS_REALTIME' ? 'AWS' : 'SIM'}
                      </span>
                    </td>
                    <td>{entry.timestamp}</td>
                    <td>{entry.cpu}</td>
                    <td>{entry.memory || entry.memory === 0 ? entry.memory : request.memory}</td>
                    <td>{entry.workload}</td>
                    <td style={{fontFamily: entry.runMode === 'AWS_REALTIME' ? 'monospace' : 'inherit', fontSize:'11px'}}>
                      {entry.runMode === 'AWS_REALTIME'
                        ? (entry.instancesConsidered || entry.selectedVm)
                        : entry.selectedVm}
                    </td>
                    <td>{entry.allocationTime}</td>
                    <td>{entry.slaStatus}</td>
                    <td style={{color: entry.outcome === 'NO_FEASIBLE_RESOURCE' ? '#f87171' : entry.outcome?.includes('DRY_RUN') ? '#34d399' : undefined}}>
                      {entry.outcome}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── AWS Agent Execution Trace ─────────────────────────────────────── */}
        {awsMode && awsAgentTrace && (
          <div className="info-panel aws-trace-panel">
            <div className="panel-header-row">
              <div className="panel-title">AWS Agent Execution Trace</div>
              <span className="aws-status-pill connected" style={{fontSize:'10px',padding:'2px 8px'}}>REAL DATA</span>
            </div>
            <div className="panel-body">
              <div className="aws-trace-flow">

                {/* AWS Data Source */}
                <div className="trace-node aws-node">
                  <div className="trace-label">AWS EC2 DATA SOURCE</div>
                  <div className="trace-detail">
                    {(awsAgentTrace.mapping?.candidates || []).map(c => (
                      <div key={c.vm_id} className="trace-id-row">
                        <span className="trace-id">{c.vm_id}</span>
                        <span className="trace-sub">{c.name} · {c.instance_type} · {c.az}</span>
                      </div>
                    ))}
                    {(awsAgentTrace.mapping?.candidates || []).length === 0 && (
                      <div className="trace-id-row">
                        <span className="trace-sub">Discovered: {awsAgentTrace.mapping?.candidates_found || 0} instance(s)</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="trace-arrow">↓</div>

                {/* Mapping Agent */}
                <div className="trace-node">
                  <div className="trace-label">MAPPING AGENT</div>
                  <div className="trace-detail">
                    <span>Discovered: {awsAgentTrace.mapping?.candidates_found || 0} instance(s)</span>
                    <span>Candidates: {awsAgentTrace.mapping?.feasible_count || 0}</span>
                    <span>Rejected: {(awsAgentTrace.mapping?.rejected || []).length}</span>
                    {(awsAgentTrace.mapping?.rejected || []).map(r => (
                      <div key={r.vm_id} className="trace-sub" style={{color:'#f0615c'}}>
                        {r.vm_id}: {r.reason}
                      </div>
                    ))}
                    <span className="trace-sub">Latency: {awsAgentTrace.mapping?.latency_ms}ms</span>
                  </div>
                </div>
                <div className="trace-arrow">↓</div>

                {/* Prediction Agent */}
                <div className="trace-node">
                  <div className="trace-label">PREDICTION AGENT</div>
                  <div className="trace-detail">
                    <span>Model: {awsAgentTrace.prediction?.model || 'RandomForestRegressor'}</span>
                    <span>Input: {awsAgentTrace.prediction?.data_source || 'AWS_CLOUDWATCH'}</span>
                    <span>Predicted CPU: {(awsAgentTrace.prediction?.predicted_cpu || 0).toFixed(1)}%</span>
                    <span>SLA Risk: {awsAgentTrace.prediction?.sla_risk || 'N/A'}</span>
                    <span>Trend: {awsAgentTrace.prediction?.trend || 'N/A'}</span>
                    {awsAgentTrace.prediction?.cloudwatch_timestamp && (
                      <span className="trace-sub" style={{color:'#6ee7b7'}}>CloudWatch timestamp: {awsAgentTrace.prediction.cloudwatch_timestamp}</span>
                    )}
                    <span className="trace-sub">Latency: {awsAgentTrace.prediction?.latency_ms}ms</span>
                  </div>
                </div>
                <div className="trace-arrow">↓</div>

                {/* RAG Agent */}
                <div className="trace-node">
                  <div className="trace-label">RAG KNOWLEDGE BASE</div>
                  <div className="trace-detail">
                    <span>Case base size: {awsAgentTrace.rag?.case_base_size || 0}</span>
                    <span>Retrieved: {(awsAgentTrace.rag?.retrieved_cases || []).length} cases</span>
                    <span>RAG suggested: {awsAgentTrace.rag?.suggested_vm || 'N/A'}</span>
                    <span className="trace-sub">Latency: {awsAgentTrace.rag?.latency_ms}ms</span>
                  </div>
                </div>
                <div className="trace-arrow">↓</div>

                {/* APRDA Agent */}
                <div className="trace-node">
                  <div className="trace-label">APRDA SCORING ALGORITHM</div>
                  <div className="trace-detail">
                    <span>Status: {awsAgentTrace.aprda?.status || 'N/A'}</span>
                    <span>Selected: <strong className="trace-id">{awsAgentTrace.aprda?.selected_resource || 'none'}</strong></span>
                    <span>Score: {(awsAgentTrace.aprda?.decision_score || 0).toFixed(4)}</span>
                    <span>Workload Class: {awsAgentTrace.aprda?.workload_class || 'N/A'}</span>
                    <span>Candidates Evaluated: {awsAgentTrace.aprda?.candidates_evaluated || 0}</span>
                    <span className="trace-sub">Latency: {awsAgentTrace.aprda?.aprda_latency_ms?.toFixed(3) || 0}ms</span>
                  </div>
                </div>
                <div className="trace-arrow">↓</div>

                {/* Reasoning Agent */}
                <div className="trace-node">
                  <div className="trace-label">REASONING AGENT</div>
                  <div className="trace-detail">
                    <span>Decision: <strong style={{color: awsAgentTrace.reasoning?.decision === 'ALLOCATE' ? '#10b981' : '#f0615c'}}>{awsAgentTrace.reasoning?.decision}</strong></span>
                    <span>Selected: <strong className="trace-id">{awsAgentTrace.reasoning?.selected_vm || 'none'}</strong></span>
                    <span>Score: {(awsAgentTrace.reasoning?.score || 0).toFixed(4)}</span>
                    <span>Candidates evaluated: {awsAgentTrace.reasoning?.candidates_evaluated || 0}</span>
                    <span className="trace-sub">Latency: {awsAgentTrace.reasoning?.latency_ms}ms</span>
                  </div>
                </div>
                <div className="trace-arrow">↓</div>

                {/* Execution Agent */}
                <div className={`trace-node ${awsAgentTrace.execution?.status === 'DRY_RUN' ? 'trace-dryrun' : ''}`}>
                  <div className="trace-label">EXECUTION AGENT</div>
                  <div className="trace-detail">
                    <span>Status: <strong style={{color: awsAgentTrace.execution?.status === 'DRY_RUN' ? '#10b981' : '#f0a64b'}}>{awsAgentTrace.execution?.status}</strong></span>
                    <span>Instance: <strong className="trace-id">{awsAgentTrace.execution?.selected_vm || 'none'}</strong></span>
                    <span>AWS Mode: {awsAgentTrace.execution?.aws_mode || 'READ_ONLY'}</span>
                    <span className="trace-sub" style={{color:'#10b981'}}>{awsAgentTrace.execution?.dry_run_note || ''}</span>
                    <span className="trace-sub">Latency: {awsAgentTrace.execution?.execution_latency_ms?.toFixed(3)}ms</span>
                  </div>
                </div>
                <div className="trace-arrow">↓</div>

                {/* Final result */}
                <div className={`trace-node trace-final ${awsAgentTrace.finalStatus === 'DRY_RUN' ? 'trace-dryrun' : ''}`}>
                  <div className="trace-label">PIPELINE COMPLETE</div>
                  <div className="trace-detail">
                    <span>Run ID: <span className="trace-sub">{awsAgentTrace.runId}</span></span>
                    <span>End-to-end: <strong>{awsAgentTrace.endToEndMs?.toFixed(0)}ms</strong></span>
                    <span>Final status: <strong style={{color: awsAgentTrace.finalStatus === 'DRY_RUN' ? '#10b981' : '#f0a64b'}}>{awsAgentTrace.finalStatus}</strong></span>
                    <span style={{color:'#10b981',fontWeight:600}}>NO AWS INSTANCE MODIFIED — READ_ONLY</span>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        <div className="info-panel export-panel">
          <div className="panel-header-row">
            <div className="panel-title">Export</div>
          </div>
          <div className="panel-body export-row">
            <button type="button" className="export-btn" onClick={() => downloadJson('simulation-report', { mode, request, scenario: workload, summary, log, history })}>Export Simulation Report</button>
            <button type="button" className="export-btn" onClick={() => downloadJson('system-log', { log })}>Export Logs</button>
            <button type="button" className="export-btn" onClick={() => downloadJson('allocation-history', { history })}>Export Allocation History</button>
          </div>
        </div>
      </div>

      <footer className="foot">
        {mode === 'with'
          ? 'With CloudPilot: four agents map, predict, reason over history, then execute — before any VM is touched.'
          : 'Without CloudPilot: the first free-looking VM is picked with no forecast and no memory of past incidents.'}
      </footer>
    </div>
  )
}

function labelFor(step) {
  return {
    'mapping': 'Mapping Agent',
    'prediction': 'Prediction Agent',
    'rag': 'RAG Agent',
    'aprda': 'APRDA Decision',
    'reasoning': 'Reasoning Agent',
    'execution': 'Execution Agent',
    'done': 'Allocated',
    'reactive-pick': 'Naive Pick',
    'degrading': 'Load Rising',
    'failed': 'SLA Breach',
  }[step] || step
}

function labelForAgent(agent) {
  return {
    mapping: 'Mapping Agent',
    prediction: 'Prediction Agent',
    rag: 'RAG Agent',
    aprda: 'APRDA Stage',
    reasoning: 'Reasoning Agent',
    execution: 'Execution Agent',
  }[agent] || agent
}

function tagFor(status) {
  return {
    idle: 'idle',
    candidate: 'candidate',
    excluded: 'excluded',
    predicted: 'scored',
    risky: 'high risk',
    chosen: 'selected',
    active: 'reserved',
    rising: 'rising',
    warn: 'warning',
    failed: 'failed',
  }[status] || status
}


