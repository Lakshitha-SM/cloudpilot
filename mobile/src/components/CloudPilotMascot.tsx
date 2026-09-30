/**
 * CloudPilotMascot.tsx
 * Interactive CloudPilot AI agent mascot with state-based animations.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Colors } from '../theme/colors';

export type MascotState = 
  | 'IDLE' 
  | 'MAPPING' 
  | 'PREDICTING' 
  | 'RETRIEVING' 
  | 'REASONING' 
  | 'SCORING' 
  | 'DECIDING' 
  | 'EXECUTING' 
  | 'SUCCESS' 
  | 'ERROR';

interface Props {
  state: MascotState;
  size?: number;
  showBadge?: boolean;
}

export default function CloudPilotMascot({ state = 'IDLE', size = 90, showBadge = true }: Props) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const eyeBlink = useRef(new Animated.Value(1)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Floating bounce
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -6, duration: 1200, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ])
    ).start();

    // Subtle eye blink
    const blinkInterval = setInterval(() => {
      Animated.sequence([
        Animated.timing(eyeBlink, { toValue: 0.1, duration: 120, useNativeDriver: true }),
        Animated.timing(eyeBlink, { toValue: 1, duration: 120, useNativeDriver: true }),
      ]).start();
    }, 4000);

    return () => clearInterval(blinkInterval);
  }, []);

  useEffect(() => {
    // Pulse faster or glow when active
    if (state === 'REASONING' || state === 'PREDICTING' || state === 'MAPPING' || state === 'SCORING') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [state]);

  const getStateMeta = () => {
    switch (state) {
      case 'MAPPING':
        return { color: Colors.cyan, text: 'Scanning Nodes...', ring: Colors.cyanLight };
      case 'PREDICTING':
        return { color: Colors.blue, text: 'Forecasting Workload...', ring: Colors.blueLight };
      case 'RETRIEVING':
        return { color: Colors.purple, text: 'Querying RAG Vector DB...', ring: Colors.purpleLight };
      case 'REASONING':
        return { color: '#a855f7', text: 'Synthesizing Trade-offs...', ring: '#c084fc' };
      case 'SCORING':
      case 'DECIDING':
        return { color: '#06b6d4', text: 'APRDA Multi-Factor Scoring...', ring: Colors.cyan };
      case 'EXECUTING':
        return { color: '#38bdf8', text: 'Validating AWS Resource...', ring: '#7dd3fc' };
      case 'SUCCESS':
        return { color: Colors.green, text: 'Decision Optimized', ring: Colors.greenLight };
      case 'ERROR':
        return { color: Colors.red, text: 'Execution Alert', ring: Colors.red };
      case 'IDLE':
      default:
        return { color: Colors.cyan, text: 'CloudPilot Agent Ready', ring: Colors.cyanDark };
    }
  };

  const meta = getStateMeta();
  const scale = size / 90;

  return (
    <View style={styles.container}>
      <Animated.View 
        style={[
          styles.mascotWrapper, 
          { 
            width: size, 
            height: size * 0.85,
            transform: [{ translateY: floatAnim }, { scale: pulseAnim }],
          }
        ]}
      >
        {/* Glow halo */}
        <View 
          style={[
            styles.glowHalo, 
            { 
              width: size * 1.1, 
              height: size * 0.9, 
              backgroundColor: meta.color + '22',
              borderColor: meta.ring + '40',
            }
          ]} 
        />

        {/* Cloud Head Base */}
        <View style={[styles.cloudBody, { borderColor: meta.ring }]}>
          <View style={[styles.cloudPuffLeft, { borderColor: meta.ring }]} />
          <View style={[styles.cloudPuffRight, { borderColor: meta.ring }]} />
          
          {/* Eyes */}
          <Animated.View style={[styles.eyeRow, { transform: [{ scaleY: eyeBlink }] }]}>
            <View style={[styles.eye, { backgroundColor: meta.color }]} />
            <View style={[styles.eye, { backgroundColor: meta.color }]} />
          </Animated.View>

          {/* Core HUD Light */}
          <View style={[styles.coreHud, { backgroundColor: meta.color }]} />
        </View>
      </Animated.View>

      {showBadge && (
        <View style={[styles.badge, { borderColor: meta.ring + '50' }]}>
          <View style={[styles.badgeDot, { backgroundColor: meta.color }]} />
          <Text style={[styles.badgeText, { color: meta.color }]}>{meta.text}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mascotWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  glowHalo: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1.5,
  },
  cloudBody: {
    width: 68,
    height: 44,
    backgroundColor: '#0c1a30',
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 2,
  },
  cloudPuffLeft: {
    position: 'absolute',
    top: -14,
    left: 10,
    width: 28,
    height: 28,
    backgroundColor: '#0c1a30',
    borderRadius: 14,
    borderWidth: 2,
    borderBottomWidth: 0,
    zIndex: 1,
  },
  cloudPuffRight: {
    position: 'absolute',
    top: -10,
    right: 12,
    width: 24,
    height: 24,
    backgroundColor: '#0c1a30',
    borderRadius: 12,
    borderWidth: 2,
    borderBottomWidth: 0,
    zIndex: 1,
  },
  eyeRow: {
    flexDirection: 'row',
    gap: 16,
    zIndex: 5,
    marginTop: 4,
  },
  eye: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  coreHud: {
    position: 'absolute',
    bottom: 6,
    width: 12,
    height: 3,
    borderRadius: 2,
    opacity: 0.8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0b162c',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 10,
    gap: 6,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
