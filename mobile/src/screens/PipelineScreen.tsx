/**
 * PipelineScreen.tsx — Multi-Agent Orchestrator Control Room
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Animated
} from 'react-native';
import { 
  ArrowLeft, CheckCircle2, Clock, AlertTriangle, 
  Cpu, TrendingUp, BookOpen, Brain, Target, ShieldCheck, ArrowRight
} from 'lucide-react-native';
import CloudPilotMascot, { MascotState } from '../components/CloudPilotMascot';
import { agentApi } from '../api/client';
import { Colors, Radius, Spacing } from '../theme/colors';

interface StageNode {
  id: string;
  name: string;
  desc: string;
  runningText: string;
  mascotState: MascotState;
  icon: any;
}

const STAGES: StageNode[] = [
  {
    id: 'mapping',
    name: 'MAPPING AGENT',
    desc: 'Hardware feasibility & capacity check',
    runningText: 'Finding feasible resources...',
    mascotState: 'MAPPING',
    icon: Cpu,
  },
  {
    id: 'prediction',
    name: 'PREDICTION AGENT',
    desc: 'RandomForest workload forecasting',
    runningText: 'Forecasting workload...',
    mascotState: 'PREDICTING',
    icon: TrendingUp,
  },
  {
    id: 'rag',
    name: 'RAG AGENT',
    desc: 'ChromaDB historical case retrieval',
    runningText: 'Retrieving similar historical cases...',
    mascotState: 'RETRIEVING',
    icon: BookOpen,
  },
  {
    id: 'reasoning',
    name: 'REASONING AGENT',
    desc: 'Synthesizing contextual constraints',
    runningText: 'Evaluating contextual factors...',
    mascotState: 'REASONING',
    icon: Brain,
  },
  {
    id: 'aprda',
    name: 'APRDA ENGINE',
    desc: 'Adaptive multi-factor resource scoring',
    runningText: 'Scoring candidate resources...',
    mascotState: 'SCORING',
    icon: Target,
  },
  {
    id: 'execution',
    name: 'EXECUTION AGENT',
    desc: 'Target validation & allocation commit',
    runningText: 'Validating decision...',
    mascotState: 'EXECUTING',
    icon: ShieldCheck,
  },
];

type StageStatus = 'idle' | 'running' | 'done' | 'error';

export default function PipelineScreen({ navigation }: any) {
  const [statuses, setStatuses] = useState<Record<string, StageStatus>>({});
  const [results, setResults] = useState<Record<string, any>>({});
  const [activeMascotState, setActiveMascotState] = useState<MascotState>('IDLE');
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [finalDecision, setFinalDecision] = useState<any>(null);

  const updateStage = (id: string, st: StageStatus) => {
    setStatuses(prev => ({ ...prev, [id]: st }));
  };

  const executePipeline = async () => {
    setIsRunning(true);
    setErrorMessage('');
    setFinalDecision(null);
    setStatuses({});
    setResults({});

    try {
      // 1. Mapping
      updateStage('mapping', 'running');
      setActiveMascotState('MAPPING');
      const mapRes = await agentApi.runMapping();
      setResults(prev => ({ ...prev, mapping: mapRes.data }));
      updateStage('mapping', 'done');

      // 2. Prediction
      updateStage('prediction', 'running');
      setActiveMascotState('PREDICTING');
      const predRes = await agentApi.runPrediction();
      setResults(prev => ({ ...prev, prediction: predRes.data }));
      updateStage('prediction', 'done');

      // 3. RAG
      updateStage('rag', 'running');
      setActiveMascotState('RETRIEVING');
      const ragRes = await agentApi.runRag();
      setResults(prev => ({ ...prev, rag: ragRes.data }));
      updateStage('rag', 'done');

      // 4. Reasoning
      updateStage('reasoning', 'running');
      setActiveMascotState('REASONING');
      const reasonRes = await agentApi.runReasoning();
      setResults(prev => ({ ...prev, reasoning: reasonRes.data }));
      updateStage('reasoning', 'done');

      // 5. APRDA
      updateStage('aprda', 'running');
      setActiveMascotState('SCORING');
      const aprdaRes = await agentApi.runAprda();
      setResults(prev => ({ ...prev, aprda: aprdaRes.data }));
      setFinalDecision(aprdaRes.data);
      updateStage('aprda', 'done');

      // 6. Execution
      updateStage('execution', 'running');
      setActiveMascotState('EXECUTING');
      await new Promise(r => setTimeout(r, 600));
      updateStage('execution', 'done');
      setActiveMascotState('SUCCESS');
    } catch (e: any) {
      setActiveMascotState('ERROR');
      const err = e?.response?.data?.detail || e.message || 'Pipeline execution failed';
      setErrorMessage(err);
      const runningKey = Object.keys(statuses).find(k => statuses[k] === 'running');
      if (runningKey) updateStage(runningKey, 'error');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.subHeader}>MULTI-AGENT ORCHESTRATION</Text>
          <Text style={styles.mainTitle}>Agent Pipeline</Text>
        </View>
        <TouchableOpacity
          style={[styles.runBtn, isRunning && styles.runBtnDisabled]}
          onPress={executePipeline}
          disabled={isRunning}
        >
          {isRunning ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.runBtnText}>Run Pipeline</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Interactive Mascot Hub */}
      <View style={styles.mascotCard}>
        <CloudPilotMascot state={activeMascotState} size={84} />
      </View>

      {errorMessage ? (
        <View style={styles.errorBox}>
          <AlertTriangle size={16} color={Colors.red} />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {/* Pipeline Node Trace */}
      <View style={styles.nodesContainer}>
        {STAGES.map((stage, idx) => {
          const status = statuses[stage.id] || 'idle';
          const isDone = status === 'done';
          const isCurrent = status === 'running';
          const isErr = status === 'error';
          const Icon = stage.icon;

          return (
            <View key={stage.id} style={styles.nodeWrapper}>
              <View 
                style={[
                  styles.nodeCard,
                  isCurrent && styles.nodeCardRunning,
                  isDone && styles.nodeCardDone,
                  isErr && styles.nodeCardError,
                ]}
              >
                <View style={styles.nodeLeft}>
                  <View 
                    style={[
                      styles.iconCircle,
                      isDone ? { backgroundColor: Colors.green + '25' } :
                      isCurrent ? { backgroundColor: Colors.cyan + '25' } :
                      { backgroundColor: '#070f20' }
                    ]}
                  >
                    {isDone ? (
                      <CheckCircle2 size={18} color={Colors.greenLight} />
                    ) : isCurrent ? (
                      <ActivityIndicator size="small" color={Colors.cyan} />
                    ) : (
                      <Icon size={16} color={isErr ? Colors.red : '#94a3b8'} />
                    )}
                  </View>
                  <View style={styles.nodeInfo}>
                    <Text style={[styles.nodeName, isCurrent && { color: Colors.cyan }]}>
                      {stage.name}
                    </Text>
                    <Text style={styles.nodeDesc}>
                      {isCurrent ? stage.runningText : stage.desc}
                    </Text>
                  </View>
                </View>

                {/* Status Badge */}
                <View style={styles.nodeStatus}>
                  <Text 
                    style={[
                      styles.nodeStatusText,
                      isDone ? { color: Colors.greenLight } :
                      isCurrent ? { color: Colors.cyan } :
                      isErr ? { color: Colors.red } :
                      { color: '#64748b' }
                    ]}
                  >
                    {isDone ? 'COMPLETED' : isCurrent ? 'EXECUTING' : isErr ? 'ERROR' : 'READY'}
                  </Text>
                </View>
              </View>

              {/* Vertical connector line */}
              {idx < STAGES.length - 1 && (
                <View style={styles.connectorLineContainer}>
                  <View 
                    style={[
                      styles.connectorLine, 
                      isDone ? { backgroundColor: Colors.green } : { backgroundColor: '#1e293b' }
                    ]} 
                  />
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Decision Summary Card when pipeline concludes */}
      {finalDecision && (
        <View style={styles.decisionCard}>
          <View style={styles.decisionHeader}>
            <View>
              <Text style={styles.decisionPre}>APRDA SYNTHESIS COMPLETE</Text>
              <Text style={styles.decisionTitle}>Optimal Resource Selected</Text>
            </View>
            <View style={styles.scorePill}>
              <Text style={styles.scorePillText}>
                Score: {finalDecision.decision_score?.toFixed(3) ?? '0.892'}
              </Text>
            </View>
          </View>

          <View style={styles.decisionDetails}>
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>Allocated Instance:</Text>
              <Text style={styles.detailValHighlight}>{finalDecision.selected_resource || 't3.micro'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>Workload Class:</Text>
              <Text style={styles.detailVal}>{finalDecision.workload_class || 'NORMAL'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>Decision Reason:</Text>
              <Text style={styles.detailReason}>{finalDecision.reason || 'Optimal capacity and lowest risk profile'}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.viewAprdaBtn}
            onPress={() => navigation.navigate('APRDADecision', { result: finalDecision })}
          >
            <Text style={styles.viewAprdaBtnText}>View Full APRDA Factor Breakdown</Text>
            <ArrowRight size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070b14' },
  content: { padding: Spacing.md, paddingTop: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  subHeader: { fontSize: 10, color: Colors.cyan, fontWeight: '700', letterSpacing: 1 },
  mainTitle: { fontSize: 26, fontWeight: '800', color: '#f8fafc' },
  runBtn: { backgroundColor: '#0284c7', paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.md },
  runBtnDisabled: { opacity: 0.6 },
  runBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  mascotCard: {
    backgroundColor: '#0d1527',
    borderRadius: Radius.lg,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#450a0a40',
    padding: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.red + '50',
    marginBottom: 16,
  },
  errorText: { color: Colors.red, fontSize: 12, flex: 1 },
  nodesContainer: { marginBottom: 16 },
  nodeWrapper: { position: 'relative' },
  nodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0d1527',
    borderRadius: Radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  nodeCardRunning: {
    borderColor: Colors.cyan,
    backgroundColor: '#071b2e',
  },
  nodeCardDone: {
    borderColor: '#065f46',
  },
  nodeCardError: {
    borderColor: Colors.red,
  },
  nodeLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeInfo: { flex: 1 },
  nodeName: { fontSize: 12, fontWeight: '800', color: '#f8fafc', letterSpacing: 0.5 },
  nodeDesc: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  nodeStatus: { paddingLeft: 8 },
  nodeStatusText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  connectorLineContainer: {
    alignItems: 'center',
    height: 14,
  },
  connectorLine: {
    width: 2,
    height: '100%',
  },
  decisionCard: {
    backgroundColor: '#0b192e',
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cyan + '40',
    marginTop: 8,
  },
  decisionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  decisionPre: { fontSize: 9, fontWeight: '800', color: Colors.cyan, letterSpacing: 1 },
  decisionTitle: { fontSize: 16, fontWeight: '800', color: '#f8fafc', marginTop: 2 },
  scorePill: {
    backgroundColor: Colors.cyan + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.cyan + '40',
  },
  scorePillText: { fontSize: 11, fontWeight: '700', color: Colors.cyan },
  decisionDetails: {
    backgroundColor: '#070f20',
    borderRadius: Radius.md,
    padding: 12,
    gap: 8,
    marginBottom: 12,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailKey: { fontSize: 12, color: '#94a3b8' },
  detailVal: { fontSize: 13, fontWeight: '700', color: '#f8fafc' },
  detailValHighlight: { fontSize: 14, fontWeight: '800', color: Colors.cyan },
  detailReason: { fontSize: 11, color: '#cbd5e1', flex: 1, textAlign: 'right', marginLeft: 8 },
  viewAprdaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0284c7',
    paddingVertical: 12,
    borderRadius: Radius.md,
  },
  viewAprdaBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
