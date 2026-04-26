import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { colors, radius, space } from "@/lib/theme";

type Offer = {
  id: string;
  headline: string;
  discount_pct: number;
  expires_at: string;
  created_at: string;
  redemption_count: number;
  location_name: string;
};

export default function MerchantOffers() {
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: memberships } = await supabase
        .from("memberships")
        .select("organization_id")
        .eq("user_id", user.id)
        .limit(1);

      if (!memberships || memberships.length === 0) {
        setOffers([]);
        return;
      }

      const orgId = memberships[0].organization_id;

      const { data: locations } = await supabase
        .from("locations")
        .select("id, name")
        .eq("organization_id", orgId);

      if (!locations || locations.length === 0) {
        setOffers([]);
        return;
      }

      const locationMap = new Map<string, string>();
      locations.forEach((l: any) => locationMap.set(l.id, l.name));
      const locationIds = locations.map((l: any) => l.id);

      const { data: rawOffers } = await supabase
        .from("offers")
        .select("id, headline, discount_pct, expires_at, created_at, location_id")
        .in("location_id", locationIds)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!rawOffers) {
        setOffers([]);
        return;
      }

      const offerIds = rawOffers.map((o: any) => o.id);
      let redemptionCounts = new Map<string, number>();

      if (offerIds.length > 0) {
        const { data: redemptions } = await supabase
          .from("redemptions")
          .select("offer_id")
          .in("offer_id", offerIds);

        if (redemptions) {
          redemptions.forEach((r: any) => {
            redemptionCounts.set(
              r.offer_id,
              (redemptionCounts.get(r.offer_id) ?? 0) + 1,
            );
          });
        }
      }

      setOffers(
        rawOffers.map((o: any) => ({
          id: o.id,
          headline: o.headline,
          discount_pct: o.discount_pct,
          expires_at: o.expires_at,
          created_at: o.created_at,
          redemption_count: redemptionCounts.get(o.id) ?? 0,
          location_name: locationMap.get(o.location_id) ?? "Unknown",
        })),
      );
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (offers.length === 0) {
    return (
      <View style={styles.center}>
        <View style={styles.iconBubble}>
          <Ionicons name="pricetag-outline" size={48} color={colors.accent} />
        </View>
        <Text style={styles.emptyTitle}>No offers yet</Text>
        <Text style={styles.emptyBody}>
          Create offers from the web dashboard. They'll appear here once live.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {offers.map((offer) => {
        const now = new Date();
        const expires = new Date(offer.expires_at);
        const isExpired = expires < now;
        const status = isExpired ? "Expired" : "Live";

        return (
          <View key={offer.id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.cardHeader}>
                <Text style={styles.headline} numberOfLines={2}>
                  {offer.headline}
                </Text>
                <View
                  style={[
                    styles.badge,
                    isExpired ? styles.badgeExpired : styles.badgeLive,
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      isExpired
                        ? styles.badgeTextExpired
                        : styles.badgeTextLive,
                    ]}
                  >
                    {status}
                  </Text>
                </View>
              </View>
              <Text style={styles.location}>{offer.location_name}</Text>
            </View>

            <View style={styles.cardStats}>
              <View style={styles.cardStatItem}>
                <Ionicons
                  name="pricetag"
                  size={14}
                  color={colors.accent}
                />
                <Text style={styles.cardStatText}>
                  {offer.discount_pct}% off
                </Text>
              </View>
              <View style={styles.cardStatItem}>
                <Ionicons
                  name="checkmark-circle"
                  size={14}
                  color={colors.green}
                />
                <Text style={styles.cardStatText}>
                  {offer.redemption_count} redeemed
                </Text>
              </View>
              <View style={styles.cardStatItem}>
                <Ionicons
                  name="calendar-outline"
                  size={14}
                  color={colors.inkSofter}
                />
                <Text style={styles.cardStatText}>
                  {new Date(offer.created_at).toLocaleDateString()}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space(8),
    gap: space(3),
  },
  container: { padding: space(4), gap: space(3), paddingBottom: space(10) },
  iconBubble: {
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyBody: {
    color: colors.inkSoft,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  cardTop: { padding: space(4), gap: space(1) },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: space(2),
  },
  headline: {
    flex: 1,
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
  },
  badge: {
    paddingHorizontal: space(2),
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeLive: { backgroundColor: "#DCFCE7" },
  badgeExpired: { backgroundColor: "#FEE2E2" },
  badgeText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  badgeTextLive: { color: colors.green },
  badgeTextExpired: { color: colors.red },
  location: { color: colors.inkSoft, fontSize: 13 },
  cardStats: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    gap: space(4),
  },
  cardStatItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardStatText: { color: colors.inkSoft, fontSize: 12, fontWeight: "500" },
});
