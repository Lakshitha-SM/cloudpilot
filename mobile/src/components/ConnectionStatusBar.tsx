/**
 * ConnectionStatusBar.tsx
 * Real-time connection badge with pulse animations and reconnection toast.
 * States:
 *   - OFFLINE: red/orange dot
 *   - CONNECTING: yellow pulsing dot
 *   - ONLINE: green/cyan glowing dot
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Wifi, WifiOff, CheckCircle2 } from 'lucide-react-native';
import { useCloudMode } from '../context/CloudModeContext';
import { Colors } from '../theme/colors';

interface Props {
  onPress?: () => void;
}

export default function ConnectionStatusBar({ onPress }: Props) {
  const { connectionState, latencyMs, reconnectToast, dismissToast } = useCloudMode();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const toastSlide = useRef(new Animated.Value(-60)).current;

  // Pulse animation for connecting/online state
  useEffect(() => {
    if (connectionState === 'connecting') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.4, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.9, duration: 600, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [connectionState]);

  // Toast slide in/out
  useEffect(() => {
    if (reconnectToast) {
      Animated.spring(toastSlide, {
        toValue: 0,
        useNativeDriver: true,
        friction: 6,
      }).start();
    } else {
      Animated.timing(toastSlide, {
        toValue: -60,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [reconnectToast]);

  const isOnline = connectionState === 'online';
  const isConnecting = connectionState === 'connecting';
  const isOffline = connectionState === 'offline';

  const dotColor = isOnline ? Colors.green : isConnecting ? Colors.orange : Colors.red;
  const labelColor = isOnline ? Colors.greenLight : isConnecting ? Colors.orange : Colors.red;
  const labelText = isOnline ? 'ONLINE' : isConnecting ? 'CONNECTING' : 'OFFLINE';

  return (
    <View style={styles.wrapper}>
      {/* Toast Notification */}
      {reconnectToast && (
        <Animated.View style={[styles.toast, { transform: [{ translateY: toastSlide }] }]}>
          <TouchableOpacity style={styles.toastInner} onPress={dismissToast} activeOpacity={0.9}>
            <CheckCircle2 size={16} color={Colors.green} />
            <Text style={styles.toastText}>CloudPilot backend connected</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Connection Indicator Pill */}
      <TouchableOpacity
        style={[styles.container, { borderColor: dotColor + '40' }]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <Animated.View
          style={[
            styles.dot,
            { backgroundColor: dotColor, transform: [{ scale: pulseAnim }] }
          ]}
        />
        <Text style={[styles.label, { color: labelColor }]}>{labelText}</Text>
        {isOnline && latencyMs != null && (
          <Text style={styles.latency}>{latencyMs}ms</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    zIndex: 99,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0c1527',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  latency: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
  },
  toast: {
    position: 'absolute',
    top: -45,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  toastInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#064e3b',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#10b981',
    gap: 8,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 8,
  },
  toastText: {
    color: '#ecfdf5',
    fontSize: 12,
    fontWeight: '700',
  },
});
