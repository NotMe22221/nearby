import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { OfferWithMerchant } from "@city-wallet/api-client";
import { api } from "@/lib/api";
import { colors, radius, space } from "@/lib/theme";

export default function OfferDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [offer, setOffer] = useState<OfferWithMerchant | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .fetchOffer(String(id))
      .then((j) => setOffer(j.offer))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load offer."),
      );
  }, [id]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.red }}>{error}</Text>
      </View>
    );
  }
  if (!offer) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const w = offer.context_snapshot?.weather;
  const events = offer.context_snapshot?.events ?? [];

  return (
    <ScrollView contentContainerStyle={{ padding: space(4), gap: space(4) }}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>{offer.merchant_name}</Text>
        <Text style={styles.title}>{offer.headline}</Text>
        <Text style={styles.body}>{offer.generated_text}</Text>
        <View style={styles.row}>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{offer.discount_pct}% off</Text>
          </View>
          <Text style={styles.muted}>
            {offer.max_redemptions - offer.redemptions_count} of{" "}
            {offer.max_redemptions} left
          </Text>
        </View>
        {w && (
          <Text style={styles.muted}>
            {w.description} · {w.temp_c}°C
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Items</Text>
        {offer.items.map((item) => (
          <View key={item.id} style={styles.row}>
            <Text style={styles.body}>{item.name}</Text>
            <Text style={styles.muted}>${item.base_price.toFixed(2)}</Text>
          </View>
        ))}
      </View>

      {events.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.label}>Local events</Text>
          {events.slice(0, 3).map((e) => (
            <Text key={e.id} style={styles.muted}>
              · {e.name}
            </Text>
          ))}
        </View>
      )}

      <Pressable
        onPress={() => router.push(`/redeem/${offer.id}`)}
        style={styles.cta}
      >
        <Text style={styles.ctaText}>Redeem this offer</Text>
      </Pressable>

      <Text style={styles.scarcity}>{offer.scarcity_text}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space(4),
    gap: space(2),
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  title: { color: colors.ink, fontSize: 22, fontWeight: "700" },
  body: { color: colors.ink, fontSize: 14 },
  muted: { color: colors.inkSoft, fontSize: 12 },
  label: {
    color: colors.inkSoft,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pill: {
    backgroundColor: colors.accentSoft,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
    borderRadius: radius.pill,
  },
  pillText: { color: colors.accent, fontWeight: "600", fontSize: 12 },
  cta: {
    backgroundColor: colors.accent,
    paddingVertical: space(3.5),
    borderRadius: radius.pill,
    alignItems: "center",
  },
  ctaText: { color: "white", fontWeight: "700", fontSize: 16 },
  scarcity: {
    color: colors.inkSofter,
    fontSize: 12,
    textAlign: "center",
    fontStyle: "italic",
  },
});
