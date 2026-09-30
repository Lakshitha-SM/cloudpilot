/**
 * AuthScreen.tsx — Login / Signup with real backend auth & Demo Mode
 * Standalone Mobile Application — Zero IP configuration required.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { checkBackendHealth } from '../api/client';
import { Colors, Radius, Spacing } from '../theme/colors';

type Mode = 'login' | 'signup';

export default function AuthScreen({ navigation }: any) {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('demo@cloudpilot.ai');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);

  // Automatic connection status
  const [connectionStatus, setConnectionStatus] = useState<{
    checking: boolean;
    online: boolean;
    latencyMs?: number;
  }>({
    checking: true,
    online: false,
  });

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    setConnectionStatus((prev) => ({ ...prev, checking: true }));
    const res = await checkBackendHealth();
    setConnectionStatus({
      checking: false,
      online: res.online,
      latencyMs: res.latencyMs,
    });
  };

  const navigateToApp = () => {
    try {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' }],
      });
    } catch {
      try {
        navigation.replace('Main');
      } catch {
        try {
          navigation.replace('MainTabs');
        } catch {
          navigation.navigate('MainTabs');
        }
      }
    }
  };

  const handleDemoMode = async () => {
    setLoading(true);
    try {
      // 1. Try real login with the created demo user first if backend is reachable
      if (connectionStatus.online && typeof auth?.login === 'function') {
        try {
          await auth.login('demo@cloudpilot.ai', 'password123');
          navigateToApp();
          return;
        } catch {}
      }

      // 2. Try auth context demo helper
      if (typeof auth?.loginAsDemo === 'function') {
        try {
          await auth.loginAsDemo();
          navigateToApp();
          return;
        } catch {}
      }

      // 3. Fallback direct session write (Offline Demo)
      const demoUser = {
        id: 1,
        email: 'demo@cloudpilot.ai',
        credits: 100,
        daily_streak: 3,
        last_checkin: new Date().toISOString(),
        demo_mode: connectionStatus.online ? 'ONLINE_DEMO' : 'OFFLINE_DEMO',
      };
      await AsyncStorage.setItem('@cloudpilot:token', 'demo-session-token');
      await AsyncStorage.setItem('@cloudpilot:user', JSON.stringify(demoUser));

      navigateToApp();
    } catch (e: any) {
      navigateToApp();
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        await auth.login(email.trim(), password);
      } else {
        await auth.signup(email.trim(), password);
      }
      navigateToApp();
    } catch (e: any) {
      const isNetworkErr = e.message === 'Network Error' || e.code === 'ERR_NETWORK';
      if (isNetworkErr || !connectionStatus.online) {
        Alert.alert(
          'Server Unavailable',
          'CloudPilot server is temporarily unavailable.\n\nWould you like to continue in Offline Demo Mode or retry?',
          [
            { text: 'Retry', onPress: checkConnection },
            { text: 'Continue in Demo Mode', onPress: handleDemoMode },
          ]
        );
      } else {
        const msg = e?.response?.data?.detail || e.message || 'Authentication failed';
        Alert.alert(mode === 'login' ? 'Sign In Failed' : 'Sign Up Failed', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Logo header */}
        <View style={styles.logoArea}>
          <View style={styles.logoBox}>
            <View style={styles.cloudBase} />
            <View style={styles.cloudBump1} />
            <View style={styles.cloudBump2} />
            <View style={styles.robotEye1} />
            <View style={styles.robotEye2} />
          </View>
          <Text style={styles.appName}>CloudPilot</Text>
          <Text style={styles.appTagline}>AI Cloud Resource Management</Text>
        </View>

        {/* Automatic Backend Connection Status Pill */}
        <TouchableOpacity style={styles.serverPill} onPress={checkConnection} activeOpacity={0.8}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: connectionStatus.checking
                  ? Colors.orange
                  : connectionStatus.online
                  ? Colors.green
                  : Colors.red,
              },
            ]}
          />
          <Text style={styles.serverPillText} numberOfLines={1}>
            {connectionStatus.checking
              ? 'Checking CloudPilot connection...'
              : connectionStatus.online
              ? 'CloudPilot Connected'
              : 'Server Unavailable (Offline Ready)'}
          </Text>
          {connectionStatus.online && connectionStatus.latencyMs != null && (
            <Text style={styles.pingBadge}>{connectionStatus.latencyMs}ms</Text>
          )}
        </TouchableOpacity>

        {/* Tab switcher */}
        <View style={styles.tabRow}>
          <TouchableOpacity style={[styles.tab, mode === 'login' && styles.tabActive]} onPress={() => setMode('login')}>
            <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, mode === 'signup' && styles.tabActive]} onPress={() => setMode('signup')}>
            <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>Sign Up</Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            placeholder="demo@cloudpilot.ai"
            placeholderTextColor={Colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={Colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={submit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>
                {mode === 'login' ? 'Sign In' : 'Create Account'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Demo Mode Button with clear online/offline distinction */}
          <TouchableOpacity style={styles.demoBtn} onPress={handleDemoMode} disabled={loading}>
            <Text style={styles.demoBtnText}>
              {connectionStatus.online
                ? '⚡ Continue in Online Demo Mode'
                : '⚡ Continue in Offline Demo Mode'}
            </Text>
          </TouchableOpacity>

          {mode === 'login' && (
            <View style={styles.forgotBtn}>
              <Text style={styles.forgotText}>Demo Account: demo@cloudpilot.ai / password123</Text>
            </View>
          )}
        </View>

        <Text style={styles.footer}>
          CloudPilot AI Autonomous Resource Optimization{'\n'}
          AWS credentials remain secure on the central backend.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: Spacing.lg, justifyContent: 'center' },
  logoArea: { alignItems: 'center', marginBottom: 20 },
  logoBox: {
    width: 80, height: 70, position: 'relative',
    marginBottom: 16,
  },
  cloudBase: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 28, backgroundColor: Colors.cyan, borderRadius: 10,
  },
  cloudBump1: {
    position: 'absolute', bottom: 16, left: 8,
    width: 28, height: 28, backgroundColor: Colors.cyan, borderRadius: 14,
  },
  cloudBump2: {
    position: 'absolute', bottom: 20, right: 10,
    width: 22, height: 22, backgroundColor: Colors.cyan, borderRadius: 11,
  },
  robotEye1: {
    position: 'absolute', bottom: 8, left: 18,
    width: 7, height: 7, backgroundColor: Colors.bg, borderRadius: 4,
  },
  robotEye2: {
    position: 'absolute', bottom: 8, right: 20,
    width: 7, height: 7, backgroundColor: Colors.bg, borderRadius: 4,
  },
  appName: { fontSize: 32, fontWeight: '800', color: Colors.textPrimary, letterSpacing: 0.5 },
  appTagline: { color: Colors.textMuted, fontSize: 13, marginTop: 4 },
  serverPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0a1020', borderWidth: 1, borderColor: '#1e293b',
    borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 8,
    marginBottom: 20, gap: 8, justifyContent: 'center',
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  serverPillText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  pingBadge: { fontSize: 11, fontWeight: '700', color: Colors.greenLight },
  tabRow: {
    flexDirection: 'row', backgroundColor: Colors.bgCard,
    borderRadius: Radius.md, padding: 4, marginBottom: 20,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: Radius.sm - 2, alignItems: 'center' },
  tabActive: { backgroundColor: Colors.cyanDark },
  tabText: { color: Colors.textMuted, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  form: { gap: 6 },
  label: { color: Colors.textSecondary, fontSize: 13, marginTop: 8, marginBottom: 4 },
  input: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.md, padding: 14,
    color: Colors.textPrimary, fontSize: 15, borderWidth: 1, borderColor: Colors.bgCardBorder,
  },
  submitBtn: {
    backgroundColor: Colors.cyan, borderRadius: Radius.md,
    padding: 16, alignItems: 'center', marginTop: 16,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  demoBtn: {
    marginTop: 12, padding: 14, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.cyan + '60',
    backgroundColor: Colors.cyan + '10', alignItems: 'center',
  },
  demoBtnText: { color: Colors.cyan, fontSize: 14, fontWeight: '700' },
  forgotBtn: { alignItems: 'center', marginTop: 14 },
  forgotText: { color: Colors.textMuted, fontSize: 12 },
  footer: { textAlign: 'center', color: Colors.textMuted, fontSize: 11, marginTop: 24, lineHeight: 17 },
});
