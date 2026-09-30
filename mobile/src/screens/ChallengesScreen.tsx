/**
 * ChallengesScreen.tsx — Daily Technical Challenges & Credit Rewards
 * Backed by SQLite user_challenges & credits_history backend transactions.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, RefreshControl
} from 'react-native';
import {
  ArrowLeft, Award, CheckCircle2, TrendingUp,
  Server, FlaskConical, BookOpen, Target, Zap, RefreshCw, Lock
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { mobileApi, normalizeError } from '../api/client';
import { Colors } from '../theme/colors';

const ICON_MAP: Record<string, any> = {
  ch_pipeline: Zap,
  ch_resources: Server,
  ch_prediction: TrendingUp,
  ch_cloudwatch: ActivityIndicator,
  ch_aprda: Target,
  ch_lab: FlaskConical,
};

export default function ChallengesScreen({ navigation }: any) {
  const { user, refreshUser } = useAuth();
  const [challenges, setChallenges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const fetchChallenges = useCallback(async () => {
    const userId = user?.id || 1;
    try {
      const res = await mobileApi.challenges(userId);
      setChallenges(res.data.challenges || []);
    } catch {
      // Fallback display if offline
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchChallenges();
  }, [fetchChallenges]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchChallenges();
    await refreshUser();
    setRefreshing(false);
  };

  const claimReward = async (ch: any) => {
    if (ch.claimed || claimingId) return;

    setClaimingId(ch.id);
    const userId = user?.id || 1;
    try {
      const res = await mobileApi.claimChallenge(userId, ch.id);
      await refreshUser();
      await fetchChallenges();
      Alert.alert(
        '🏆 Reward Claimed!',
        `+${res.data.reward} CloudPilot Credits added to your backend account!\nNew Balance: ${res.data.new_credits}`
      );
    } catch (e: any) {
      Alert.alert('Notice', normalizeError(e).userMessage);
    } finally {
      setClaimingId(null);
    }
  };

  const userCredits = user?.credits ?? 120;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerPre}>MISSION CONTROL</Text>
          <Text style={styles.headerTitle}>Daily Challenges</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.reloadBtn}>
          <RefreshCw size={16} color={Colors.cyan} />
        </TouchableOpacity>
      </View>

      {/* Credit Balance Hub */}
      <View style={styles.balanceCard}>
        <View style={styles.balanceLeft}>
          <Text style={styles.balanceLabel}>CURRENT BALANCE</Text>
          <Text style={styles.balanceNum}>{userCredits} Credits</Text>
        </View>
        <View style={styles.balanceIconCircle}>
          <Zap size={22} color={Colors.cyan} />
        </View>
      </View>

      <Text style={styles.sectionTitle}>AVAILABLE MISSIONS</Text>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={Colors.cyan} />
        </View>
      ) : (
        challenges.map((ch) => {
          const Icon = ICON_MAP[ch.id] || Target;
          const isClaimed = ch.claimed;
          const isCompleted = ch.completed;
          const isClaiming = claimingId === ch.id;

          return (
            <View key={ch.id} style={[styles.card, isClaimed && styles.cardClaimed]}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, { backgroundColor: isClaimed ? '#1e293b' : 'rgba(6, 182, 212, 0.15)' }]}>
                  <Icon size={18} color={isClaimed ? '#64748b' : Colors.cyan} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, isClaimed && styles.textMuted]}>{ch.title}</Text>
                  <Text style={styles.cardDesc}>{ch.desc}</Text>
                </View>
              </View>

              <View style={styles.cardFooter}>
                <View style={styles.rewardTag}>
                  <Zap size={12} color={Colors.cyan} />
                  <Text style={styles.rewardText}>+{ch.reward} Credits</Text>
                </View>

                {isClaimed ? (
                  <View style={styles.claimedPill}>
                    <CheckCircle2 size={12} color={Colors.greenLight} />
                    <Text style={styles.claimedText}>CLAIMED</Text>
                  </View>
                ) : isCompleted ? (
                  <TouchableOpacity
                    style={[styles.claimBtn, isClaiming && styles.btnDisabled]}
                    onPress={() => claimReward(ch)}
                    disabled={isClaiming}
                  >
                    {isClaiming ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.claimBtnText}>Claim +{ch.reward}</Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => navigation.navigate(ch.screen || 'Dashboard')}
                  >
                    <Text style={styles.actionBtnText}>Start Mission</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070b14' },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#1e293b' },
  reloadBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#1e293b' },
  headerPre: { fontSize: 10, fontWeight: '800', color: Colors.cyan, letterSpacing: 0.8 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  balanceCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0c1527', borderRadius: 14, borderWidth: 1, borderColor: '#1e293b', padding: 16, marginBottom: 16 },
  balanceLeft: { gap: 4 },
  balanceLabel: { fontSize: 10, fontWeight: '800', color: '#64748b', letterSpacing: 0.6 },
  balanceNum: { fontSize: 24, fontWeight: '900', color: '#fff' },
  balanceIconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(6, 182, 212, 0.15)', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#94a3b8', letterSpacing: 0.8, marginBottom: 12 },
  loadingBox: { padding: 40, alignItems: 'center' },
  card: { backgroundColor: '#0c1527', borderRadius: 14, borderWidth: 1, borderColor: '#1e293b', padding: 14, marginBottom: 12 },
  cardClaimed: { opacity: 0.65 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  iconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#fff' },
  textMuted: { color: '#94a3b8' },
  cardDesc: { fontSize: 11, color: '#64748b', marginTop: 2, lineHeight: 16 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#1e293b' },
  rewardTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rewardText: { fontSize: 12, fontWeight: '800', color: Colors.cyan },
  claimedPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#064e3b', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, gap: 4 },
  claimedText: { fontSize: 10, fontWeight: '800', color: Colors.greenLight },
  claimBtn: { backgroundColor: Colors.blue, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6 },
  claimBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  actionBtn: { backgroundColor: '#1e293b', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  actionBtnText: { color: '#cbd5e1', fontSize: 11, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
});
