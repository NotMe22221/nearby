import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { router } from "expo-router";
import {
  type Place,
  type PlaceCategoryId,
  PLACE_CATEGORY_CHIPS,
  searchNearbyBusinesses,
  placeMatchesSearchQuery,
  googleTypesForCategory,
  formatType,
  generateOffer,
  distanceMiles,
  getPlacePhotoUrl,
} from "@/lib/places";
import { supabase } from "@/lib/supabase";
import { colors, radius, space } from "@/lib/theme";

type Coords = { lat: number; lng: number };

type NearbyOffer = {
  id: string;
  headline: string;
  discount_pct: number;
  business_name: string;
  business_address: string;
  expires_at: string;
  redemption_code: string;
  distance_mi: number | null;
  location_id: string;
};

/** Merchant-created businesses on Nearby (Supabase) */
type AppBusiness = {
  id: string;
  name: string;
  address: string;
  distance_mi: number | null;
  cover_image_url: string | null;
  organization_id: string;
};

export default function NearbyScreen() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [permError, setPermError] = useState<string | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [appBusinesses, setAppBusinesses] = useState<AppBusiness[]>([]);
  const [nearbyOffers, setNearbyOffers] = useState<NearbyOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<PlaceCategoryId>("all");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

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

  const loadSupabaseFeed = useCallback(async (c: Coords) => {
    if (!supabase) return;
    try {
      const { data: locations, error: rpcErr } = await supabase.rpc("locations_nearby", {
        user_lat: c.lat,
        user_lng: c.lng,
        radius_km: 12,
      });
      if (rpcErr) {
        setAppBusinesses([]);
        setNearbyOffers([]);
        return;
      }

      if (!locations?.length) {
        setAppBusinesses([]);
        setNearbyOffers([]);
        return;
      }

      const list = locations as {
        id: string;
        name: string;
        address: string;
        distance_km: number;
        cover_image_url?: string | null;
        organization_id: string;
      }[];
      setAppBusinesses(
        list.map((l) => ({
          id: l.id,
          name: l.name,
          address: l.address,
          distance_mi: l.distance_km != null ? l.distance_km * 0.621371 : null,
          cover_image_url: l.cover_image_url ?? null,
          organization_id: l.organization_id,
        })),
      );

      const locationIds = list.map((l) => l.id);
      const locationMap = new Map<string, (typeof list)[0]>();
      list.forEach((l) => locationMap.set(l.id, l));

      const now = new Date().toISOString();
      const { data: offers } = await supabase
        .from("offers")
        .select("id, headline, discount_pct, expires_at, redemption_code, location_id, redemptions_count, max_redemptions")
        .in("location_id", locationIds)
        .gte("expires_at", now)
        .order("created_at", { ascending: false })
        .limit(20);

      if (!offers?.length) {
        setNearbyOffers([]);
        return;
      }

      const mapped: NearbyOffer[] = offers
        .filter((o: { redemptions_count: number; max_redemptions: number }) => o.redemptions_count < o.max_redemptions)
        .map((o: { id: string; headline: string; discount_pct: number; expires_at: string; redemption_code: string; location_id: string; redemptions_count: number; max_redemptions: number }) => {
          const loc = locationMap.get(o.location_id);
          const distKm = loc?.distance_km ?? null;
          return {
            id: o.id,
            headline: o.headline,
            discount_pct: o.discount_pct,
            business_name: loc?.name ?? "Local Business",
            business_address: loc?.address ?? "",
            expires_at: o.expires_at,
            redemption_code: o.redemption_code,
            distance_mi: distKm != null ? distKm * 0.621371 : null,
            location_id: o.location_id,
          };
        });
      setNearbyOffers(mapped);
    } catch {
      setAppBusinesses([]);
      setNearbyOffers([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const c = await acquire();
      if (c) {
        setCoords(c);
        await loadSupabaseFeed(c);
      }
      setLoading(false);
    })();
  }, [acquire, loadSupabaseFeed]);

  useEffect(() => {
    if (!coords) return;
    let cancel = false;
    (async () => {
      try {
        setError(null);
        const p = await searchNearbyBusinesses(
          coords.lat,
          coords.lng,
          5000,
          googleTypesForCategory(selectedCategory),
        );
        if (!cancel) setPlaces(p);
      } catch (e: unknown) {
        if (!cancel) {
          setError(
            e instanceof Error
              ? e.message
              : "Failed to load nearby places from Google.",
          );
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [coords, selectedCategory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    const c = coords ?? (await acquire());
    if (c) {
      if (!coords) setCoords(c);
      await loadSupabaseFeed(c);
      try {
        const p = await searchNearbyBusinesses(
          c.lat,
          c.lng,
          5000,
          googleTypesForCategory(selectedCategory),
        );
        setPlaces(p);
      } catch (e: unknown) {
        setError(
          e instanceof Error
            ? e.message
            : "Failed to load nearby places from Google.",
        );
      }
    }
    setRefreshing(false);
  }, [coords, acquire, loadSupabaseFeed, selectedCategory]);

  const filteredOffers = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return nearbyOffers;
    return nearbyOffers.filter(
      (o) =>
        o.headline.toLowerCase().includes(q) ||
        o.business_name.toLowerCase().includes(q) ||
        o.business_address.toLowerCase().includes(q),
    );
  }, [nearbyOffers, debouncedQuery]);

  const filteredApp = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return appBusinesses;
    return appBusinesses.filter(
      (b) =>
        b.name.toLowerCase().includes(q) || b.address.toLowerCase().includes(q),
    );
  }, [appBusinesses, debouncedQuery]);

  const filteredPlaces = useMemo(() => {
    const q = debouncedQuery.trim();
    if (!q) return places;
    return places.filter((p) => placeMatchesSearchQuery(p, q));
  }, [places, debouncedQuery]);

  const hasRaw =
    places.length > 0 || nearbyOffers.length > 0 || appBusinesses.length > 0;
  const hasFiltered =
    filteredPlaces.length > 0 ||
    filteredOffers.length > 0 ||
    filteredApp.length > 0;

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

  if (!hasRaw) {
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
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
    >
      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color={colors.inkSofter} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search offers, places, or addresses"
          placeholderTextColor={colors.inkSofter}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <Pressable
            onPress={() => {
              setSearchQuery("");
              setDebouncedQuery("");
            }}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={20} color={colors.inkSofter} />
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        style={{ flexGrow: 0 }}
        nestedScrollEnabled
      >
        {PLACE_CATEGORY_CHIPS.map((chip) => {
          const active = selectedCategory === chip.id;
          return (
            <Pressable
              key={chip.id}
              onPress={() => setSelectedCategory(chip.id)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {selectedCategory !== "all" && (
        <Text style={styles.hintInApp}>
          Category filters the Google “More places” list. In-app offers and “On
          Nearby” are still shown; use search to narrow them.
        </Text>
      )}

      {hasRaw && !hasFiltered && (
        <View style={styles.noFilterMatch}>
          <Ionicons name="search-outline" size={36} color={colors.inkSofter} />
          <Text style={styles.noFilterTitle}>No matches</Text>
          <Text style={styles.noFilterBody}>
            Try clearing search, choosing All, or a different category.
          </Text>
          <Pressable
            style={styles.btn}
            onPress={() => {
              setSearchQuery("");
              setDebouncedQuery("");
              setSelectedCategory("all");
            }}
          >
            <Text style={styles.btnText}>Reset filters</Text>
          </Pressable>
        </View>
      )}

      {filteredOffers.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Active Offers Near You</Text>
          {filteredOffers.map((offer) => (
            <NearbyOfferCard key={offer.id} offer={offer} />
          ))}
        </>
      )}

      {filteredApp.length > 0 && (
        <>
          <Text
            style={[
              styles.sectionTitle,
              filteredOffers.length > 0 ? { marginTop: space(2) } : undefined,
            ]}
          >
            On Nearby
          </Text>
          <Text style={styles.sectionSub}>
            Local businesses on the app — including yours when you are in range
          </Text>
          {filteredApp.map((b) => (
            <AppBusinessCard key={b.id} business={b} />
          ))}
        </>
      )}

      {filteredPlaces.length > 0 && (
        <Text
          style={[
            styles.sectionTitle,
            (filteredOffers.length > 0 || filteredApp.length > 0) ? { marginTop: space(2) } : undefined,
          ]}
        >
          More places (Google Maps)
        </Text>
      )}
      {filteredPlaces.map((place) => (
        <BusinessCard key={place.id} place={place} userCoords={coords} />
      ))}
    </ScrollView>
  );
}

function AppBusinessCard({ business }: { business: AppBusiness }) {
  return (
    <Pressable
      style={styles.appBizCard}
      onPress={() => router.push(`/location/${business.id}` as any)}
    >
      {business.cover_image_url ? (
        <Image
          source={{ uri: business.cover_image_url }}
          style={styles.appBizPhoto}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.appBizPhotoPlaceholder}>
          <Ionicons name="storefront" size={32} color={colors.accent} />
        </View>
      )}
      <View style={styles.appBizContent}>
        <View style={styles.cardRow}>
          <Text style={styles.cardName} numberOfLines={2}>
            {business.name}
          </Text>
          {business.distance_mi != null && (
            <Text style={styles.cardDistance}>{business.distance_mi.toFixed(1)} mi</Text>
          )}
        </View>
        <View style={styles.nearbyPill}>
          <Ionicons name="navigate" size={12} color={colors.accent} />
          <Text style={styles.nearbyPillText}>Nearby merchant</Text>
        </View>
        <Text style={styles.cardAddress} numberOfLines={2}>
          {business.address || "Address on file"}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.inkSofter} />
    </Pressable>
  );
}

function NearbyOfferCard({ offer }: { offer: NearbyOffer }) {
  return (
    <Pressable
      style={styles.offerCard}
      onPress={() =>
        router.push(`/offer-claim/${offer.id}` as any)
      }
    >
      <View style={styles.offerBadge}>
        <Text style={styles.offerBadgeText}>{offer.discount_pct}% OFF</Text>
      </View>
      <View style={styles.offerContent}>
        <Text style={styles.offerHeadline} numberOfLines={2}>{offer.headline}</Text>
        <Text style={styles.offerBusiness}>{offer.business_name}</Text>
        <View style={styles.offerMeta}>
          {offer.distance_mi != null && (
            <Text style={styles.offerDistance}>{offer.distance_mi.toFixed(1)} mi</Text>
          )}
          <Text style={styles.offerExpiry}>
            Expires {new Date(offer.expires_at).toLocaleDateString()}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.inkSofter} />
    </Pressable>
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
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
    gap: space(2),
  },
  searchIcon: { marginRight: 2 },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.ink,
    paddingVertical: space(1),
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
    paddingVertical: space(1),
  },
  chip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space(1.5),
    paddingHorizontal: space(3),
    borderRadius: radius.pill,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  hintInApp: {
    color: colors.inkSofter,
    fontSize: 12,
    lineHeight: 18,
  },
  noFilterMatch: {
    alignItems: "center",
    paddingVertical: space(4),
    gap: space(2),
  },
  noFilterTitle: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  noFilterBody: {
    color: colors.inkSofter,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
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
  sectionTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "700",
  },
  sectionSub: {
    color: colors.inkSofter,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
    marginBottom: space(1),
  },
  appBizCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    gap: 0,
  },
  appBizPhoto: { width: 100, height: 100 },
  appBizPhotoPlaceholder: {
    width: 100,
    height: 100,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  appBizContent: { flex: 1, padding: space(3), gap: space(1) },
  nearbyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: colors.accentSoft,
    paddingHorizontal: space(2),
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  nearbyPillText: { color: colors.accent, fontSize: 11, fontWeight: "600" },
  // Nearby offer cards
  offerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.accent,
    padding: space(4),
    gap: space(3),
  },
  offerBadge: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: space(2.5),
    paddingVertical: space(2),
    alignItems: "center",
    justifyContent: "center",
  },
  offerBadgeText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  offerContent: { flex: 1, gap: 2 },
  offerHeadline: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 20 },
  offerBusiness: { color: colors.inkSoft, fontSize: 13, fontWeight: "500" },
  offerMeta: { flexDirection: "row", gap: space(3), marginTop: 2 },
  offerDistance: { color: colors.inkSofter, fontSize: 12 },
  offerExpiry: { color: colors.inkSofter, fontSize: 12 },
  // Business cards
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
