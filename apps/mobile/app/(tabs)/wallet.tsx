import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type {
  WalletGrantedOffer,
  WalletOrgSummary,
} from "@city-wallet/api-client";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { getSessionId } from "@/lib/session";
import { type ClaimedOffer, getClaims } from "@/lib/claims";
import { colors, radius, space } from "@/lib/theme";

const POINTS_COST = 200;

export default function WalletScreen() {
  const [orgs, setOrgs] = useState<WalletOrgSummary[]>([]);
  const [granted, setGranted] = useState<WalletGrantedOffer[]>([]);
  const [claims, setClaims] = useState<ClaimedOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstWalletLoad = useRef(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const sid = await getSessionId();
      const json = await api.fetchWallet(sid);
      setOrgs(json.orgs);
      setGranted(json.granted);
    } catch {
      // wallet endpoint may be empty; non-fatal
    }
    const localClaims = await getClaims();
    setClaims(localClaims);
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (firstWalletLoad.current) {
          setLoading(true);
          firstWalletLoad.current = false;
        }
        await load();
        setLoading(false);
      })();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function spend(orgId: string) {
    try {
      const sid = await getSessionId();
      const r = await api.spendPoints({
        session_id: sid,
        organization_id: orgId,
      });
      Alert.alert("Loyalty offer minted", `Code ${r.code}`);
      router.push(`/redeem/${r.offer_id}`);
      load();
    } catch (e: unknown) {
      Alert.alert(
        "Couldn't spend points",
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const hasAnything = claims.length > 0 || granted.length > 0 || orgs.length > 0;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: space(4), gap: space(4) }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {error && <Text style={styles.error}>{error}</Text>}

      {!hasAnything && (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="wallet-outline" size={28} color={colors.accent} />
          </View>
          <Text style={styles.emptyTitle}>Your wallet is empty</Text>
          <Text style={styles.emptyBody}>
            Claim an offer at a nearby business and it will show up here with
            your redemption code.
          </Text>
          <Pressable
            style={styles.emptyBtn}
            onPress={() => router.push("/(tabs)")}
          >
            <Ionicons name="compass-outline" size={16} color="#fff" />
            <Text style={styles.emptyBtnText}>Explore nearby</Text>
          </Pressable>
        </View>
      )}

      {claims.length > 0 && (
        <View style={{ gap: space(2) }}>
          <Text style={styles.section}>Claimed offers</Text>
          {claims.map((c) => (
            <View key={c.id} style={styles.claimCard}>
              <View style={styles.claimHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.claimBusiness}>{c.businessName}</Text>
                  <Text style={styles.claimOffer}>{c.offerHeadline}</Text>
                </View>
                <View style={styles.claimCodeBox}>
                  <Text style={styles.claimCodeLabel}>CODE</Text>
                  <Text style={styles.claimCode}>{c.code}</Text>
                </View>
              </View>
              <View style={styles.claimFooter}>
                <Ionicons
                  name="time-outline"
                  size={12}
                  color={colors.inkSofter}
                />
                <Text style={styles.claimDate}>
                  {new Date(c.claimedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
                {c.email && !c.email.includes("@placeholder") && (
                  <>
                    <Ionicons
                      name="mail-outline"
                      size={12}
                      color={colors.inkSofter}
                    />
                    <Text style={styles.claimDate}>{c.email}</Text>
                  </>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {granted.length > 0 && (
        <View style={{ gap: space(2) }}>
          <Text style={styles.section}>Loyalty offers</Text>
          {granted.map((g) => {
            const used =
              g.offer.redemptions_count >= g.offer.max_redemptions;
            const expired =
              new Date(g.offer.expires_at).getTime() < Date.now();
            return (
              <Pressable
                key={g.offer.id}
                style={styles.card}
                onPress={() =>
                  !used && !expired && router.push(`/redeem/${g.offer.id}`)
                }
              >
                <Text style={styles.cardTitle}>{g.offer.headline}</Text>
                <Text style={styles.cardMuted}>
                  {g.offer.discount_pct}% off · expires{" "}
                  {new Date(g.offer.expires_at).toLocaleString()}
                </Text>
                <Text
                  style={[
                    styles.cardMuted,
                    {
                      color:
                        used || expired ? colors.inkSofter : colors.green,
                    },
                  ]}
                >
                  {used ? "Used" : expired ? "Expired" : "Tap to redeem"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {orgs.length > 0 && (
        <View style={{ gap: space(2) }}>
          <Text style={styles.section}>Merchants</Text>
          {orgs.map((o) => (
            <View key={o.organization.id} style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.cardTitle}>{o.organization.name}</Text>
                <Text style={styles.points}>{o.points} pts</Text>
              </View>

              {o.stamps.map(({ card, stamps }) => {
                const progress =
                  ((stamps % card.stamps_required) / card.stamps_required) *
                  100;
                return (
                  <View
                    key={card.id}
                    style={{ marginTop: space(2), gap: space(1) }}
                  >
                    <View style={styles.row}>
                      <Text style={styles.cardSmall}>{card.name}</Text>
                      <Text style={styles.cardMuted}>
                        {stamps % card.stamps_required}/{card.stamps_required}
                      </Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${progress}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.cardMuted}>
                      Reward: {card.reward_text}
                    </Text>
                  </View>
                );
              })}

              <Pressable
                disabled={o.points < POINTS_COST}
                onPress={() => spend(o.organization.id)}
                style={[
                  styles.spendBtn,
                  o.points < POINTS_COST && {
                    backgroundColor: colors.inkSofter,
                  },
                ]}
              >
                <Text style={styles.btnText}>
                  Spend {POINTS_COST} pts for a perk
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space(6),
  },
  error: { color: colors.red, textAlign: "center" },
  empty: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(5),
    alignItems: "center",
    gap: space(2),
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space(1),
  },
  emptyTitle: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  emptyBody: {
    color: colors.inkSoft,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
  emptyBtn: {
    marginTop: space(2),
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space(2.5),
    paddingHorizontal: space(5),
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
  },
  emptyBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  section: {
    color: colors.inkSoft,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  claimCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(4),
    gap: space(3),
  },
  claimHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space(3),
  },
  claimBusiness: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  claimOffer: { color: colors.inkSoft, fontSize: 13, marginTop: 2 },
  claimCodeBox: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    paddingHorizontal: space(3),
    paddingVertical: space(2),
  },
  claimCodeLabel: {
    color: colors.inkSofter,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
  },
  claimCode: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: "800",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    letterSpacing: 0.5,
  },
  claimFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(1.5),
  },
  claimDate: { color: colors.inkSofter, fontSize: 11 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(4),
    gap: space(1),
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  cardSmall: { color: colors.ink, fontSize: 14 },
  cardMuted: { color: colors.inkSoft, fontSize: 12 },
  points: { color: colors.accent, fontSize: 14, fontWeight: "700" },
  progressTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  progressFill: {
    height: 8,
    backgroundColor: colors.accent,
  },
  spendBtn: {
    marginTop: space(3),
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingVertical: space(2.5),
    alignItems: "center",
  },
  btnText: { color: "white", fontWeight: "600", fontSize: 14 },
});
