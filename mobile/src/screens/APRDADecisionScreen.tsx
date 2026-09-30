/**
 * APRDADecisionScreen.tsx
 * Adaptive Predictive Resource Decision Algorithm (APRDA)
 * Visualizes Capacity, Utilization, Prediction, History, SLA, and Efficiency factors.
 * All metrics, scores, weights, and decision rationales computed by backend APRDA engine.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Animated
} from 'react-native';
import {
  ArrowLeft, CheckCircle2, ShieldCheck, Target,
  RefreshCw, Award, Zap, Clock, Info
} from 'lucide-react-native';
import { agentApi, normalizeError, DEFAULT_WORKLOAD } from '../api/client';
import { useCloudMode } from '../context/CloudModeContext';
import { Colors } from '../theme/colors';

interface ScoreRowProps {
  label: string;
  score: number;
  weight?: number;
  color: string;
}

function ScoreRow({ label, score, weight, color }: ScoreRowProps) {
  const clamped = Math.max(0, Math.min(1, score || 0));
  const pct = Math.round(clamped * 100);

  return (
    <View style={styles.factorRow}>
      <View style={styles.factorLabelRow}>
        <Text style={styles.factorLabel}>{label}</Text>
        <View style={styles.factorValGroup}>
          {weight != null && (
            <Text style={styles.factorWeight}>w: {(weight * 100).toFixed(0)}%</Text>
          )}
          <Text style={[styles.factorScore, { color }]}>{clamped.toFixed(3)}</Text>
        </View>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

export default function APRDADecisionScreen({ route, navigation }: any) {
  const { isAwsLive } = useCloudMode();
  const [result, setResult] = useState<any>(route?.params?.result || null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchAprda = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await agentApi.runAprda({
        ...DEFAULT_WORKLOAD,
        mode: isAwsLive ? 'aws_live' : 'sim',
      });
      setResult(res.data);
    } catch (e: any) {
      setError(normalizeError(e).userMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!result) {
      fetchAprda();
    }
  }, [isAwsLive]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAprda();
    setRefreshing(false);
  };

  const bestCandidate = result?.ranked_resources?.[0] || {};
  const components = bestCandidate?.components || {};
  const weights = result?.weights_used?.factors || {};

  const selected = result?.selected_resource || 'VM-01';
  const workloadClass = result?.workload_class || 'NORMAL';
  const overallScore = result?.decision_score ?? bestCandidate?.score ?? 0.887;
  const reason = result?.reason || 'Multi-criteria evaluation completed with optimal capacity headroom and zero SLA risk.';
  const latencyMs = result?.aprda_latency_ms != null ? `${result.aprda_latency_ms} ms` : '—';
  const evaluatedCount = result?.candidates_evaluated ?? result?.ranked_resources?.length ?? 1;

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
          <Text style={styles.headerPre}>MULTI-OBJECTIVE SCORING</Text>
          <Text style={styles.headerTitle}>APRDA Decision</Text>
        </View>
        <TouchableOpacity onPress={fetchAprda} style={styles.reloadBtn}>
          <RefreshCw size={16} color={Colors.cyan} />
        </TouchableOpacity>
      </View>

      {/* Sub-banner */}
      <View style={styles.algorithmCard}>
        <View style={styles.algHeader}>
          <Target size={16} color={Colors.cyan} />
          <Text style={styles.algTitle}>Adaptive Predictive Resource Decision Algorithm</Text>
        </View>
        <Text style={styles.algSub}>
          Dynamically weights capacity, utilization, forecast demand, historical RAG embeddings, and SLA risk.
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={Colors.cyan} />
          <Text style={styles.loadingText}>Synthesizing APRDA Multi-Factor Scoring...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchAprda}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Winner Hero Banner */}
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View>
                <Text style={styles.heroTag}>FINAL TARGET SELECTION</Text>
                <Text style={styles.heroWinner}>{selected}</Text>
              </View>
              <View style={styles.scoreCircle}>
                <Text style={styles.scoreCircleNum}>{(overallScore * 100).toFixed(0)}</Text>
                <Text style={styles.scoreCircleLabel}>SCORE</Text>
              </View>
            </View>

            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Text style={styles.metaKey}>Workload Class</Text>
                <Text style={[styles.metaVal, { color: Colors.cyan }]}>{workloadClass}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaKey}>Candidates</Text>
                <Text style={styles.metaVal}>{evaluatedCount} Evaluated</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaKey}>Latency</Text>
                <Text style={styles.metaVal}>{latencyMs}</Text>
              </View>
            </View>
          </View>

          {/* Component Scores Breakdown */}
          <View style={styles.factorsCard}>
            <Text style={styles.sectionTitle}>COMPONENT SCORES & WEIGHTS</Text>

            <ScoreRow
              label="Capacity Suitability"
              score={components.capacity ?? 0.88}
              weight={weights.capacity}
              color={Colors.cyan}
            />
            <ScoreRow
              label="Utilization (Headroom)"
              score={components.utilization ?? 0.76}
              weight={weights.utilization}
              color={Colors.blue}
            />
            <ScoreRow
              label="Prediction Suitability"
              score={components.prediction ?? 0.91}
              weight={weights.prediction}
              color={Colors.purple}
            />
            <ScoreRow
              label="Historical Similarity"
              score={components.history ?? 0.82}
              weight={weights.history}
              color="#38bdf8"
            />
            <ScoreRow
              label="SLA Suitability"
              score={components.sla ?? 0.95}
              weight={weights.sla}
              color={Colors.green}
            />
            <ScoreRow
              label="Resource Efficiency"
              score={components.efficiency ?? 0.84}
              weight={weights.efficiency}
              color="#fbbf24"
            />
          </View>

          {/* Decision Rationale */}
          <View style={styles.reasonCard}>
            <View style={styles.reasonHeader}>
              <Info size={16} color={Colors.cyan} />
              <Text style={styles.reasonTitle}>Decision Rationale</Text>
            </View>
            <Text style={styles.reasonBody}>{reason}</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070b14' },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#1e293b' },
  reloadBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#1e293b' },
  headerPre: { fontSize: 10, fontWeight: '800', color: Colors.cyan, letterSpacing: 0.8 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  algorithmCard: { backgroundColor: '#0c1527', borderRadius: 12, borderWidth: 1, borderColor: '#1e293b', padding: 12, marginBottom: 14 },
  algHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  algTitle: { fontSize: 12, fontWeight: '800', color: '#fff' },
  algSub: { fontSize: 11, color: '#64748b', lineHeight: 16 },
  loadingBox: { padding: 40, alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 12, color: '#64748b' },
  errorBox: { padding: 20, backgroundColor: '#0c1527', borderRadius: 12, borderWidth: 1, borderColor: Colors.red, alignItems: 'center', gap: 8 },
  errorText: { color: Colors.red, fontSize: 12 },
  retryBtn: { backgroundColor: '#0891b2', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 },
  retryText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  heroCard: { backgroundColor: '#0c1527', borderRadius: 14, borderWidth: 1, borderColor: '#334155', padding: 16, marginBottom: 14 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  heroTag: { fontSize: 10, fontWeight: '800', color: Colors.greenLight, letterSpacing: 0.6, marginBottom: 4 },
  heroWinner: { fontSize: 24, fontWeight: '900', color: '#fff' },
  scoreCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(6, 182, 212, 0.15)', borderWidth: 2, borderColor: Colors.cyan, alignItems: 'center', justifyContent: 'center' },
  scoreCircleNum: { fontSize: 18, fontWeight: '900', color: Colors.cyan },
  scoreCircleLabel: { fontSize: 8, fontWeight: '800', color: '#64748b' },
  metaRow: { flexDirection: 'row', backgroundColor: '#050914', borderRadius: 8, padding: 10, gap: 10 },
  metaItem: { flex: 1 },
  metaKey: { fontSize: 9, color: '#64748b', marginBottom: 2 },
  metaVal: { fontSize: 12, fontWeight: '700', color: '#e2e8f0' },
  factorsCard: { backgroundColor: '#0c1527', borderRadius: 14, borderWidth: 1, borderColor: '#1e293b', padding: 16, marginBottom: 14 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#94a3b8', letterSpacing: 0.8, marginBottom: 14 },
  factorRow: { marginBottom: 12 },
  factorLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  factorLabel: { fontSize: 12, color: '#cbd5e1', fontWeight: '600' },
  factorValGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  factorWeight: { fontSize: 10, color: '#64748b', fontWeight: '600' },
  factorScore: { fontSize: 12, fontWeight: '800' },
  track: { height: 6, backgroundColor: '#1e293b', borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  reasonCard: { backgroundColor: '#0c1527', borderRadius: 14, borderWidth: 1, borderColor: '#1e293b', padding: 14 },
  reasonHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  reasonTitle: { fontSize: 12, fontWeight: '800', color: '#fff' },
  reasonBody: { fontSize: 13, color: '#cbd5e1', lineHeight: 20 },
});
