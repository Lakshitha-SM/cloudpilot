/**
 * ResourcesScreen.tsx — Dual-Mode Cloud Resources Monitor
 * Supports:
 *   1. SIMULATION MODE: 5 Virtual Cloud Nodes (VM-01 to VM-05) with full telemetry & cost estimates
 *   2. AWS REAL-TIME MODE: Live EC2 instances via backend in READ_ONLY mode
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
  TextInput, ActivityIndicator
} from 'react-native';
import {
  Server, Search, RefreshCw, CheckCircle2, AlertCircle,
  HardDrive, Cpu, Wifi, DollarSign, Activity, ShieldCheck
} from 'lucide-react-native';
import { systemApi, normalizeError } from '../api/client';
import { useCloudMode, VirtualResource } from '../context/CloudModeContext';
import ModeSwitch from '../components/ModeSwitch';
import ConnectionStatusBar from '../components/ConnectionStatusBar';
import { Colors } from '../theme/colors';

type FilterType = 'all' | 'running' | 'stopped';

export default function ResourcesScreen({ navigation }: any) {
  const { isSimulation, isAwsLive, simulationResources, switchModeWithPrompt } = useCloudMode();
  const [awsInstances, setAwsInstances] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [awsError, setAwsError] = useState('');

  const fetchAwsInstances = async () => {
    if (!isAwsLive) return;
    setLoading(true);
    setAwsError('');
    try {
      const res = await systemApi.awsInstances();
      setAwsInstances(res.data.instances || []);
    } catch (e: any) {
      const norm = normalizeError(e);
      setAwsError(norm.userMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAwsLive) {
      fetchAwsInstances();
    }
  }, [isAwsLive]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (isAwsLive) await fetchAwsInstances();
    setRefreshing(false);
  };

  // Build items based on mode
  const rawList: any[] = isSimulation
    ? simulationResources.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.instanceType,
        vcpu: r.vcpu,
        memory_gb: r.memoryGb,
        state: r.status,
        az: r.availabilityZone,
        network: `${r.networkGbps} Gbps`,
        io: r.io,
        utilization: r.currentUtilization,
        cost: `$${r.costPerHour}/hr`,
        isSimulation: true,
      }))
    : awsInstances.map((i) => ({
        ...i,
        name: i.tags?.find((t: any) => t.Key === 'Name')?.Value || i.id,
        isSimulation: false,
      }));

  const filtered = rawList.filter((item) => {
    const matchFilter = filter === 'all' || item.state === filter;
    const nameMatch = !search ||
      item.name?.toLowerCase().includes(search.toLowerCase()) ||
      item.id?.toLowerCase().includes(search.toLowerCase()) ||
      item.type?.toLowerCase().includes(search.toLowerCase());
    return matchFilter && nameMatch;
  });

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topPre}>INFRASTRUCTURE INVENTORY</Text>
          <Text style={styles.title}>Cloud Resources</Text>
        </View>
        <ConnectionStatusBar />
      </View>

      {/* Mode Switch Header */}
      <View style={styles.switchWrapper}>
        <ModeSwitch compact />
      </View>

      {/* Environment Mode Banner */}
      <View
        style={[
          styles.envBanner,
          {
            backgroundColor: isSimulation ? 'rgba(6, 182, 212, 0.08)' : 'rgba(16, 185, 129, 0.08)',
            borderColor: isSimulation ? Colors.cyan : '#10b981',
          }
        ]}
      >
        <Text style={[styles.envBannerText, { color: isSimulation ? Colors.cyan : '#34d399' }]}>
          {isSimulation
            ? '● SIMULATION ENVIRONMENT • SAFE SANDBOX (5 VIRTUAL NODES)'
            : '● AWS LIVE INFRASTRUCTURE • STRICTLY READ-ONLY (NO MUTATIONS)'}
        </Text>
      </View>

      {/* Search & Filter Bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Search size={16} color="#64748b" />
          <TextInput
            style={styles.searchInput}
            placeholder={isSimulation ? 'Search virtual nodes…' : 'Search EC2 instances…'}
            placeholderTextColor="#64748b"
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          <RefreshCw size={16} color={Colors.cyan} />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(['all', 'running', 'stopped'] as FilterType[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Main Content List */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.cyan} />
          <Text style={styles.centerText}>Discovering AWS EC2 instances...</Text>
        </View>
      ) : awsError && isAwsLive ? (
        <View style={styles.errorBox}>
          <AlertCircle size={24} color={Colors.orange} />
          <Text style={styles.errorTitle}>AWS EC2 Connection Degraded</Text>
          <Text style={styles.errorSub}>{awsError}</Text>
          <TouchableOpacity
            style={styles.fallbackBtn}
            onPress={() => switchModeWithPrompt('simulation')}
          >
            <Text style={styles.fallbackBtnText}>Switch to Simulation Mode</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan} />
          }
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isRunning = item.state === 'running';
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.8}
                onPress={() => navigation.navigate('ResourceDetail', { instance: item })}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.iconCircle}>
                    <Server size={18} color={isSimulation ? Colors.cyan : '#34d399'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    <Text style={styles.cardSubtitle}>{item.id} • {item.az}</Text>
                  </View>
                  <View
                    style={[
                      styles.statePill,
                      { backgroundColor: isRunning ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)' }
                    ]}
                  >
                    <Text
                      style={[
                        styles.stateText,
                        { color: isRunning ? Colors.greenLight : Colors.red }
                      ]}
                    >
                      {item.state?.toUpperCase()}
                    </Text>
                  </View>
                </View>

                {/* Specs Grid */}
                <View style={styles.specsGrid}>
                  <View style={styles.specBox}>
                    <Text style={styles.specLabel}>Profile</Text>
                    <Text style={styles.specVal}>{item.type || 't3.micro'}</Text>
                  </View>
                  <View style={styles.specBox}>
                    <Text style={styles.specLabel}>vCPU</Text>
                    <Text style={styles.specVal}>{item.vcpu ?? 2} Cores</Text>
                  </View>
                  <View style={styles.specBox}>
                    <Text style={styles.specLabel}>RAM</Text>
                    <Text style={styles.specVal}>
                      {item.memory_gb != null ? `${item.memory_gb} GB` : '—'}
                    </Text>
                  </View>
                  <View style={styles.specBox}>
                    <Text style={styles.specLabel}>
                      {isSimulation ? 'Utilization' : 'Telemet.'}
                    </Text>
                    <Text style={[styles.specVal, { color: Colors.cyan }]}>
                      {item.utilization != null ? `${item.utilization}%` : 'CW Agent'}
                    </Text>
                  </View>
                </View>

                {/* Simulation Tag */}
                {isSimulation && (
                  <View style={styles.cardFooter}>
                    <Text style={styles.costText}>Estimated: {item.cost || '$0.0104/hr'}</Text>
                    <Text style={styles.simBadge}>SANDBOX VIRTUAL</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No matching instances</Text>
              <Text style={styles.emptySub}>
                {search ? `No results found for "${search}"` : 'No instances active in this mode.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070b14',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 12,
  },
  topPre: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.cyan,
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
  },
  switchWrapper: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  envBanner: {
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  envBannerText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  searchRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0c1527',
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    paddingVertical: 8,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#0c1527',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#0c1527',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  filterTabActive: {
    backgroundColor: '#0891b2',
    borderColor: Colors.cyan,
  },
  filterText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
  },
  filterTextActive: {
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#0c1527',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#050914',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  cardSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  statePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  stateText: {
    fontSize: 10,
    fontWeight: '800',
  },
  specsGrid: {
    flexDirection: 'row',
    backgroundColor: '#050914',
    borderRadius: 8,
    padding: 8,
    gap: 6,
  },
  specBox: {
    flex: 1,
  },
  specLabel: {
    fontSize: 9,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 2,
  },
  specVal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#e2e8f0',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  costText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  simBadge: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.cyan,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  centerBox: {
    paddingTop: 60,
    alignItems: 'center',
    gap: 12,
  },
  centerText: {
    fontSize: 12,
    color: '#64748b',
  },
  errorBox: {
    margin: 20,
    padding: 20,
    backgroundColor: '#0c1527',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    gap: 8,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#f8fafc',
  },
  errorSub: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 10,
  },
  fallbackBtn: {
    backgroundColor: '#0891b2',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  fallbackBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyBox: {
    paddingTop: 40,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94a3b8',
  },
  emptySub: {
    fontSize: 11,
    color: '#64748b',
  },
});
