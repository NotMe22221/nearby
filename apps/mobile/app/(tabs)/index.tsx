import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { router } from "expo-router";
import {
  type Place,
  searchNearbyBusinesses,
  formatType,
  generateOffer,
  distanceMiles,
  getPlacePhotoUrl,
} from "@/lib/places";
import { colors, radius, space } from "@/lib/theme";

type Coords = { lat: number; lng: number };

export default function NearbyScreen() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [permError, setPermError] = useState<string | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acquire = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setPermError(
        "Location permission denied. Enable it in Settings to discover places nearby.",
      );
      setLoading(false);
      return null;
    }
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    setCoords(c);
    return c;
  }, []);

  const load = useCallback(async (c: Coords) => {
    setError(null);
    try {
      const results = await searchNearbyBusinesses(c.lat, c.lng, 5000);
      setPlaces(results);
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Failed to load nearby places.",
      );
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const c = await acquire();
      if (c) await load(c);
      setLoading(false);
    })();
  }, [acquire, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const c = coords ?? (await acquire());
    if (c) await load(c);
    setRefreshing(false);
  }, [coords, acquire, load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.muted}>Discovering places near you…</Text>
      </View>
    );
  }

  if (permError) {
    return (
      <ScrollView
        contentContainerStyle={styles.center}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.emptyIcon}>
          <Ionicons name="location-outline" size={36} color={colors.accent} />
        </View>
        <Text style={styles.emptyTitle}>Location is off</Text>
        <Text style={styles.emptyBody}>{permError}</Text>
        <Pressable style={styles.btn} onPress={onRefresh}>
          <Text style={styles.btnText}>Try again</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (error) {
    return (
      <ScrollView
        contentContainerStyle={styles.center}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.emptyIcon}>
          <Ionicons
            name="cloud-offline-outline"
            size={36}
            color={colors.red}
          />
        </View>
        <Text style={styles.emptyTitle}>Couldn't load places</Text>
        <Text style={styles.emptyBody}>{error}</Text>
        <Pressable style={styles.btn} onPress={onRefresh}>
          <Text style={styles.btnText}>Retry</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (places.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.center}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.emptyIcon}>
          <Ionicons name="storefront-outline" size={36} color={colors.accent} />
        </View>
        <Text style={styles.emptyTitle}>No businesses found nearby</Text>
        <Text style={styles.emptyBody}>
          We couldn't find businesses within 5 km. Try again from a different
          location.
        </Text>
        <Pressable style={styles.btn} onPress={onRefresh}>
          <Text style={styles.btnText}>Refresh</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: space(4), gap: space(3) }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {places.map((place) => (
        <BusinessCard key={place.id} place={place} userCoords={coords} />
      ))}
    </ScrollView>
  );
}

function BusinessCard({
  place,
  userCoords,
}: {
  place: Place;
  userCoords: Coords | null;
}) {
  const dist = userCoords
    ? distanceMiles(
        userCoords.lat,
        userCoords.lng,
        place.location.latitude,
        place.location.longitude,
      )
    : null;

  const offer = useMemo(() => generateOffer(place.primaryType), [place.primaryType]);
  const hours = place.currentOpeningHours ?? place.regularOpeningHours;
  const isOpen = hours?.openNow;
  const photoUrl =
    place.photos?.[0]?.name
      ? getPlacePhotoUrl(place.photos[0].name, 400)
      : null;

  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push(`/business/${place.id}`)}
    >
      {photoUrl && (
        <Image
          source={{ uri: photoUrl }}
          style={styles.cardPhoto}
          resizeMode="cover"
        />
      )}
      <View style={styles.cardContent}>
        <View style={styles.cardRow}>
          <Text style={styles.cardName} numberOfLines={1}>
            {place.displayName.text}
          </Text>
          {dist !== null && (
            <Text style={styles.cardDistance}>{dist.toFixed(1)} mi</Text>
          )}
        </View>

        <View style={styles.cardMeta}>
          <View style={styles.typePill}>
            <Text style={styles.typePillText}>
              {formatType(place.primaryType)}
            </Text>
          </View>
          {place.rating != null && (
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={12} color="#F59E0B" />
              <Text style={styles.ratingText}>
                {place.rating.toFixed(1)}
                {place.userRatingCount != null && (
                  <Text style={styles.ratingCount}>
                    {" "}
                    ({place.userRatingCount})
                  </Text>
                )}
              </Text>
            </View>
          )}
          {isOpen !== undefined && (
            <Text style={isOpen ? styles.openBadge : styles.closedBadge}>
              {isOpen ? "Open" : "Closed"}
            </Text>
          )}
        </View>

        <Text style={styles.cardAddress} numberOfLines={1}>
          {place.formattedAddress}
        </Text>

        <View style={styles.offerRow}>
          <Ionicons name="pricetag" size={14} color={colors.accent} />
          <Text style={styles.offerText}>{offer}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space(6),
    gap: space(3),
  },
  muted: { color: colors.inkSoft, textAlign: "center" },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space(2),
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyBody: {
    color: colors.inkSoft,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: space(4),
  },
  btn: {
    backgroundColor: colors.accent,
    paddingVertical: space(2.5),
    paddingHorizontal: space(5),
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
  },
  btnText: { color: "white", fontWeight: "600" },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  cardPhoto: {
    width: "100%",
    height: 140,
  },
  cardContent: {
    padding: space(4),
    gap: space(2),
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardName: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
    flex: 1,
    marginRight: space(2),
  },
  cardDistance: { color: colors.inkSofter, fontSize: 12, flexShrink: 0 },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
    flexWrap: "wrap",
  },
  typePill: {
    backgroundColor: colors.accentSoft,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
    borderRadius: radius.pill,
  },
  typePillText: { color: colors.accent, fontSize: 11, fontWeight: "600" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  ratingText: { color: colors.ink, fontSize: 12, fontWeight: "600" },
  ratingCount: { color: colors.inkSofter, fontWeight: "400" },
  openBadge: {
    color: colors.green,
    fontSize: 11,
    fontWeight: "700",
  },
  closedBadge: {
    color: colors.red,
    fontSize: 11,
    fontWeight: "700",
  },
  cardAddress: { color: colors.inkSoft, fontSize: 13 },
  offerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
    backgroundColor: colors.accentSoft,
    padding: space(2.5),
    borderRadius: radius.md,
    marginTop: space(1),
  },
  offerText: { color: colors.accent, fontSize: 13, fontWeight: "600", flex: 1 },
});
