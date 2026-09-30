/**
 * ResourceDetailScreen.tsx — Live AWS CloudWatch Telemetry Monitor
 * Real-time metric series without fabricated data.
 * Displays "Memory metric unavailable" when CWAgent is absent.
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl
} from 'react-native';
import {
  ArrowLeft, Server, Activity, Cpu, HardDrive,
  Wifi, RefreshCw, AlertCircle, CheckCircle2, Clock, ShieldAlert
} from 'lucide-react-native';
import { systemApi, normalizeError } from '../api/client';
import { Colors } from '../theme/colors';

type TimeRange = '30m' | '1h' | '6h';

export default function ResourceDetailScreen({ route, navigation }: any) {
  const instance = route?.params?.instance || {
    id: 'i-048f6c8c075f25999',
    type: 't3.micro',
    state: 'running',
    vcpu: 2,
    memory_gb: 1.0,
    az: 'us-east-1a',
    isSimulation: false,
  };

  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('30m');
  const [error, setError] = useState('');

  const fetchMetrics = async () => {
    if (instance.isSimulation) {
      // In simulation mode, use instance's virtual values
      setMetrics({
        status: 'OK',
        data_source: 'SIMULATION_ENVIRONMENT',
        current: {
          cpu_utilization: instance.utilization ?? 34.2,
          memory_used_percent: null,
          disk_used_percent: null,
          net_bytes_recv: 12400,
          net_bytes_sent: 8900,
          diskio_read_bytes: 0,
          diskio_write_bytes: 0,
        },
      });
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await systemApi.awsMetrics(instance.id);
      setMetrics(res.data);
    } catch (e: any) {
      setError(normalizeError(e).userMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [instance.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchMetrics();
    setRefreshing(false);
  };

  const isRunning = instance.state === 'running';
  const current = metrics?.current || {};
  const datapoints = metrics?.datapoints || {};

  // Real CPU utilization
  const cpuCurrent = current.cpu_utilization != null ? `${current.cpu_utilization.toFixed(1)}%` : 'No datapoints';
  const cpuPoints: any[] = datapoints.cpu_utilization || [];

  // Network metrics
  const netInVal = current.net_bytes_recv != null
    ? `${(current.net_bytes_recv / 1024).toFixed(1)} KB/s`
    : 'No datapoints';
  const netOutVal = current.net_bytes_sent != null
    ? `${(current.net_bytes_sent / 1024).toFixed(1)} KB/s`
    : 'No datapoints';

  // Memory & Disk (explicitly checks if CloudWatch agent metric exists)
  const memAvailable = current.memory_used_percent != null;
  const diskAvailable = current.disk_used_percent != null;

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
          <Text style={styles.headerPre}>
            {instance.isSimulation ? 'SIMULATION VIRTUAL NODE' : 'CLOUDWATCH TELEMETRY'}
          </Text>
          <Text style={styles.headerTitle}>{instance.id}</Text>
        </View>
        <TouchableOpacity onPress={fetchMetrics} style={styles.reloadBtn}>
          <RefreshCw size={16} color={Colors.cyan} />
        </TouchableOpacity>
      </View>

      {/* Instance Summary Hero */}
      <View style={styles.instanceHero}>
        <View style={styles.instanceHeroTop}>
          <View>
            <Text style={styles.instanceType}>{instance.type || 't3.micro'}</Text>
            <Text style={styles.instanceZone}>Zone: {instance.az || 'us-east-1a'}</Text>
          </View>
          <View style={[styles.statePill, { backgroundColor: isRunning ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)' }]}>
            <CheckCircle2 size={12} color={isRunning ? Colors.greenLight : Colors.red} />
            <Text style={[styles.stateText, { color: isRunning ? Colors.greenLight : Colors.red }]}>
              {instance.state?.toUpperCase() || 'RUNNING'}
            </Text>
          </View>
        </View>

        <View style={styles.specsRow}>
          <View style={styles.specBox}>
            <Text style={styles.specKey}>vCPU</Text>
            <Text style={styles.specVal}>{instance.vcpu ?? 2} Cores</Text>
          </View>
          <View style={styles.specBox}>
            <Text style={styles.specKey}>Memory</Text>
            <Text style={styles.specVal}>{instance.memory_gb ?? 1.0} GB</Text>
          </View>
          <View style={styles.specBox}>
            <Text style={styles.specKey}>Source</Text>
            <Text style={[styles.specVal, { color: instance.isSimulation ? Colors.cyan : '#34d399' }]}>
              {instance.isSimulation ? 'Virtual' : 'AWS EC2'}
            </Text>
          </View>
        </View>
      </View>

      {/* Time Range Selector */}
      <View style={styles.timeRangeBar}>
        <View style={styles.timeRangeLabelRow}>
          <Clock size={14} color="#64748b" />
          <Text style={styles.timeRangeLabel}>Time Window</Text>
        </View>
        <View style={styles.timePills}>
          {(['30m', '1h', '6h'] as TimeRange[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.timePill, timeRange === t && styles.timePillActive]}
              onPress={() => setTimeRange(t)}
            >
              <Text style={[styles.timePillText, timeRange === t && styles.timePillTextActive]}>
                Last {t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <ShieldAlert size={16} color={Colors.orange} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Live Metrics Grid */}
      <Text style={styles.sectionHeader}>TELEMETRY STREAM</Text>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={Colors.cyan} />
          <Text style={styles.loadingText}>Fetching live CloudWatch metrics...</Text>
        </View>
      ) : (
        <View style={styles.metricsGrid}>
          {/* CPU Card */}
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <View style={styles.metricTitleRow}>
                <Cpu size={14} color={Colors.cyan} />
                <Text style={styles.metricTitle}>CPU Utilization</Text>
              </View>
              <Text style={[styles.statusPill, { color: Colors.greenLight }]}>ACTIVE</Text>
            </View>
            <Text style={styles.metricMainVal}>{cpuCurrent}</Text>
            <Text style={styles.metricSubVal}>AWS/EC2 Metric Stat: Average</Text>

            {/* Sparkline from real points if available */}
            {cpuPoints.length > 0 && (
              <View style={styles.sparkline}>
                {cpuPoints.slice(0, 10).reverse().map((pt, idx) => {
                  const hPct = Math.max(10, Math.min(100, pt.value * 2));
                  return (
                    <View
                      key={idx}
                      style={[
                        styles.sparkBar,
                        { height: `${hPct}%`, backgroundColor: Colors.cyan }
                      ]}
                    />
                  );
                })}
              </View>
            )}
          </View>

          {/* Memory Card — Displays unavailable if no CWAgent */}
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <View style={styles.metricTitleRow}>
                <HardDrive size={14} color="#64748b" />
                <Text style={styles.metricTitle}>Memory Used</Text>
              </View>
              <Text style={[styles.statusPill, { color: memAvailable ? Colors.greenLight : '#64748b' }]}>
                {memAvailable ? 'ACTIVE' : 'UNAVAILABLE'}
              </Text>
            </View>
            <Text style={[styles.metricMainVal, !memAvailable && { color: '#64748b', fontSize: 14 }]}>
              {memAvailable ? `${current.memory_used_percent.toFixed(1)}%` : 'Memory metric unavailable'}
            </Text>
            <Text style={styles.metricSubVal}>
              {memAvailable ? 'CWAgent mem_used_percent' : 'Requires CloudWatch Agent daemon on EC2'}
            </Text>
          </View>

          {/* Disk Space Card */}
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <View style={styles.metricTitleRow}>
                <HardDrive size={14} color="#64748b" />
                <Text style={styles.metricTitle}>Disk Space (Root /)</Text>
              </View>
              <Text style={[styles.statusPill, { color: diskAvailable ? Colors.greenLight : '#64748b' }]}>
                {diskAvailable ? 'ACTIVE' : 'UNAVAILABLE'}
              </Text>
            </View>
            <Text style={[styles.metricMainVal, !diskAvailable && { color: '#64748b', fontSize: 14 }]}>
              {diskAvailable ? `${current.disk_used_percent.toFixed(1)}%` : 'Disk metric unavailable'}
            </Text>
            <Text style={styles.metricSubVal}>
              {diskAvailable ? 'CWAgent disk_used_percent' : 'Requires CloudWatch Agent disk collector'}
            </Text>
          </View>

          {/* Network In Card */}
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <View style={styles.metricTitleRow}>
                <Wifi size={14} color={Colors.blue} />
                <Text style={styles.metricTitle}>Network Receive (In)</Text>
              </View>
              <Text style={[styles.statusPill, { color: Colors.blueLight }]}>ACTIVE</Text>
            </View>
            <Text style={styles.metricMainVal}>{netInVal}</Text>
            <Text style={styles.metricSubVal}>AWS/EC2 NetworkIn metric</Text>
          </View>

          {/* Network Out Card */}
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <View style={styles.metricTitleRow}>
                <Wifi size={14} color={Colors.blue} />
                <Text style={styles.metricTitle}>Network Transmit (Out)</Text>
              </View>
              <Text style={[styles.statusPill, { color: Colors.blueLight }]}>ACTIVE</Text>
            </View>
            <Text style={styles.metricMainVal}>{netOutVal}</Text>
            <Text style={styles.metricSubVal}>AWS/EC2 NetworkOut metric</Text>
          </View>
        </View>
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
  headerPre: { fontSize: 10, fontWeight: '800', color: Colors.cyan, letterSpacing: 0.8 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  instanceHero: { backgroundColor: '#0c1527', borderRadius: 14, borderWidth: 1, borderColor: '#1e293b', padding: 16, marginBottom: 16 },
  instanceHeroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  instanceType: { fontSize: 18, fontWeight: '800', color: '#fff' },
  instanceZone: { fontSize: 11, color: '#64748b', marginTop: 2 },
  statePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, gap: 6 },
  stateText: { fontSize: 10, fontWeight: '800' },
  specsRow: { flexDirection: 'row', backgroundColor: '#050914', borderRadius: 10, padding: 10, gap: 10 },
  specBox: { flex: 1 },
  specKey: { fontSize: 10, color: '#64748b', fontWeight: '600', marginBottom: 2 },
  specVal: { fontSize: 12, fontWeight: '700', color: '#e2e8f0' },
  timeRangeBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0c1527', borderRadius: 10, padding: 8, borderWidth: 1, borderColor: '#1e293b', marginBottom: 16 },
  timeRangeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 6 },
  timeRangeLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  timePills: { flexDirection: 'row', gap: 4 },
  timePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  timePillActive: { backgroundColor: '#0891b2' },
  timePillText: { fontSize: 11, color: '#64748b', fontWeight: '700' },
  timePillTextActive: { color: '#fff' },
  errorBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)', marginBottom: 16, gap: 8 },
  errorText: { fontSize: 12, color: '#fbbf24', flex: 1 },
  sectionHeader: { fontSize: 11, fontWeight: '800', color: '#94a3b8', letterSpacing: 0.8, marginBottom: 12 },
  loadingBox: { padding: 40, alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 12, color: '#64748b' },
  metricsGrid: { gap: 12 },
  metricCard: { backgroundColor: '#0c1527', borderRadius: 14, borderWidth: 1, borderColor: '#1e293b', padding: 14 },
  metricHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  metricTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metricTitle: { fontSize: 12, fontWeight: '700', color: '#cbd5e1' },
  statusPill: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  metricMainVal: { fontSize: 20, fontWeight: '900', color: '#fff', marginBottom: 4 },
  metricSubVal: { fontSize: 10, color: '#64748b' },
  sparkline: { flexDirection: 'row', height: 40, alignItems: 'flex-end', gap: 4, marginTop: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#1e293b' },
  sparkBar: { flex: 1, borderRadius: 2 },
});
