import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors, radius, space } from "@/lib/theme";

type LocRow = {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  cover_image_url: string | null;
  slow_hours: unknown[] | null;
};

type OfferRow = { id: string; headline: string; discount_pct: number; expires_at: string; redemptions_count: number; max_redemptions: number };

export default function LocationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loc, setLoc] = useState<LocRow | null>(null);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !id) return;
    (async () => {
      setLoading(true);
      setErr(null);
      const { data, error } = await supabase
        .from("locations")
        .select("id, name, address, lat, lng, cover_image_url, slow_hours, organizations(name)")
        .eq("id", id)
        .single();
      if (error || !data) {
        setErr("This business could not be found.");
        setLoading(false);
        return;
      }
      setLoc(data as LocRow);
      const { data: off } = await supabase
        .from("offers")
        .select("id, headline, discount_pct, expires_at, redemptions_count, max_redemptions")
        .eq("location_id", id)
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      setOffers(
        (off ?? []).filter(
          (o: OfferRow) => o.redemptions_count < o.max_redemptions,
        ) as OfferRow[],
      );
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (err || !loc) {
    return (
      <View style={s.center}>
        <Text style={s.err}>{err ?? "Not found."}</Text>
      </View>
    );
  }

  const mapsQuery = encodeURIComponent(loc.address || loc.name);
  return (
    <ScrollView contentContainerStyle={s.body}>
      {loc.cover_image_url ? (
        <Image
          source={{ uri: loc.cover_image_url }}
          style={s.hero}
          resizeMode="cover"
        />
      ) : (
        <View style={s.heroPlaceholder}>
          <Ionicons name="storefront" size={48} color={colors.accent} />
        </View>
      )}

      <View style={s.block}>
        <View style={s.badgeRow}>
          <View style={s.badge}>
            <Ionicons name="location" size={12} color={colors.accent} />
            <Text style={s.badgeText}>On Nearby</Text>
          </View>
        </View>
        <Text style={s.title}>{loc.name}</Text>
        {loc.address ? (
          <Pressable
            style={s.row}
            onPress={() =>
              Linking.openURL(
                `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`,
              )
            }
          >
            <Ionicons name="location-outline" size={18} color={colors.accent} />
            <Text style={s.linkText}>{loc.address}</Text>
          </Pressable>
        ) : null}
      </View>

      {offers.length > 0 && (
        <View style={s.block}>
          <Text style={s.section}>Live offers</Text>
          {offers.map((o) => (
            <Pressable
              key={o.id}
              style={s.offerLine}
              onPress={() => router.push(`/offer-claim/${o.id}` as any)}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.offerHeadline}>{o.headline}</Text>
                <Text style={s.offerMeta}>
                  {o.discount_pct}% off · through{" "}
                  {new Date(o.expires_at).toLocaleDateString()}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.inkSofter} />
            </Pressable>
          ))}
        </View>
      )}

      {offers.length === 0 && (
        <View style={s.empty}>
          <Text style={s.emptyText}>
            No active offers at this location right now. Check back later.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6) },
  err: { color: colors.red, textAlign: "center" },
  body: { paddingBottom: space(10) },
  hero: { width: "100%" as any, height: 200, backgroundColor: colors.bg },
  heroPlaceholder: {
    width: "100%" as any,
    height: 180,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  block: { padding: space(4), gap: space(2) },
  title: { color: colors.ink, fontSize: 24, fontWeight: "800" },
  badgeRow: { marginBottom: space(1) },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: space(2.5),
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  badgeText: { color: colors.accent, fontSize: 12, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "flex-start", gap: space(2), marginTop: space(1) },
  linkText: { color: colors.accent, fontSize: 15, flex: 1, lineHeight: 20 },
  section: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  offerLine: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space(3),
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  offerHeadline: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  offerMeta: { color: colors.inkSofter, fontSize: 13, marginTop: 2 },
  empty: { padding: space(4) },
  emptyText: { color: colors.inkSofter, fontSize: 14, lineHeight: 20 },
});
