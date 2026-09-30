/**
 * ModeSwitch.tsx
 * Cloud Environment Mode Switcher (Simulation vs AWS Read-Only)
 * Styled with premium glassmorphism and animated toggle feedback.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Shield, Cloud, Server } from 'lucide-react-native';
import { useCloudMode } from '../context/CloudModeContext';
import { Colors } from '../theme/colors';

interface Props {
  compact?: boolean;
}

export default function ModeSwitch({ compact = false }: Props) {
  const { mode, isSimulation, isAwsLive, switchModeWithPrompt } = useCloudMode();

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <TouchableOpacity
          style={[styles.compactPill, isSimulation && styles.compactPillActiveSim]}
          onPress={() => switchModeWithPrompt('simulation')}
          activeOpacity={0.8}
        >
          <Text style={[styles.compactText, isSimulation && styles.compactTextActiveSim]}>
            SIMULATION
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.compactPill, isAwsLive && styles.compactPillActiveAws]}
          onPress={() => switchModeWithPrompt('aws_live')}
          activeOpacity={0.8}
        >
          <Text style={[styles.compactText, isAwsLive && styles.compactTextActiveAws]}>
            AWS READ-ONLY
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.titleWithIcon}>
          <Cloud size={16} color={isSimulation ? Colors.cyan : '#10b981'} />
          <Text style={styles.cardTitle}>Cloud Environment</Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: isSimulation ? 'rgba(6, 182, 212, 0.12)' : 'rgba(16, 185, 129, 0.12)',
              borderColor: isSimulation ? Colors.cyan : '#10b981' }
          ]}
        >
          <Text
            style={[
              styles.statusBadgeText,
              { color: isSimulation ? Colors.cyan : '#34d399' }
            ]}
          >
            {isSimulation ? 'SIMULATION' : 'AWS READ-ONLY'}
          </Text>
        </View>
      </View>

      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.optionBtn, isSimulation && styles.optionBtnActiveSim]}
          onPress={() => switchModeWithPrompt('simulation')}
          activeOpacity={0.8}
        >
          <Server size={14} color={isSimulation ? '#fff' : '#64748b'} />
          <Text style={[styles.optionText, isSimulation && styles.optionTextActive]}>
            SIMULATION
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.optionBtn, isAwsLive && styles.optionBtnActiveAws]}
          onPress={() => switchModeWithPrompt('aws_live')}
          activeOpacity={0.8}
        >
          <Shield size={14} color={isAwsLive ? '#fff' : '#64748b'} />
          <Text style={[styles.optionText, isAwsLive && styles.optionTextActive]}>
            AWS LIVE
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subtext}>
        {isSimulation
          ? 'Safe Sandbox • 5 Virtual Workload Nodes • Zero AWS Cost'
          : 'Live Telemetry • EC2 describe_instances • CloudWatch Telemetry (Strictly Read-Only)'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0c1527',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 14,
    marginBottom: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#050914',
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  optionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 8,
    gap: 6,
  },
  optionBtnActiveSim: {
    backgroundColor: '#0891b2',
    shadowColor: '#06b6d4',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  optionBtnActiveAws: {
    backgroundColor: '#059669',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  optionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  optionTextActive: {
    color: '#ffffff',
  },
  subtext: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 8,
    textAlign: 'center',
  },
  compactContainer: {
    flexDirection: 'row',
    backgroundColor: '#0c1527',
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  compactPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  compactPillActiveSim: {
    backgroundColor: '#0891b2',
  },
  compactPillActiveAws: {
    backgroundColor: '#059669',
  },
  compactText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
  },
  compactTextActiveSim: {
    color: '#fff',
  },
  compactTextActiveAws: {
    color: '#fff',
  },
});
