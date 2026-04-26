import { useEffect, useMemo, useState } from "react";
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
import {
  type Place,
  getPlaceDetails,
  getPlacePhotoUrl,
  formatType,
  generateOffer,
} from "@/lib/places";
import { supabase } from "@/lib/supabase";
import ClaimModal from "@/components/ClaimModal";
import { colors, radius, space } from "@/lib/theme";

export default function BusinessDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [place, setPlace] = useState<Place | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claimOffer, setClaimOffer] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    if (!id) return;
    getPlaceDetails(String(id))
      .then(setPlace)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load."),
      );
  }, [id]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setIsLoggedIn(!!data.session);
    });
  }, []);

  const offers = useMemo(() => {
    if (!place) return [];
    const t = place.primaryType;
    return [generateOffer(t), generateOffer(t)].filter(
      (v, i, a) => a.indexOf(v) === i,
    );
  }, [place]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.red }}>{error}</Text>
      </View>
    );
  }

  if (!place) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const hours = place.regularOpeningHours ?? place.currentOpeningHours;
  const isOpen = (place.currentOpeningHours ?? place.regularOpeningHours)
    ?.openNow;
  const photoUrl = place.photos?.[0]?.name
    ? getPlacePhotoUrl(place.photos[0].name, 800)
    : null;

  const today = new Date().getDay();
  const dayIndex = today === 0 ? 6 : today - 1;

  return (
    <>
      <ScrollView
        contentContainerStyle={{ paddingBottom: space(10) }}
        style={{ flex: 1 }}
      >
        {photoUrl && (
          <Image
            source={{ uri: photoUrl }}
            style={styles.headerPhoto}
            resizeMode="cover"
          />
        )}

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{place.displayName.text}</Text>
              <View style={styles.metaRow}>
                <View style={styles.typePill}>
                  <Text style={styles.typePillText}>
                    {formatType(place.primaryType)}
                  </Text>
                </View>
                {isOpen !== undefined && (
                  <Text style={isOpen ? styles.openBadge : styles.closedBadge}>
                    {isOpen ? "Open now" : "Closed"}
                  </Text>
                )}
              </View>
            </View>
            {place.rating != null && (
              <View style={styles.ratingBox}>
                <Text style={styles.ratingBig}>{place.rating.toFixed(1)}</Text>
                <View style={styles.starsRow}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Ionicons
                      key={i}
                      name={
                        i < Math.round(place.rating ?? 0) ? "star" : "star-outline"
                      }
                      size={12}
                      color="#F59E0B"
                    />
                  ))}
                </View>
                {place.userRatingCount != null && (
                  <Text style={styles.reviewCount}>
                    {place.userRatingCount} reviews
                  </Text>
                )}
              </View>
            )}
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons
                name="information-circle-outline"
                size={18}
                color={colors.accent}
              />
              <Text style={styles.cardTitle}>Info</Text>
            </View>

            <InfoRow icon="location-outline" text={place.formattedAddress} />

            {place.nationalPhoneNumber && (
              <Pressable
                onPress={() =>
                  Linking.openURL(
                    `tel:${place.nationalPhoneNumber!.replace(/\D/g, "")}`,
                  )
                }
              >
                <InfoRow
                  icon="call-outline"
                  text={place.nationalPhoneNumber}
                  tint={colors.accent}
                />
              </Pressable>
            )}

            {place.websiteUri && (
              <Pressable
                onPress={() => Linking.openURL(place.websiteUri!)}
              >
                <InfoRow
                  icon="globe-outline"
                  text={(() => { try { return new URL(place.websiteUri!).hostname.replace(/^www\./, ""); } catch { return place.websiteUri!; } })()}
                  tint={colors.accent}
                />
              </Pressable>
            )}
          </View>

          {hours?.weekdayDescriptions && hours.weekdayDescriptions.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons
                  name="time-outline"
                  size={18}
                  color={colors.accent}
                />
                <Text style={styles.cardTitle}>Hours</Text>
              </View>
              {hours.weekdayDescriptions.map((line, i) => (
                <Text
                  key={i}
                  style={[
                    styles.hoursLine,
                    i === dayIndex && styles.hoursToday,
                  ]}
                >
                  {line}
                </Text>
              ))}
            </View>
          )}

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons
                name="pricetag-outline"
                size={18}
                color={colors.accent}
              />
              <Text style={styles.cardTitle}>Available offers</Text>
            </View>
            {offers.map((offer, i) => (
              <View key={i} style={styles.offerItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.offerHeadline}>{offer}</Text>
                  <Text style={styles.offerSub}>
                    At {place.displayName.text}
                  </Text>
                </View>
                <Pressable
                  style={styles.claimBtn}
                  onPress={() => setClaimOffer(offer)}
                >
                  <Text style={styles.claimBtnText}>Claim</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <ClaimModal
        visible={claimOffer !== null}
        onClose={() => setClaimOffer(null)}
        businessName={place.displayName.text}
        offerHeadline={claimOffer ?? ""}
        isLoggedIn={isLoggedIn}
      />
    </>
  );
}

function InfoRow({
  icon,
  text,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  tint?: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color={tint ?? colors.inkSoft} />
      <Text style={[styles.infoText, tint ? { color: tint } : undefined]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerPhoto: { width: "100%", height: 220 },
  body: { padding: space(4), gap: space(4) },
  titleRow: { flexDirection: "row", gap: space(3) },
  name: { color: colors.ink, fontSize: 24, fontWeight: "800" },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
    marginTop: space(1),
  },
  typePill: {
    backgroundColor: colors.accentSoft,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
    borderRadius: radius.pill,
  },
  typePillText: { color: colors.accent, fontSize: 11, fontWeight: "600" },
  openBadge: { color: colors.green, fontSize: 12, fontWeight: "700" },
  closedBadge: { color: colors.red, fontSize: 12, fontWeight: "700" },
  ratingBox: { alignItems: "center", gap: 2 },
  ratingBig: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  starsRow: { flexDirection: "row", gap: 1 },
  reviewCount: { color: colors.inkSofter, fontSize: 10 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space(4),
    gap: space(2),
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: space(2) },
  cardTitle: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space(2),
    paddingVertical: space(1),
  },
  infoText: { color: colors.inkSoft, fontSize: 14, flex: 1 },
  hoursLine: { color: colors.inkSoft, fontSize: 13, paddingVertical: 2 },
  hoursToday: { color: colors.ink, fontWeight: "700" },
  offerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    paddingVertical: space(2),
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  offerHeadline: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  offerSub: { color: colors.inkSofter, fontSize: 12, marginTop: 2 },
  claimBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: space(4),
    paddingVertical: space(2),
    borderRadius: radius.pill,
  },
  claimBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
