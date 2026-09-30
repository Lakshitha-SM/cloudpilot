/**
 * SplashScreen.tsx — Professional animated CloudPilot splash
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { Colors } from '../theme/colors';

const { width } = Dimensions.get('window');

export default function SplashScreen({ navigation }: any) {
  const logoScale  = useRef(new Animated.Value(0.3)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const subtitleY   = useRef(new Animated.Value(20)).current;
  const dot1Opacity = useRef(new Animated.Value(0.2)).current;
  const dot2Opacity = useRef(new Animated.Value(0.2)).current;
  const dot3Opacity = useRef(new Animated.Value(0.2)).current;

  useEffect(() => {
    Animated.sequence([
      // Logo scale in
      Animated.parallel([
        Animated.spring(logoScale,  { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
      // Title fade in
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(subtitleY,   { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    ]).start();

    // Loading dots pulse
    const pulseDot = (anim: Animated.Value, delay: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.2, duration: 400, useNativeDriver: true }),
        ])
      ).start();
    };
    pulseDot(dot1Opacity, 0);
    pulseDot(dot2Opacity, 200);
    pulseDot(dot3Opacity, 400);

    const timer = setTimeout(() => navigation.replace('Auth'), 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      {/* Background grid lines */}
      <View style={styles.gridOverlay} />

      {/* Logo */}
      <Animated.View style={[styles.logoWrapper, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
        <View style={styles.logoOuter}>
          <View style={styles.logoInner}>
            {/* Cloud shape using boxes */}
            <View style={styles.cloudBase} />
            <View style={styles.cloudBump1} />
            <View style={styles.cloudBump2} />
            {/* Robot eyes */}
            <View style={styles.robotEye1} />
            <View style={styles.robotEye2} />
          </View>
        </View>
      </Animated.View>

      {/* Text */}
      <Animated.View style={{ opacity: textOpacity, transform: [{ translateY: subtitleY }] }}>
        <Text style={styles.title}>CloudPilot</Text>
        <Text style={styles.subtitle}>AI-Powered Cloud Resource Management</Text>
      </Animated.View>

      {/* Loading dots */}
      <View style={styles.dotsRow}>
        <Animated.View style={[styles.dot, { opacity: dot1Opacity }]} />
        <Animated.View style={[styles.dot, { opacity: dot2Opacity }]} />
        <Animated.View style={[styles.dot, { opacity: dot3Opacity }]} />
      </View>

      {/* Version */}
      <Text style={styles.version}>v1.0.0</Text>
    </View>
  );
}

const S = StyleSheet.create;
const styles = S({
  container: {
    flex: 1, backgroundColor: Colors.bg,
    justifyContent: 'center', alignItems: 'center',
  },
  gridOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    opacity: 0.03,
  },
  logoWrapper: {
    marginBottom: 40,
  },
  logoOuter: {
    width: 110, height: 110, borderRadius: 28,
    backgroundColor: '#0d1b2e',
    borderWidth: 1.5, borderColor: Colors.cyan,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: Colors.cyan, shadowOpacity: 0.5, shadowRadius: 24, elevation: 20,
  },
  logoInner: {
    width: 70, height: 55, position: 'relative',
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
    position: 'absolute', bottom: 10, left: 16,
    width: 7, height: 7, backgroundColor: Colors.bg, borderRadius: 4,
  },
  robotEye2: {
    position: 'absolute', bottom: 10, right: 18,
    width: 7, height: 7, backgroundColor: Colors.bg, borderRadius: 4,
  },
  title: {
    fontSize: 38, fontWeight: '800', color: Colors.textPrimary,
    letterSpacing: 1, textAlign: 'center', marginBottom: 8,
  },
  subtitle: {
    fontSize: 14, color: Colors.textSecondary,
    textAlign: 'center', letterSpacing: 0.3, paddingHorizontal: 40,
  },
  dotsRow: {
    flexDirection: 'row', gap: 8, marginTop: 48,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.cyan,
  },
  version: {
    position: 'absolute', bottom: 36,
    color: Colors.textMuted, fontSize: 12,
  },
});
