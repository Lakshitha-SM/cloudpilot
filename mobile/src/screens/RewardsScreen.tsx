/**
 * RewardsScreen.tsx
 * CloudPilot Credits, 7-Day Streak & Premium Casino-Style Daily Spin
 *
 * Spin flow:
 *   1. Check eligibility via backend (spinStatus)
 *   2. POST to backend (dailySpin) → receives { winning_index, reward, new_credits }
 *   3. Calculate exact wheel rotation to land on winning_index
 *   4. Animate with realistic physics (accelerate → fast → decelerate → settle)
 *   5. Show result modal & update credit state
 *
 * The backend is the authoritative source for winning segment and credits.
 * Credits are only updated AFTER backend confirmation.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Animated, Easing, Modal, Dimensions, Platform,
} from 'react-native';
import {
  Zap, Flame, CheckCircle2, Gift, Award, RotateCw,
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { mobileApi, normalizeError } from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Radius, Spacing } from '../theme/colors';

const { width: SCREEN_W } = Dimensions.get('window');
const WHEEL_SIZE = Math.min(SCREEN_W - 80, 300);
const SEGMENT_COUNT = 8;
const SEGMENT_ANGLE = 360 / SEGMENT_COUNT;

const STREAK_DAYS = [
  { day: 1, reward: 20 },
  { day: 2, reward: 20 },
  { day: 3, reward: 30 },
  { day: 4, reward: 30 },
  { day: 5, reward: 50 },
  { day: 6, reward: 50 },
  { day: 7, reward: 100 },
];

// 8 segments — must match SPIN_REWARDS in backend/mobile_api.py
const WHEEL_SEGMENTS = [
  { label: '+10',     sub: 'CREDITS',    reward: 10,  color: '#0891b2', bg: '#071b2e' },
  { label: '+20',     sub: 'CREDITS',    reward: 20,  color: '#06b6d4', bg: '#062030' },
  { label: '+30',     sub: 'CREDITS',    reward: 30,  color: '#ec4899', bg: '#2a0618' },
  { label: '+50',     sub: 'CREDITS',    reward: 50,  color: '#f59e0b', bg: '#1c0f00' },
  { label: '+20',     sub: 'CREDITS',    reward: 20,  color: '#06b6d4', bg: '#062030' },
  { label: '+30',     sub: 'BONUS',      reward: 30,  color: '#8b5cf6', bg: '#150930' },
  { label: '+10',     sub: 'CREDITS',    reward: 10,  color: '#0891b2', bg: '#071b2e' },
  { label: '+50',     sub: 'JACKPOT',    reward: 50,  color: '#10b981', bg: '#012216' },
];



export default function RewardsScreen({ navigation }: any) {
  const { user, refreshUser } = useAuth();
  const [checkingEligibility, setCheckingEligibility] = useState(false);
  const [canSpin, setCanSpin] = useState(false);
  const [spinReason, setSpinReason] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState<any>(null);
  const [spinModalVisible, setSpinModalVisible] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);

  const wheelAnim = useRef(new Animated.Value(0)).current;
  const pointerAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const creditScale = useRef(new Animated.Value(1)).current;
  const winPulse = useRef(new Animated.Value(1)).current;
  const currentRotationRef = useRef(0);

  const userId = user?.id ?? 1;
  const currentCredits = user?.credits ?? 0;
  const currentStreak = user?.daily_streak ?? 0;

  // ── Idle glow animation ────────────────────────────────────────────────────
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // ── Check spin eligibility ─────────────────────────────────────────────────
  const checkSpinEligibility = useCallback(async () => {
    setCheckingEligibility(true);
    try {
      const res = await mobileApi.spinStatus(userId);
      setCanSpin(res.data.can_spin ?? false);
      setSpinReason(res.data.reason ?? null);
    } catch {
      // Backend unavailable — check local storage as fallback
      try {
        const lastSpin = await AsyncStorage.getItem('@cloudpilot:last_spin_date');
        const today = new Date().toISOString().slice(0, 10);
        setCanSpin(lastSpin !== today);
        if (lastSpin === today) setSpinReason('Daily spin already used. Come back tomorrow.');
      } catch {
        setCanSpin(true); // Assume available if we can't check
      }
    }
    setCheckingEligibility(false);
  }, [userId]);

  useEffect(() => {
    checkSpinEligibility();
  }, [checkSpinEligibility]);

  // ── Credit scale pulse ─────────────────────────────────────────────────────
  const animateCredits = () => {
    Animated.sequence([
      Animated.timing(creditScale, { toValue: 1.25, duration: 300, useNativeDriver: true }),
      Animated.timing(creditScale, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  // ── Winning segment pulse ──────────────────────────────────────────────────
  const pulseWinner = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(winPulse, { toValue: 1.1, duration: 400, useNativeDriver: true }),
        Animated.timing(winPulse, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      { iterations: 3 }
    ).start();
  };

  // ── Pointer tick ───────────────────────────────────────────────────────────
  const tickPointer = () => {
    Animated.sequence([
      Animated.timing(pointerAnim, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(pointerAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
    ]).start();
  };

  // ── Main spin handler ──────────────────────────────────────────────────────
  const handleSpin = async () => {
    if (spinning || !canSpin) return;
    setSpinning(true);

    try {
      // Step 1 — Ask backend to resolve winning segment
      const res = await mobileApi.dailySpin(userId);
      const { winning_index, reward, new_credits } = res.data;

      // Step 2 — Calculate deterministic target rotation
      // Pointer is at top (0°). Segment 0 starts at top.
      // To land segment `winning_index` under pointer:
      //   offset = winning_index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2  (center of segment)
      //   We rotate CLOCKWISE, so we need to rotate the wheel so that segment's center aligns with top.
      //   target = 360 * minSpins + (360 - offset) to bring that segment to pointer
      const MIN_SPINS = 6;
      const segmentCenter = winning_index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
      const targetOffset = (360 - segmentCenter + 360) % 360;
      const totalRotation = 360 * MIN_SPINS + targetOffset;

      // Start from current accumulated rotation to avoid visual jump
      const startRotation = currentRotationRef.current;
      const endRotation = startRotation + totalRotation;

      // Step 3 — Physics animation: slow → fast → slow → settle
      Animated.sequence([
        // Acceleration phase
        Animated.timing(wheelAnim, {
          toValue: startRotation + 360,
          duration: 700,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        // Fast spin phase
        Animated.timing(wheelAnim, {
          toValue: startRotation + totalRotation - 180,
          duration: 2200,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        // Deceleration + settle
        Animated.timing(wheelAnim, {
          toValue: endRotation,
          duration: 1800,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(async () => {
        currentRotationRef.current = endRotation % 360;

        // Update credits from backend response
        const updated = { ...user, credits: new_credits };
        try {
          await AsyncStorage.setItem('@cloudpilot:user', JSON.stringify(updated));
          await AsyncStorage.setItem('@cloudpilot:last_spin_date', new Date().toISOString().slice(0, 10));
        } catch {}
        await refreshUser();

        setHighlightIndex(winning_index);
        pulseWinner();
        setSpinResult({ reward, winning_index, label: WHEEL_SEGMENTS[winning_index]?.label, color: WHEEL_SEGMENTS[winning_index]?.color });
        setCanSpin(false);
        setSpinReason('Daily spin already used. Come back tomorrow.');
        setSpinning(false);

        // Small delay then show modal
        setTimeout(() => {
          animateCredits();
          setSpinModalVisible(true);
        }, 600);
      });

      // Tick pointer periodically during spin
      const tickInterval = setInterval(() => {
        tickPointer();
      }, 250);
      setTimeout(() => clearInterval(tickInterval), 4700 + 600);

    } catch (e: any) {
      setSpinning(false);
      const err = normalizeError(e);
      const reason = e?.response?.data?.detail;
      if (reason && (reason.includes('already') || reason.includes('tomorrow'))) {
        setCanSpin(false);
        setSpinReason('Daily spin already used. Come back tomorrow.');
        Alert.alert('Daily Spin', reason);
      } else {
        Alert.alert('Unable to Spin', err.userMessage);
      }
    }
  };

  // ── Daily Check-in ──────────────────────────────────────────────────────────
  const handleDailyCheckin = async () => {
    if (checkingIn) return;
    setCheckingIn(true);
    try {
      let reward = 20;
      let newStreak = currentStreak + 1;
      let newCredits = currentCredits + reward;

      try {
        const res = await mobileApi.dailyCheckin(userId);
        reward = res.data?.reward ?? 20;
        newStreak = res.data?.new_streak ?? newStreak;
        newCredits = res.data?.new_credits ?? newCredits;
      } catch (apiErr: any) {
        const status = apiErr?.response?.status;
        if (status === 400) {
          const detail = apiErr?.response?.data?.detail || '';
          if (detail.includes('Already') || detail.includes('already')) {
            Alert.alert('Already Claimed', 'You have already claimed today\'s check-in. Come back tomorrow!');
            setCheckingIn(false);
            return;
          }
        }
        // Offline fallback
      }

      const updatedUser = {
        ...user,
        credits: newCredits,
        daily_streak: newStreak,
        last_checkin: new Date().toISOString(),
      };
      try {
        await AsyncStorage.setItem('@cloudpilot:user', JSON.stringify(updatedUser));
      } catch {}
      await refreshUser();
      animateCredits();
      Alert.alert(
        '🎉 Daily Reward Claimed!',
        `+${reward} CloudPilot Credits added!\nCurrent streak: ${newStreak} days`
      );
    } catch (e: any) {
      Alert.alert('Check-in Error', normalizeError(e).userMessage);
    }
    setCheckingIn(false);
  };

  // ── Rotation interpolation ─────────────────────────────────────────────────
  // We use a large range so multiple spins work without resetting
  const rotateInterpolate = wheelAnim.interpolate({
    inputRange: [0, 3600],
    outputRange: ['0deg', '3600deg'],
    extrapolate: 'extend',
  });

  const pointerRotate = pointerAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-12deg', '0deg', '12deg'],
  });

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.9],
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.preTitle}>GAMIFICATION & TOKENS</Text>
          <Text style={styles.mainTitle}>Credits & Rewards</Text>
        </View>
        <View style={styles.streakPill}>
          <Flame size={16} color="#f97316" />
          <Text style={styles.streakText}>{currentStreak} Day Streak</Text>
        </View>
      </View>

      {/* ── Hero Credit Card ── */}
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>CLOUDPILOT CREDITS</Text>
        <Animated.Text style={[styles.creditNumber, { transform: [{ scale: creditScale }] }]}>
          {currentCredits}
        </Animated.Text>
        <Text style={styles.heroSub}>
          Use credits to unlock Cloud Labs and simulate complex agent pipelines.
        </Text>
      </View>

      {/* ── 7-Day Streak Timeline ── */}
      <View style={styles.sectionCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>7-Day Streak Rewards</Text>
          <Award size={16} color={Colors.cyan} />
        </View>

        <View style={styles.streakTimeline}>
          {STREAK_DAYS.map((item) => {
            const isCompleted = item.day <= currentStreak;
            const isToday = item.day === currentStreak + 1 || (currentStreak === 0 && item.day === 1);
            return (
              <View
                key={item.day}
                style={[
                  styles.streakDayBox,
                  isToday && styles.streakDayBoxActive,
                  isCompleted && !isToday && styles.streakDayBoxDone,
                ]}
              >
                <Text style={[styles.dayLabel, isToday && { color: Colors.cyan }]}>
                  D{item.day}
                </Text>
                <Text style={[styles.dayReward, isCompleted && { color: Colors.greenLight }]}>
                  +{item.reward}
                </Text>
                {isCompleted ? (
                  <CheckCircle2 size={10} color={Colors.greenLight} style={{ marginTop: 4 }} />
                ) : (
                  <View style={styles.unclaimedDot} />
                )}
              </View>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.claimBtn, checkingIn && styles.btnDisabled]}
          onPress={handleDailyCheckin}
          disabled={checkingIn}
          accessibilityLabel="Claim daily check-in reward"
        >
          <CheckCircle2 size={18} color="#fff" />
          <Text style={styles.claimBtnText}>
            {checkingIn ? 'Claiming...' : 'Claim Daily Reward'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Premium Spin Wheel ── */}
      <View style={styles.sectionCard}>
        <View style={styles.cardHeaderRow}>
          <View>
            <Text style={styles.cardTitle}>Daily Lucky Spin</Text>
            <Text style={styles.cardSub}>Spin once every 24 hours for bonus credits</Text>
          </View>
          <Gift size={18} color={Colors.purple} />
        </View>

        {/* Wheel container */}
        <View style={styles.wheelContainer}>
          {/* Glow ring */}
          <Animated.View
            style={[
              styles.glowRing,
              {
                width: WHEEL_SIZE + 24,
                height: WHEEL_SIZE + 24,
                borderRadius: (WHEEL_SIZE + 24) / 2,
                opacity: glowOpacity,
              },
            ]}
          />

          {/* Fixed pointer */}
          <Animated.View
            style={[
              styles.pointer,
              { transform: [{ rotate: pointerRotate }] },
            ]}
          >
            <View style={styles.pointerBody} />
          </Animated.View>

          {/* Spinning wheel */}
          <Animated.View
            style={[
              styles.wheel,
              {
                width: WHEEL_SIZE,
                height: WHEEL_SIZE,
                borderRadius: WHEEL_SIZE / 2,
                transform: [{ rotate: rotateInterpolate }],
              },
            ]}
            accessibilityLabel="Daily spin wheel"
          >
            {/* Segment lines (visual dividers) */}
            {WHEEL_SEGMENTS.map((seg, idx) => {
              const angle = idx * SEGMENT_ANGLE;
              const isWinner = highlightIndex === idx;
              return (
                <View
                  key={idx}
                  pointerEvents="none"
                  style={[
                    styles.wheelSegment,
                    {
                      width: WHEEL_SIZE / 2,
                      height: WHEEL_SIZE,
                      backgroundColor: isWinner ? seg.color + '35' : seg.bg,
                      borderRightColor: '#1e3a5f',
                      transform: [
                        { translateX: 0 },
                        { rotate: `${angle}deg` },
                      ],
                      transformOrigin: 'right center',
                    },
                  ]}
                >
                  <View style={[styles.segContent, { transform: [{ rotate: `${SEGMENT_ANGLE / 2}deg` }] }]}>
                    <Text style={[styles.segLabel, { color: seg.color, fontSize: WHEEL_SIZE < 250 ? 10 : 13 }]}>
                      {seg.label}
                    </Text>
                    <Text style={[styles.segSub, { color: seg.color + 'cc', fontSize: WHEEL_SIZE < 250 ? 7 : 9 }]}>
                      {seg.sub}
                    </Text>
                  </View>
                </View>
              );
            })}

            {/* Center knob */}
            <View style={[styles.centerKnob, {
              width: WHEEL_SIZE * 0.22,
              height: WHEEL_SIZE * 0.22,
              borderRadius: WHEEL_SIZE * 0.11,
            }]}>
              <Zap size={WHEEL_SIZE < 250 ? 14 : 18} color={Colors.cyan} />
            </View>
          </Animated.View>
        </View>

        {/* Spin status message */}
        {!canSpin && spinReason ? (
          <View style={styles.spinUnavailableBox}>
            <Text style={styles.spinUnavailableText}>✓ {spinReason}</Text>
          </View>
        ) : null}

        {/* Spin button */}
        <TouchableOpacity
          style={[
            styles.spinBtn,
            (spinning || !canSpin || checkingEligibility) && styles.btnDisabled,
          ]}
          onPress={handleSpin}
          disabled={spinning || !canSpin || checkingEligibility}
          accessibilityLabel={canSpin ? 'Spin for today\'s reward' : 'Spin currently unavailable'}
        >
          <RotateCw size={16} color="#fff" />
          <Text style={styles.spinBtnText}>
            {checkingEligibility ? 'Checking...' :
             spinning ? 'Spinning...' :
             canSpin ? 'SPIN NOW' : 'DAILY SPIN USED'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Result Modal ── */}
      <Modal visible={spinModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.modalCard, { transform: [{ scale: winPulse }] }]}>
            <Text style={styles.modalEmoji}>🎉</Text>
            <Text style={styles.modalTitle}>Congratulations!</Text>
            <Text style={styles.modalSub}>You won:</Text>

            <View style={[styles.prizeBox, { borderColor: (spinResult?.color || Colors.cyan) + '60' }]}>
              <Text style={[styles.prizeValue, { color: spinResult?.color || Colors.cyan }]}>
                {spinResult?.reward ? `+${spinResult.reward}` : '+0'}
              </Text>
              <Text style={styles.prizeSub}>CLOUDPILOT CREDITS</Text>
            </View>

            <Text style={styles.balanceNote}>
              New balance: {user?.credits ?? currentCredits} credits
            </Text>

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setSpinModalVisible(false)}
            >
              <Text style={styles.modalCloseText}>✓ Reward Added · Continue</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:            { flex: 1, backgroundColor: '#070b14' },
  content:              { padding: Spacing.md, paddingTop: 12 },
  header:               { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  preTitle:             { fontSize: 10, color: Colors.cyan, fontWeight: '700', letterSpacing: 1 },
  mainTitle:            { fontSize: 26, fontWeight: '800', color: '#f8fafc' },
  streakPill:           {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#431407', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1, borderColor: '#ea580c40',
  },
  streakText:           { fontSize: 11, fontWeight: '700', color: '#fed7aa' },

  heroCard:             {
    backgroundColor: '#0d1527', borderRadius: Radius.lg, padding: 24,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.cyan + '40', marginBottom: 16,
  },
  heroLabel:            { fontSize: 11, fontWeight: '800', color: Colors.cyan, letterSpacing: 1 },
  creditNumber:         { fontSize: 52, fontWeight: '900', color: '#f8fafc', marginVertical: 6 },
  heroSub:              { fontSize: 12, color: '#94a3b8', textAlign: 'center', lineHeight: 17, maxWidth: 280 },

  sectionCard:          {
    backgroundColor: '#0d1527', borderRadius: Radius.lg, padding: 16,
    borderWidth: 1, borderColor: '#1e293b', marginBottom: 16,
  },
  cardHeaderRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTitle:            { fontSize: 15, fontWeight: '800', color: '#f8fafc' },
  cardSub:              { fontSize: 11, color: '#64748b', marginTop: 2 },

  streakTimeline:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  streakDayBox:         {
    flex: 1, marginHorizontal: 2, backgroundColor: '#070f20',
    borderRadius: Radius.sm, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: '#1e293b',
  },
  streakDayBoxActive:   { borderColor: Colors.cyan, backgroundColor: '#0c223d' },
  streakDayBoxDone:     { borderColor: '#065f46', backgroundColor: '#011a11' },
  dayLabel:             { fontSize: 9, color: '#64748b', fontWeight: '700' },
  dayReward:            { fontSize: 10, color: '#94a3b8', fontWeight: '800', marginTop: 4 },
  unclaimedDot:         { width: 4, height: 4, borderRadius: 2, backgroundColor: '#334155', marginTop: 8 },

  claimBtn:             {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#0284c7', paddingVertical: 12, borderRadius: Radius.md,
  },
  btnDisabled:          { opacity: 0.5 },
  claimBtnText:         { color: '#fff', fontSize: 13, fontWeight: '700' },

  // ── Wheel ──
  wheelContainer:       {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 20, position: 'relative',
  },
  glowRing:             {
    position: 'absolute', borderWidth: 2, borderColor: Colors.cyan,
    shadowColor: Colors.cyan, shadowRadius: 16, shadowOpacity: 0.6, shadowOffset: { width: 0, height: 0 },
  },
  pointer:              {
    position: 'absolute', top: 8, zIndex: 20,
    alignItems: 'center',
  },
  pointerBody:          {
    width: 0, height: 0,
    borderLeftWidth: 10, borderRightWidth: 10, borderTopWidth: 18,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderTopColor: Colors.cyan,
    shadowColor: Colors.cyan, shadowRadius: 6, shadowOpacity: 1, shadowOffset: { width: 0, height: 0 },
  },
  wheel:                {
    backgroundColor: '#070f20', borderWidth: 3, borderColor: Colors.cyan + '80',
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  wheelSegment:         {
    position: 'absolute', top: 0, right: 0,
    alignItems: 'flex-end', justifyContent: 'center',
    borderRightWidth: 1, overflow: 'hidden',
  },
  segContent:           {
    position: 'absolute', right: 8, alignItems: 'center', justifyContent: 'center',
  },
  segLabel:             { fontWeight: '900', letterSpacing: 0.5 },
  segSub:               { fontWeight: '700', letterSpacing: 0.5 },
  centerKnob:           {
    backgroundColor: '#0d1527', borderWidth: 3, borderColor: Colors.cyan,
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
    position: 'absolute',
    shadowColor: Colors.cyan, shadowRadius: 8, shadowOpacity: 0.8, shadowOffset: { width: 0, height: 0 },
  },

  spinUnavailableBox:   {
    backgroundColor: '#064e3b20', padding: 10, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.green + '40', marginBottom: 10, alignItems: 'center',
  },
  spinUnavailableText:  { color: Colors.greenLight, fontSize: 12, fontWeight: '600', textAlign: 'center' },

  spinBtn:              {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#7c3aed', paddingVertical: 14, borderRadius: Radius.md, marginTop: 4,
  },
  spinBtnText:          { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },

  // ── Modal ──
  modalOverlay:         {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modalCard:            {
    width: '100%', backgroundColor: '#0d1527', borderRadius: Radius.lg,
    padding: 28, alignItems: 'center', borderWidth: 1, borderColor: Colors.cyan + '60',
  },
  modalEmoji:           { fontSize: 48, marginBottom: 8 },
  modalTitle:           { fontSize: 24, fontWeight: '800', color: '#f8fafc' },
  modalSub:             { fontSize: 13, color: '#94a3b8', marginTop: 4, marginBottom: 16 },
  prizeBox:             {
    backgroundColor: '#070f20', paddingHorizontal: 32, paddingVertical: 18,
    borderRadius: Radius.md, borderWidth: 2, alignItems: 'center', marginBottom: 12,
  },
  prizeValue:           { fontSize: 42, fontWeight: '900' },
  prizeSub:             { fontSize: 12, color: '#94a3b8', fontWeight: '700', letterSpacing: 1 },
  balanceNote:          { fontSize: 12, color: '#64748b', marginBottom: 16 },
  modalCloseBtn:        {
    backgroundColor: '#0284c7', paddingHorizontal: 24, paddingVertical: 14,
    borderRadius: Radius.md, width: '100%', alignItems: 'center',
  },
  modalCloseText:       { color: '#fff', fontSize: 14, fontWeight: '700' },
});
