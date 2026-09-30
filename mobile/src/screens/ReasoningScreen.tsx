/**
 * ReasoningScreen.tsx — Multi-Criteria Contextual Reasoning Agent
 * Synthesizes Prediction, RAG history, and Resource Constraints into human-readable decision contexts.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl
} from 'react-native';
import {
  ArrowLeft, Brain, Cpu, TrendingUp, BookOpen,
  ShieldCheck, RefreshCw, AlertTriangle, CheckCircle2, ArrowDown
} from 'lucide-react-native';
import { agentApi, normalizeError, DEFAULT_WORKLOAD } from '../api/client';
import { useCloudMode } from '../context/CloudModeContext';
import { Colors } from '../theme/colors';

export default function ReasoningScreen({ navigation }: any) {
  const { isAwsLive } = useCloudMode();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reasoningData, setReasoningData] = useState<any>(null);
  const [error, setError] = useState('');

  const fetchReasoning = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await agentApi.runReasoning({
        ...DEFAULT_WORKLOAD,
        mode: isAwsLive ? 'aws_live' : 'sim',
      });
      setReasoningData(res.data);
    } catch (e) {
      setError(normalizeError(e).userMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReasoning();
  }, [isAwsLive]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchReasoning();
    setRefreshing(false);
  };

  const explanation = reasoningData?.reasoning || reasoningData?.explanation ||
    'Predicted workload is increasing while the currently available resource has limited headroom. Historical cases with similar workload patterns were associated with medium-capacity resources.';
  const selectedVm = reasoningData?.selected_vm || reasoningData?.decision || 'VM-03 (t3.medium)';
  const mode = reasoningData?.mode || (isAwsLive ? 'aws_live' : 'sim');
  const evidence = reasoningData?.evidence || {};

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerPre}>COGNITIVE SYNTHESIS</Text>
          <Text style={styles.headerTitle}>Reasoning Agent</Text>
        </View>
        <TouchableOpacity onPress={fetchReasoning} style={styles.reloadBtn}>
          <RefreshCw size={16} color={Colors.cyan} />
        </TouchableOpacity>
      </View>

      {/* Synthesis Pipeline Inputs */}
      <View style={styles.inputsCard}>
        <Text style={styles.cardSectionTitle}>SYNTHESIS INPUT FACTORS</Text>

        <View style={styles.inputPillGrid}>
          <View style={styles.inputPill}>
            <TrendingUp size={14} color={Colors.cyan} />
            <Text style={styles.inputPillLabel}>Prediction: +10m Trajectory</Text>
          </View>
          <View style={styles.inputPill}>
            <BookOpen size={14} color={Colors.purple} />
            <Text style={styles.inputPillLabel}>RAG: Cosine Similarity</Text>
          </View>
          <View style={styles.inputPill}>
            <Cpu size={14} color={Colors.blue} />
            <Text style={styles.inputPillLabel}>Constraints: vCPU / RAM Fit</Text>
          </View>
          <View style={styles.inputPill}>
            <ShieldCheck size={14} color={Colors.green} />
            <Text style={styles.inputPillLabel}>SLA: 99.9% SLO Headroom</Text>
          </View>
        </View>
      </View>

      {/* Flow Indicator */}
      <View style={styles.flowConnector}>
        <ArrowDown size={18} color={Colors.cyan} />
        <Text style={styles.flowLabel}>Multi-Criteria Contextual Synthesis</Text>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.cyan} />
          <Text style={styles.centerText}>Synthesizing cognitive constraints...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorBox}>
          <AlertTriangle size={16} color={Colors.red} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <>
          {/* Synthesized Explanation Box */}
          <View style={styles.explanationCard}>
            <View style={styles.expHeader}>
              <Brain size={18} color={Colors.purple} />
              <Text style={styles.expTitle}>Decision Context Explanation</Text>
            </View>
            <Text style={styles.expBody}>"{explanation}"</Text>

            <View style={styles.decisionHighlight}>
              <Text style={styles.decLabel}>Selected Target Allocation:</Text>
              <Text style={styles.decValue}>{selectedVm}</Text>
            </View>
          </View>

          {/* Evidence Breakdown */}
          {evidence && Object.keys(evidence).length > 0 && (
            <View style={styles.evidenceCard}>
              <Text style={styles.cardSectionTitle}>EVIDENCE CONTEXT</Text>
              {Object.entries(evidence).map(([key, val]: any, idx) => (
                <View key={idx} style={styles.evidenceRow}>
                  <Text style={styles.evidenceKey}>{key.replace(/_/g, ' ')}</Text>
                  <Text style={styles.evidenceVal}>{String(val)}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070b14',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  reloadBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  headerPre: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.purple,
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  inputsCard: {
    backgroundColor: '#0c1527',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 14,
  },
  cardSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  inputPillGrid: {
    gap: 8,
  },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#050914',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
  },
  inputPillLabel: {
    fontSize: 12,
    color: '#cbd5e1',
    fontWeight: '600',
  },
  flowConnector: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  flowLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.cyan,
    letterSpacing: 0.6,
  },
  explanationCard: {
    backgroundColor: '#0c1527',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 16,
    marginBottom: 16,
  },
  expHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  expTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.4,
  },
  expBody: {
    fontSize: 14,
    lineHeight: 22,
    color: '#e2e8f0',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  decisionHighlight: {
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  decLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 4,
  },
  decValue: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.cyan,
  },
  evidenceCard: {
    backgroundColor: '#0c1527',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 16,
  },
  evidenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  evidenceKey: {
    fontSize: 11,
    color: '#94a3b8',
    textTransform: 'capitalize',
  },
  evidenceVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  centerBox: {
    padding: 30,
    alignItems: 'center',
    gap: 12,
  },
  centerText: {
    fontSize: 12,
    color: '#64748b',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.red,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    fontSize: 12,
    color: Colors.red,
    flex: 1,
  },
});
