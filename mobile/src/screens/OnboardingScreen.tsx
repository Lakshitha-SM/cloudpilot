/**
 * OnboardingScreen.tsx — 3-page onboarding with animated transitions
 */
import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Dimensions, TouchableOpacity,
  Animated, ScrollView, NativeScrollEvent, NativeSyntheticEvent,
} from 'react-native';
import { Colors, Spacing, Radius } from '../theme/colors';

const { width } = Dimensions.get('window');

const PAGES = [
  {
    emoji: '🧠',
    title: 'Smarter Cloud\nDecisions with AI',
    bullets: [
      'Predict workloads before they spike',
      'Analyze resources intelligently',
      'Make optimal allocation decisions',
    ],
    accent: Colors.cyan,
  },
  {
    emoji: '📡',
    title: 'Real-Time\nAWS Monitoring',
    bullets: [
      'EC2 instances & CloudWatch metrics',
      'CPU, Memory, Network, Disk',
      'Live performance dashboards',
    ],
    accent: Colors.blue,
  },
  {
    emoji: '🤖',
    title: 'Multi-Agent\nCloudPilot AI',
    bullets: [
      'Mapping → Prediction → RAG',
      'Reasoning → APRDA → Execution',
      'Full transparent decision trace',
    ],
    accent: Colors.purple,
  },
];

export default function OnboardingScreen({ navigation }: any) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const goTo = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setCurrentIndex(index);
    Animated.timing(progressAnim, { toValue: index, duration: 300, useNativeDriver: false }).start();
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    setCurrentIndex(idx);
  };

  const finish = () => navigation.replace('Auth');

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.skipBtn} onPress={finish}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <ScrollView
        ref={scrollRef}
        horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        style={{ flex: 1 }}
      >
        {PAGES.map((page, i) => (
          <View key={i} style={[styles.page, { width }]}>
            <View style={[styles.emojiCircle, { borderColor: page.accent }]}>
              <Text style={styles.emoji}>{page.emoji}</Text>
            </View>
            <Text style={[styles.pageTitle, { color: page.accent }]}>{page.title}</Text>
            <View style={styles.bulletList}>
              {page.bullets.map((b, j) => (
                <View key={j} style={styles.bulletRow}>
                  <View style={[styles.bulletDot, { backgroundColor: page.accent }]} />
                  <Text style={styles.bulletText}>{b}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Dots */}
      <View style={styles.dotsRow}>
        {PAGES.map((_, i) => (
          <TouchableOpacity key={i} onPress={() => goTo(i)}>
            <View style={[styles.dot, currentIndex === i && styles.dotActive]} />
          </TouchableOpacity>
        ))}
      </View>

      {/* CTA button */}
      <View style={styles.btnRow}>
        {currentIndex < PAGES.length - 1 ? (
          <TouchableOpacity style={styles.nextBtn} onPress={() => goTo(currentIndex + 1)}>
            <Text style={styles.nextBtnText}>Next →</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.nextBtn, styles.getStartedBtn]} onPress={finish}>
            <Text style={styles.nextBtnText}>Get Started</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  skipBtn: { position: 'absolute', top: 52, right: 24, zIndex: 10 },
  skipText: { color: Colors.textMuted, fontSize: 14 },
  page: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emojiCircle: {
    width: 120, height: 120, borderRadius: 60, borderWidth: 2,
    backgroundColor: Colors.bgCard, justifyContent: 'center', alignItems: 'center',
    marginBottom: 40,
  },
  emoji: { fontSize: 52 },
  pageTitle: { fontSize: 30, fontWeight: '800', textAlign: 'center', marginBottom: 32, lineHeight: 38 },
  bulletList: { width: '100%', gap: 14 },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bulletDot: { width: 8, height: 8, borderRadius: 4 },
  bulletText: { color: Colors.textSecondary, fontSize: 16, flex: 1 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.textMuted },
  dotActive: { width: 24, backgroundColor: Colors.cyan },
  btnRow: { paddingHorizontal: 24, paddingBottom: 48 },
  nextBtn: {
    backgroundColor: Colors.cyanDark, paddingVertical: 16,
    borderRadius: Radius.md, alignItems: 'center',
  },
  getStartedBtn: { backgroundColor: Colors.blue },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
