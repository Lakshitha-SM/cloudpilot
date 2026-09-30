/**
 * ResourceMappingScreen.tsx
 * Displays full backend mapping pipeline:
 * REQUEST -> AVAILABLE RESOURCES -> FEASIBLE RESOURCES -> INFEASIBLE RESOURCES
 * Authoritative hardware checks executed by backend Mapping Agent.
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator
} from 'react-native';
import {
  CheckCircle2, XCircle, ArrowLeft, Cpu, HardDrive,
  Wifi, Sliders, ArrowDown, Server, Layers
} from 'lucide-react-native';
import { agentApi, normalizeError, DEFAULT_WORKLOAD } from '../api/client';
import { useCloudMode } from '../context/CloudModeContext';
import { Colors } from '../theme/colors';

export default function ResourceMappingScreen({ navigation }: any) {
  const { isAwsLive } = useCloudMode();
  const [cpu, setCpu] = useState('2');
  const [memory, setMemory] = useState('2.0');
  const [io, setIo] = useState('Medium');
  const [net, setNet] = useState('0.5');
  const [workloadType, setWorkloadType] = useState('E-Commerce');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const runMapping = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = {
        ...DEFAULT_WORKLOAD,
        required_cpu: 30.0,
        required_vcpu: parseFloat(cpu) || 2.0,
        required_mem: parseFloat(memory) || 2.0,
        required_io: io,
        required_net: parseFloat(net) || 0.5,
        workload_type: workloadType,
        mode: isAwsLive ? 'aws_live' : 'sim',
      };
      const res = await agentApi.runMapping(payload);
      setResult(res.data);
    } catch (e: any) {
      setError(normalizeError(e).userMessage);
    } finally {
      setLoading(false);
    }
  };

  const candidates = result?.candidates || [];
  const rejected = result?.rejected || [];
  const totalFound = result?.candidates_found || (candidates.length + rejected.length);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.screenPre}>HARDWARE FEASIBILITY AGENT</Text>
          <Text style={styles.screenTitle}>Resource Mapping</Text>
        </View>
      </View>

      {/* 1. Request Input Card */}
      <View style={styles.card}>
        <Text style={styles.cardSectionTitle}>1. WORKLOAD SPECIFICATION REQUEST</Text>

        <View style={styles.inputGrid}>
          <View style={styles.inputGroup}>
            <View style={styles.inputLabelRow}>
              <Cpu size={14} color={Colors.cyan} />
              <Text style={styles.inputLabel}>Required vCPU</Text>
            </View>
            <TextInput
              style={styles.textInput}
              keyboardType="numeric"
              value={cpu}
              onChangeText={setCpu}
              placeholder="e.g. 2"
              placeholderTextColor="#64748b"
            />
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.inputLabelRow}>
              <HardDrive size={14} color={Colors.blue} />
              <Text style={styles.inputLabel}>RAM (GB)</Text>
            </View>
            <TextInput
              style={styles.textInput}
              keyboardType="numeric"
              value={memory}
              onChangeText={setMemory}
              placeholder="e.g. 2.0"
              placeholderTextColor="#64748b"
            />
          </View>
        </View>

        <View style={styles.inputGrid}>
          <View style={styles.inputGroup}>
            <View style={styles.inputLabelRow}>
              <Sliders size={14} color={Colors.purple} />
              <Text style={styles.inputLabel}>I/O Intensity</Text>
            </View>
            <View style={styles.toggleRow}>
              {['Low', 'Medium', 'High'].map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.toggleBtn, io === opt && styles.toggleBtnActive]}
                  onPress={() => setIo(opt)}
                >
                  <Text style={[styles.toggleBtnText, io === opt && styles.toggleBtnTextActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.inputLabelRow}>
              <Wifi size={14} color={Colors.green} />
              <Text style={styles.inputLabel}>Network Bandwidth</Text>
            </View>
            <TextInput
              style={styles.textInput}
              keyboardType="numeric"
              value={net}
              onChangeText={setNet}
              placeholder="e.g. 0.5"
              placeholderTextColor="#64748b"
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.runBtn, loading && styles.runBtnDisabled]}
          onPress={runMapping}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.runBtnText}>Execute Feasibility Mapping</Text>
          )}
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      ) : null}

      {/* Discovery Pipeline Breakdown */}
      {result && (
        <View style={styles.resultsContainer}>
          {/* Connector */}
          <View style={styles.connector}>
            <ArrowDown size={18} color={Colors.cyan} />
            <Text style={styles.connectorText}>Evaluating Hardware Hard Constraints</Text>
          </View>

          {/* 2. Available Resources */}
          <View style={styles.summaryBar}>
            <Layers size={16} color={Colors.cyan} />
            <Text style={styles.summaryText}>
              Available Pool: {totalFound} nodes discovered ({isAwsLive ? 'AWS EC2' : 'Simulation Pool'})
            </Text>
          </View>

          {/* 3. Feasible Resources Section */}
          <Text style={styles.sectionHeading}>FEASIBLE RESOURCES ({candidates.length})</Text>

          {candidates.length === 0 ? (
            <View style={styles.noFeasibleBox}>
              <Text style={styles.noFeasibleTitle}>No Feasible Resources Found</Text>
              <Text style={styles.noFeasibleSub}>Requested hardware constraints exceed all discovered node limits.</Text>
            </View>
          ) : (
            candidates.map((cand: any, idx: number) => {
              const name = cand.vm_id || cand.name || cand.id || `VM-${idx + 1}`;
              const vcpu = cand.vcpu ?? 2;
              const ram = cand.available_mem_gb ?? cand.memory_gb ?? 1.0;
              const util = cand.current_utilization ?? cand.utilization ?? 0;
              return (
                <View key={idx} style={styles.feasibleCard}>
                  <View style={styles.cardTopRow}>
                    <View>
                      <Text style={styles.nodeName}>{name}</Text>
                      <Text style={styles.nodeType}>{cand.instance_type || 't3.micro'}</Text>
                    </View>
                    <View style={styles.feasibleBadge}>
                      <CheckCircle2 size={12} color={Colors.greenLight} />
                      <Text style={styles.feasibleBadgeText}>FEASIBLE</Text>
                    </View>
                  </View>

                  <View style={styles.specsRow}>
                    <View style={styles.specItem}>
                      <Text style={styles.specLabel}>CPU Capacity</Text>
                      <Text style={styles.specVal}>{vcpu} vCPU</Text>
                    </View>
                    <View style={styles.specItem}>
                      <Text style={styles.specLabel}>RAM Capacity</Text>
                      <Text style={styles.specVal}>{ram} GB</Text>
                    </View>
                    <View style={styles.specItem}>
                      <Text style={styles.specLabel}>Current Util.</Text>
                      <Text style={[styles.specVal, { color: Colors.cyan }]}>{util.toFixed(1)}%</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}

          {/* 4. Infeasible Resources Section */}
          {rejected.length > 0 && (
            <>
              <Text style={[styles.sectionHeading, { color: '#f87171', marginTop: 18 }]}>
                INFEASIBLE RESOURCES ({rejected.length})
              </Text>

              {rejected.map((rej: any, idx: number) => (
                <View key={idx} style={styles.infeasibleCard}>
                  <View style={styles.cardTopRow}>
                    <Text style={styles.nodeName}>{rej.vm_id || `Node-${idx + 1}`}</Text>
                    <View style={styles.infeasibleBadge}>
                      <XCircle size={12} color={Colors.red} />
                      <Text style={styles.infeasibleBadgeText}>INFEASIBLE</Text>
                    </View>
                  </View>
                  <Text style={styles.rejectionReason}>✕ Reason: {rej.reason || 'Insufficient hardware headroom'}</Text>
                </View>
              ))}
            </>
          )}
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
  screenPre: { fontSize: 10, fontWeight: '800', color: Colors.cyan, letterSpacing: 0.8 },
  screenTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  card: { backgroundColor: '#0c1527', borderRadius: 14, borderWidth: 1, borderColor: '#1e293b', padding: 16, marginBottom: 14 },
  cardSectionTitle: { fontSize: 11, fontWeight: '800', color: '#94a3b8', letterSpacing: 0.8, marginBottom: 12 },
  inputGrid: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  inputGroup: { flex: 1 },
  inputLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  inputLabel: { fontSize: 11, color: '#cbd5e1', fontWeight: '600' },
  textInput: { backgroundColor: '#050914', borderRadius: 8, borderWidth: 1, borderColor: '#334155', color: '#fff', paddingHorizontal: 12, paddingVertical: 8, fontSize: 13 },
  toggleRow: { flexDirection: 'row', backgroundColor: '#050914', borderRadius: 8, padding: 2, borderWidth: 1, borderColor: '#334155' },
  toggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  toggleBtnActive: { backgroundColor: '#0891b2' },
  toggleBtnText: { fontSize: 10, fontWeight: '700', color: '#64748b' },
  toggleBtnTextActive: { color: '#fff' },
  runBtn: { backgroundColor: Colors.blue, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  runBtnDisabled: { opacity: 0.6 },
  runBtnText: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  errorBox: { backgroundColor: 'rgba(239, 68, 68, 0.12)', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.red, marginBottom: 16 },
  errorText: { color: Colors.red, fontSize: 12 },
  resultsContainer: { marginTop: 4 },
  connector: { alignItems: 'center', paddingVertical: 10, gap: 4 },
  connectorText: { fontSize: 10, fontWeight: '700', color: Colors.cyan, letterSpacing: 0.5 },
  summaryBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0c1527', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#1e293b', gap: 8, marginBottom: 14 },
  summaryText: { fontSize: 12, fontWeight: '700', color: '#cbd5e1' },
  sectionHeading: { fontSize: 11, fontWeight: '800', color: Colors.greenLight, letterSpacing: 0.8, marginBottom: 8 },
  feasibleCard: { backgroundColor: '#0c1527', borderRadius: 12, borderWidth: 1, borderColor: '#1e293b', padding: 14, marginBottom: 10 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  nodeName: { fontSize: 14, fontWeight: '800', color: '#fff' },
  nodeType: { fontSize: 11, color: '#64748b' },
  feasibleBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#064e3b', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, gap: 4 },
  feasibleBadgeText: { fontSize: 9, fontWeight: '800', color: Colors.greenLight },
  infeasibleBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#450a0a', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, gap: 4 },
  infeasibleBadgeText: { fontSize: 9, fontWeight: '800', color: Colors.red },
  specsRow: { flexDirection: 'row', backgroundColor: '#050914', borderRadius: 8, padding: 8, gap: 8 },
  specItem: { flex: 1 },
  specLabel: { fontSize: 9, color: '#64748b', marginBottom: 2 },
  specVal: { fontSize: 11, fontWeight: '700', color: '#e2e8f0' },
  infeasibleCard: { backgroundColor: '#0c1527', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)', padding: 12, marginBottom: 8 },
  rejectionReason: { fontSize: 11, color: '#f87171', marginTop: 4, lineHeight: 16 },
  noFeasibleBox: { padding: 20, backgroundColor: '#0c1527', borderRadius: 12, alignItems: 'center', gap: 4, marginBottom: 10 },
  noFeasibleTitle: { fontSize: 13, fontWeight: '700', color: '#f87171' },
  noFeasibleSub: { fontSize: 11, color: '#64748b', textAlign: 'center' },
});
