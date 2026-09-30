/**
 * DeveloperSettingsScreen.tsx
 * Developer Diagnostics & API Health Monitor.
 * (Only accessible in development mode)
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator
} from 'react-native';
import {
  ArrowLeft, Terminal, Server, Wifi, Activity,
  Save, RotateCcw, CheckCircle2, XCircle, ShieldAlert
} from 'lucide-react-native';
import {
  getActiveApiUrl, setActiveApiUrl, checkBackendHealth,
  getActiveHostUrl, getHealthEndpointUrl, getLastSuccessfulRequest, systemApi
} from '../api/client';
import { getApiBaseUrl } from '../config/env';
import { useCloudMode } from '../context/CloudModeContext';
import { Colors } from '../theme/colors';

export default function DeveloperSettingsScreen({ navigation }: any) {
  const { refreshHealth } = useCloudMode();
  const [currentUrl, setCurrentUrl] = useState(getActiveApiUrl());
  const [inputUrl, setInputUrl] = useState(getActiveHostUrl());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [backendMeta, setBackendMeta] = useState<any>(null);
  const [lastSuccessTime, setLastSuccessTime] = useState<string | null>(null);

  const testConnection = async (urlToTest?: string) => {
    setTesting(true);
    setTestResult(null);
    const target = urlToTest || inputUrl;
    const result = await checkBackendHealth(target);
    setTestResult(result);
    setTesting(false);

    if (result.online) {
      setLastSuccessTime(new Date().toLocaleTimeString());
      try {
        const metaRes = await systemApi.version();
        setBackendMeta(metaRes.data);
      } catch {
        setBackendMeta({ version: '1.0.0', status: 'ok', name: 'CloudPilot FastAPI v1.0' });
      }
    }
  };

  useEffect(() => {
    testConnection(getActiveHostUrl());
  }, []);

  const handleSave = async () => {
    let clean = inputUrl.trim();
    if (!clean) {
      Alert.alert('Invalid URL', 'Please enter a valid backend URL.');
      return;
    }
    await setActiveApiUrl(clean);
    setCurrentUrl(getActiveApiUrl());
    setInputUrl(getActiveHostUrl());
    await refreshHealth();
    Alert.alert('Saved', `Active API URL updated to:\n${getActiveApiUrl()}`);
    testConnection(getActiveHostUrl());
  };

  const handleReset = async () => {
    const defaultUrl = getApiBaseUrl();
    await setActiveApiUrl(defaultUrl);
    setCurrentUrl(defaultUrl);
    setInputUrl(getActiveHostUrl());
    await refreshHealth();
    testConnection(getActiveHostUrl());
  };

  const hostUrl = getActiveHostUrl();
  const healthUrl = getHealthEndpointUrl();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerPre}>NETWORK & TELEMETRY</Text>
          <Text style={styles.headerTitle}>Developer Diagnostics</Text>
        </View>
      </View>

      <View style={styles.warningCard}>
        <ShieldAlert size={16} color={Colors.cyan} />
        <Text style={styles.warningText}>
          Standalone Internet Application. Real-time telemetry for Mobile Client ↔ CloudPilot Cloud Backend.
        </Text>
      </View>

      {/* Result Status Banner */}
      {testResult ? (
        <View style={[
          styles.resultBanner,
          testResult.category === 'CONNECTED'
            ? styles.resultSuccess
            : testResult.category === 'TIMEOUT'
            ? styles.resultTimeout
            : styles.resultFailed
        ]}>
          <View style={styles.bannerRow}>
            {testResult.category === 'CONNECTED' ? (
              <CheckCircle2 size={22} color={Colors.green} />
            ) : testResult.category === 'TIMEOUT' ? (
              <Activity size={22} color={Colors.orange} />
            ) : (
              <XCircle size={22} color={Colors.red} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={[
                styles.bannerTitle,
                {
                  color: testResult.category === 'CONNECTED'
                    ? Colors.greenLight
                    : testResult.category === 'TIMEOUT'
                    ? Colors.orange
                    : Colors.red
                }
              ]}>
                {testResult.category === 'CONNECTED' && '✓ CONNECTED'}
                {testResult.category === 'UNREACHABLE' && '✕ UNREACHABLE'}
                {testResult.category === 'TIMEOUT' && '⏱ TIMEOUT'}
                {testResult.category === 'HTTP_ERROR' && '⚠ HTTP ERROR'}
              </Text>
              <Text style={styles.bannerSub}>
                {testResult.category === 'CONNECTED'
                  ? `${backendMeta?.name || 'CloudPilot FastAPI v1.0'} · Latency: ${testResult.latencyMs} ms`
                  : testResult.error || 'Connection failed'}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* Network Diagnostic Card */}
      <View style={styles.card}>
        <Text style={styles.cardSectionTitle}>LIVE BACKEND DIAGNOSTICS</Text>

        <View style={styles.statusGrid}>
          <View style={styles.statusRow}>
            <Text style={styles.statusKey}>Configured Base URL:</Text>
            <Text style={styles.statusVal}>{hostUrl}</Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusKey}>Health Endpoint:</Text>
            <Text style={[styles.statusVal, { color: Colors.cyan }]}>{healthUrl}</Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusKey}>Status:</Text>
            <View style={styles.inlineStatus}>
              {testResult?.category === 'CONNECTED' ? (
                <>
                  <CheckCircle2 size={13} color={Colors.green} />
                  <Text style={[styles.statusVal, { color: Colors.greenLight, fontWeight: '700' }]}>CONNECTED</Text>
                </>
              ) : testResult?.category === 'TIMEOUT' ? (
                <>
                  <Activity size={13} color={Colors.orange} />
                  <Text style={[styles.statusVal, { color: Colors.orange, fontWeight: '700' }]}>TIMEOUT</Text>
                </>
              ) : testResult?.category === 'HTTP_ERROR' ? (
                <>
                  <XCircle size={13} color={Colors.red} />
                  <Text style={[styles.statusVal, { color: Colors.red, fontWeight: '700' }]}>HTTP ERROR</Text>
                </>
              ) : (
                <>
                  <XCircle size={13} color={Colors.red} />
                  <Text style={[styles.statusVal, { color: Colors.red, fontWeight: '700' }]}>UNREACHABLE</Text>
                </>
              )}
            </View>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusKey}>Latency:</Text>
            <Text style={styles.statusVal}>
              {testResult?.latencyMs != null ? `${testResult.latencyMs} ms` : '—'}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusKey}>Last successful request:</Text>
            <Text style={styles.statusVal}>
              {lastSuccessTime || getLastSuccessfulRequest()?.toLocaleTimeString() || 'None in this session'}
            </Text>
          </View>
          {testResult && testResult.category !== 'CONNECTED' ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorLabel}>Diagnostic Summary:</Text>
              <Text style={styles.errorText}>
                {testResult.error || 'Connection failed.'}
              </Text>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.testBtn, testing && styles.btnDisabled]}
          onPress={() => testConnection()}
          disabled={testing}
        >
          {testing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Activity size={16} color="#fff" />
              <Text style={styles.testBtnText}>TEST BACKEND HEALTH</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Cloud API URL Configuration */}
      <View style={styles.card}>
        <Text style={styles.cardSectionTitle}>CLOUD API ENDPOINT</Text>

        <Text style={styles.inputLabel}>Public HTTPS URL</Text>
        <TextInput
          style={styles.textInput}
          value={inputUrl}
          onChangeText={setInputUrl}
          placeholder="https://..."
          placeholderTextColor="#64748b"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Save size={16} color="#fff" />
            <Text style={styles.saveBtnText}>Apply</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
            <RotateCcw size={16} color="#94a3b8" />
            <Text style={styles.resetBtnText}>Reset to Default</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Architecture Spec Info */}
      <View style={styles.card}>
        <Text style={styles.cardSectionTitle}>ARCHITECTURE</Text>
        <Text style={styles.infoText}>
          Mobile Client: Standalone React Native (Expo){'\n'}
          Protocol: HTTPS Only{'\n'}
          Backend: FastAPI Core API Server{'\n'}
          Security: AWS credentials held strictly on backend{'\n'}
          Network: Cellular (4G/5G) & Any Wi-Fi
        </Text>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070b14' },
  content: { padding: 16, paddingTop: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  headerPre: { fontSize: 10, fontWeight: '800', color: Colors.cyan, letterSpacing: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#f8fafc' },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0c1a2e',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.cyan + '40',
    marginBottom: 16,
  },
  warningText: { color: '#94a3b8', fontSize: 12, flex: 1, lineHeight: 16 },
  resultBanner: {
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
  },
  resultSuccess: { backgroundColor: '#052e16', borderColor: '#16a34a' },
  resultTimeout: { backgroundColor: '#451a03', borderColor: '#d97706' },
  resultFailed: { backgroundColor: '#450a0a', borderColor: '#dc2626' },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bannerTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  bannerSub: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  card: {
    backgroundColor: '#0d1527',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 16,
  },
  cardSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  statusGrid: { gap: 8, marginBottom: 14 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusKey: { fontSize: 12, color: '#94a3b8' },
  statusVal: { fontSize: 12, color: '#f8fafc', fontFamily: 'monospace' },
  inlineStatus: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  errorBox: {
    backgroundColor: '#1f1315',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#7f1d1d',
    marginTop: 6,
  },
  errorLabel: { fontSize: 11, fontWeight: '700', color: Colors.red, marginBottom: 2 },
  errorText: { fontSize: 11, color: '#fca5a5' },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0284c7',
    paddingVertical: 12,
    borderRadius: 8,
  },
  btnDisabled: { opacity: 0.6 },
  testBtnText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  inputLabel: { fontSize: 12, color: '#94a3b8', marginBottom: 6 },
  textInput: {
    backgroundColor: '#080d1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 12,
    color: '#f8fafc',
    fontSize: 13,
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  btnRow: { flexDirection: 'row', gap: 10 },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#10b981',
    paddingVertical: 12,
    borderRadius: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1e293b',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
  },
  resetBtnText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  infoText: { color: '#94a3b8', fontSize: 12, lineHeight: 20 },
});
