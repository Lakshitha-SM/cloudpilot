/**
 * ProfileScreen.tsx — User Profile, Account Management, Developer Settings & Diagnostics
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Modal, TextInput
} from 'react-native';
import { 
  User as UserIcon, Shield, History, Gift, 
  Activity, Sliders, Info, LogOut, ChevronRight,
  Code, Zap, Flame, CheckCircle2, ChevronDown
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { getActiveApiUrl, setActiveApiUrl, checkBackendHealth } from '../api/client';
import { Colors, Radius, Spacing } from '../theme/colors';

function MenuItem({ 
  icon: Icon, 
  label, 
  onPress, 
  danger = false, 
  badge,
  iconColor = Colors.cyan 
}: any) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={[styles.menuIconBox, { backgroundColor: iconColor + '18' }]}>
        <Icon size={16} color={danger ? Colors.red : iconColor} />
      </View>
      <Text style={[styles.menuLabel, danger && { color: Colors.red }]}>{label}</Text>
      {badge ? (
        <View style={styles.menuBadge}>
          <Text style={styles.menuBadgeText}>{badge}</Text>
        </View>
      ) : null}
      <ChevronRight size={16} color="#64748b" />
    </TouchableOpacity>
  );
}

export default function ProfileScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const [devModalVisible, setDevModalVisible] = useState(false);
  const [apiUrl, setApiUrl] = useState(getActiveApiUrl());
  const [testingPing, setTestingPing] = useState(false);
  const [pingResult, setPingResult] = useState<string | null>(null);

  const displayUser = user?.email || 'Guest User';
  const credits = user?.credits ?? 120;
  const streak = user?.daily_streak ?? 3;

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to end your session?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Sign Out', 
        style: 'destructive', 
        onPress: async () => {
          await logout();
          navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
        }
      },
    ]);
  };

  const testApi = async () => {
    setTestingPing(true);
    setPingResult(null);
    const res = await checkBackendHealth(apiUrl);
    setTestingPing(false);
    setPingResult(res.online ? `✅ Connected (${res.latencyMs}ms)` : `❌ ${res.error || 'Connection Failed'}`);
  };

  const saveApi = async () => {
    await setActiveApiUrl(apiUrl);
    setDevModalVisible(false);
    Alert.alert('Settings Saved', 'API Endpoint updated successfully.');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <UserIcon size={26} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.displayName}>{displayUser}</Text>
          <Text style={styles.roleText}>
            {user?.email ? 'Authenticated Cloud Engineer' : 'Guest Evaluator'}
          </Text>
        </View>
        <View style={styles.creditPill}>
          <Zap size={14} color={Colors.cyan} />
          <Text style={styles.creditPillText}>{credits}</Text>
        </View>
      </View>

      {/* Metrics Row */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <View style={styles.statTop}>
            <Flame size={16} color="#f97316" />
            <Text style={styles.statVal}>{streak} Days</Text>
          </View>
          <Text style={styles.statLbl}>Daily Streak</Text>
        </View>
        <View style={styles.statBox}>
          <View style={styles.statTop}>
            <Zap size={16} color={Colors.purple} />
            <Text style={styles.statVal}>{credits}</Text>
          </View>
          <Text style={styles.statLbl}>Tokens & Credits</Text>
        </View>
      </View>

      {/* Section: Account */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ACCOUNT & ACTIVITY</Text>
        <View style={styles.menuCard}>
          <MenuItem 
            icon={History} 
            label="Allocation History" 
            onPress={() => navigation.navigate('History')} 
            iconColor={Colors.blue}
          />
          <MenuItem 
            icon={Gift} 
            label="Rewards & Daily Streak" 
            onPress={() => navigation.navigate('Rewards')} 
            badge="Claim Daily"
            iconColor={Colors.purple}
          />
          <MenuItem 
            icon={Shield} 
            label="Security & Session" 
            onPress={() => Alert.alert('Security', 'Your session token is encrypted and stored in device secure storage. No AWS credentials reside on this client.')} 
            iconColor={Colors.green}
          />
        </View>
      </View>

      {/* Section: System Health & Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SYSTEM & CONNECTIVITY</Text>
        <View style={styles.menuCard}>
          <MenuItem 
            icon={Activity} 
            label="System Health & Infrastructure" 
            onPress={() => navigation.navigate('SystemStatus')} 
            iconColor={Colors.cyan}
          />
          {__DEV__ && (
            <MenuItem 
              icon={Sliders} 
              label="Developer Diagnostics (Debug)" 
              onPress={() => navigation.navigate('DeveloperSettings')} 
              iconColor="#f59e0b"
            />
          )}
        </View>
      </View>
      {/* Section: About */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ABOUT</Text>
        <View style={styles.menuCard}>
          <View style={styles.aboutRow}>
            <Info size={16} color="#94a3b8" />
            <View style={{ flex: 1 }}>
              <Text style={styles.aboutTitle}>CloudPilot Mobile Control</Text>
              <Text style={styles.aboutSub}>AI-Powered Cloud Resource Optimization</Text>
            </View>
            <Text style={styles.versionBadge}>v1.0.0</Text>
          </View>
        </View>
      </View>

      {/* Logout */}
      <View style={[styles.section, { marginBottom: 30 }]}>
        <View style={styles.menuCard}>
          <MenuItem 
            icon={LogOut} 
            label="Sign Out" 
            onPress={handleLogout} 
            danger 
          />
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070b14' },
  content: { padding: Spacing.md, paddingTop: 14 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0d1527',
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    gap: 14,
    marginBottom: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  displayName: { fontSize: 16, fontWeight: '800', color: '#f8fafc' },
  roleText: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  creditPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#070f20',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.cyan + '40',
  },
  creditPillText: { fontSize: 12, fontWeight: '800', color: Colors.cyan },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statBox: {
    flex: 1,
    backgroundColor: '#0d1527',
    borderRadius: Radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statVal: { fontSize: 16, fontWeight: '800', color: '#f8fafc' },
  statLbl: { fontSize: 11, color: '#64748b', marginTop: 4 },
  section: { marginBottom: 18 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#64748b', letterSpacing: 1, marginBottom: 8 },
  menuCard: {
    backgroundColor: '#0d1527',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#1e293b',
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    gap: 12,
  },
  menuIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: '#f8fafc' },
  menuBadge: {
    backgroundColor: '#064e3b',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    marginRight: 6,
  },
  menuBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.greenLight },
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  aboutTitle: { fontSize: 13, fontWeight: '700', color: '#f8fafc' },
  aboutSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  versionBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#0d1527',
    borderRadius: Radius.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#f8fafc' },
  modalSub: { fontSize: 12, color: '#94a3b8', marginTop: 2, marginBottom: 16 },
  inputLabel: { fontSize: 11, color: '#94a3b8', marginBottom: 6 },
  textInput: {
    backgroundColor: '#070f20',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 12,
    color: '#f8fafc',
    fontSize: 13,
    marginBottom: 12,
  },
  pingResultBox: {
    backgroundColor: '#070f20',
    padding: 10,
    borderRadius: Radius.sm,
    marginBottom: 12,
  },
  pingResultText: { fontSize: 12, color: '#e2e8f0' },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  testBtn: {
    flex: 1,
    backgroundColor: '#1e293b',
    paddingVertical: 12,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  testBtnText: { color: '#e2e8f0', fontSize: 13, fontWeight: '700' },
  saveBtn: {
    flex: 1,
    backgroundColor: '#0284c7',
    paddingVertical: 12,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  closeModalBtn: { alignItems: 'center', paddingVertical: 8 },
  closeModalText: { color: '#64748b', fontSize: 13 },
});
