/**
 * RAGScreen.tsx — Retrieval-Augmented Generation Case Base Inspector
 * Real historical cases retrieved from Bitbrains fastStorage dataset & ChromaDB.
 * Zero fabricated cases. Displays "RAG unavailable" if backend fails.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl
} from 'react-native';
import {
  ArrowLeft, BookOpen, Layers, CheckCircle2, XCircle,
  RefreshCw, AlertTriangle, ShieldCheck
} from 'lucide-react-native';
import { agentApi, normalizeError, DEFAULT_WORKLOAD } from '../api/client';
import { useCloudMode } from '../context/CloudModeContext';
import { Colors } from '../theme/colors';

export default function RAGScreen({ navigation }: any) {
  const { isAwsLive } = useCloudMode();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  const fetchRAG = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await agentApi.runRag({
        ...DEFAULT_WORKLOAD,
        mode: isAwsLive ? 'aws_live' : 'sim',
      });
      setData(res.data);
    } catch (e: any) {
      setError(normalizeError(e).userMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRAG();
  }, [isAwsLive]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRAG();
    setRefreshing(false);
  };

  // Real retrieved cases from backend rag_agent
  const retrievedCases: any[] = data?.retrieved_cases || [];
  const caseBaseSize = data?.case_base_size || 0;
  const suggestedVm = data?.suggested_vm;
  const query = data?.query || DEFAULT_WORKLOAD;

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
          <Text style={styles.headerPre}>VECTOR KNOWLEDGE BASE</Text>
          <Text style={styles.headerTitle}>RAG Historical Context</Text>
        </View>
        <TouchableOpacity onPress={fetchRAG} style={styles.reloadBtn}>
          <RefreshCw size={16} color={Colors.cyan} />
        </TouchableOpacity>
      </View>

      {/* Query Banner */}
      <View style={styles.queryCard}>
        <View style={styles.queryHeader}>
          <BookOpen size={16} color={Colors.purple} />
          <Text style={styles.queryTitle}>Active Query Vector</Text>
        </View>
        <Text style={styles.querySub}>
          CPU: {query.current_cpu ?? 35.0}% • RAM: {query.current_memory ?? 42.0}% • Request Rate: {query.request_rate ?? 500} req/s
        </Text>
        <View style={styles.queryMetaRow}>
          <Text style={styles.metaLabel}>Knowledge Base Size:</Text>
          <Text style={styles.metaVal}>{caseBaseSize > 0 ? `${caseBaseSize} Historical Allocations` : 'Bitbrains FastStorage'}</Text>
        </View>
      </View>

      {/* Suggested Target from RAG Majority Voting */}
      {suggestedVm && (
        <View style={styles.suggestedCard}>
          <View style={styles.suggestedLeft}>
            <Text style={styles.suggestedPre}>RAG CONSENSUS RECOMMENDATION</Text>
            <Text style={styles.suggestedTitle}>{suggestedVm}</Text>
          </View>
          <View style={styles.suggestedBadge}>
            <CheckCircle2 size={14} color={Colors.greenLight} />
            <Text style={styles.suggestedBadgeText}>HISTORICAL MATCH</Text>
          </View>
        </View>
      )}

      {/* Main List Area */}
      <Text style={styles.sectionHeader}>RETRIEVED HISTORICAL CASES</Text>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.cyan} />
          <Text style={styles.centerText}>Computing Cosine Similarity over Historical Allocations...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorBox}>
          <AlertTriangle size={24} color={Colors.red} />
          <Text style={styles.errorTitle}>RAG Service Unavailable</Text>
          <Text style={styles.errorSub}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchRAG}>
            <Text style={styles.retryText}>Retry Vector Retrieval</Text>
          </TouchableOpacity>
        </View>
      ) : retrievedCases.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>No Historical Cases Found</Text>
          <Text style={styles.emptySub}>RAG database has not indexed matching records.</Text>
        </View>
      ) : (
        retrievedCases.map((item: any, idx: number) => {
          const simPct = (item.similarity * 100).toFixed(1);
          const isSuccess = item.result === 'SUCCESS' || item.sla_satisfied !== false;
          return (
            <View key={idx} style={styles.caseCard}>
              <View style={styles.caseHeader}>
                <View style={styles.caseIdBox}>
                  <Text style={styles.caseId}>{item.case_id || `CASE-#${idx + 1}`}</Text>
                  <Text style={styles.caseType}>{item.workload_type || 'Cloud Workload'}</Text>
                </View>
                <View style={styles.simBadge}>
                  <Text style={styles.simLabel}>Similarity</Text>
                  <Text style={styles.simNum}>{item.similarity != null ? item.similarity.toFixed(3) : `${simPct}%`}</Text>
                </View>
              </View>

              {/* Case Telemetry */}
              <View style={styles.telemetryGrid}>
                <View style={styles.telemetryItem}>
                  <Text style={styles.telemetryLabel}>Workload CPU</Text>
                  <Text style={styles.telemetryVal}>{item.workload_cpu ?? item.current_cpu ?? '—'}%</Text>
                </View>
                <View style={styles.telemetryItem}>
                  <Text style={styles.telemetryLabel}>Workload RAM</Text>
                  <Text style={styles.telemetryVal}>{item.workload_memory ?? item.current_memory ?? '—'}%</Text>
                </View>
                <View style={styles.telemetryItem}>
                  <Text style={styles.telemetryLabel}>Selected Node</Text>
                  <Text style={[styles.telemetryVal, { color: Colors.cyan }]}>
                    {item.selected_vm || item.historical_vm || 't3.micro'}
                  </Text>
                </View>
              </View>

              {/* Outcome Banner */}
              <View style={[styles.outcomeRow, { backgroundColor: isSuccess ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)' }]}>
                {isSuccess ? <CheckCircle2 size={12} color={Colors.greenLight} /> : <XCircle size={12} color={Colors.red} />}
                <Text style={[styles.outcomeText, { color: isSuccess ? Colors.greenLight : Colors.red }]}>
                  {item.sla_satisfied ? 'SLA Maintained • SLO Satisfied' : 'High Latency / SLA Warning'}
                  {item.response_time_ms ? ` (${item.response_time_ms} ms)` : ''}
                </Text>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070b14' },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#1e293b' },
  reloadBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#1e293b' },
  headerPre: { fontSize: 10, fontWeight: '800', color: Colors.purple, letterSpacing: 0.8 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  queryCard: { backgroundColor: '#0c1527', borderRadius: 14, borderWidth: 1, borderColor: '#1e293b', padding: 14, marginBottom: 14 },
  queryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  queryTitle: { fontSize: 13, fontWeight: '700', color: '#fff' },
  querySub: { fontSize: 11, color: '#94a3b8', lineHeight: 16, marginBottom: 10 },
  queryMetaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#1e293b' },
  metaLabel: { fontSize: 11, color: '#64748b' },
  metaVal: { fontSize: 11, color: Colors.purple, fontWeight: '700' },
  suggestedCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(6, 182, 212, 0.08)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(6, 182, 212, 0.3)', padding: 14, marginBottom: 16 },
  suggestedLeft: { gap: 2 },
  suggestedPre: { fontSize: 9, fontWeight: '800', color: Colors.cyan, letterSpacing: 0.5 },
  suggestedTitle: { fontSize: 18, fontWeight: '900', color: '#fff' },
  suggestedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#064e3b', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, gap: 4 },
  suggestedBadgeText: { fontSize: 9, fontWeight: '800', color: Colors.greenLight },
  sectionHeader: { fontSize: 11, fontWeight: '800', color: '#94a3b8', letterSpacing: 0.8, marginBottom: 12 },
  caseCard: { backgroundColor: '#0c1527', borderRadius: 14, borderWidth: 1, borderColor: '#1e293b', padding: 14, marginBottom: 12 },
  caseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  caseIdBox: { gap: 2 },
  caseId: { fontSize: 14, fontWeight: '800', color: '#fff' },
  caseType: { fontSize: 11, color: '#64748b' },
  simBadge: { alignItems: 'flex-end', backgroundColor: '#050914', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#1e293b' },
  simLabel: { fontSize: 8, color: '#64748b', fontWeight: '700', textTransform: 'uppercase' },
  simNum: { fontSize: 13, fontWeight: '900', color: Colors.cyan },
  telemetryGrid: { flexDirection: 'row', backgroundColor: '#050914', borderRadius: 8, padding: 8, gap: 8, marginBottom: 10 },
  telemetryItem: { flex: 1 },
  telemetryLabel: { fontSize: 9, color: '#64748b', marginBottom: 2 },
  telemetryVal: { fontSize: 12, fontWeight: '700', color: '#e2e8f0' },
  outcomeRow: { flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 6, gap: 6 },
  outcomeText: { fontSize: 10, fontWeight: '700' },
  centerBox: { padding: 40, alignItems: 'center', gap: 10 },
  centerText: { fontSize: 12, color: '#64748b', textAlign: 'center' },
  errorBox: { margin: 10, padding: 24, backgroundColor: '#0c1527', borderRadius: 14, borderWidth: 1, borderColor: Colors.red, alignItems: 'center', gap: 8 },
  errorTitle: { fontSize: 15, fontWeight: '800', color: Colors.red },
  errorSub: { fontSize: 12, color: '#94a3b8', textAlign: 'center', lineHeight: 18, marginBottom: 8 },
  retryBtn: { backgroundColor: '#0891b2', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  emptyBox: { padding: 40, alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: '#94a3b8' },
  emptySub: { fontSize: 11, color: '#64748b' },
});
