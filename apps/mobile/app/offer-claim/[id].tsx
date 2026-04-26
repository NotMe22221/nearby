import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { supabase } from "@/lib/supabase";
import { sendClaimEmail } from "@/lib/email";
import { saveClaim } from "@/lib/claims";
import { colors, radius, space } from "@/lib/theme";

type OfferData = {
  id: string;
  headline: string;
  discount_pct: number;
  redemption_code: string;
  expires_at: string;
  redemptions_count: number;
  max_redemptions: number;
  location_id: string;
  business_name: string;
  business_address: string;
};

export default function OfferClaimScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [offer, setOffer] = useState<OfferData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  const [claimed, setClaimed] = useState(false);
  const [claimCode, setClaimCode] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase || !id) return;

    (async () => {
      setLoading(true);
      try {
        const { data: session } = await supabase.auth.getSession();
        if (session.session) {
          setIsLoggedIn(true);
          setUserEmail(session.session.user.email ?? "");
        }

        const { data: offerRow, error: offerErr } = await supabase
          .from("offers")
          .select("id, headline, discount_pct, redemption_code, expires_at, redemptions_count, max_redemptions, location_id")
          .eq("id", id)
          .single();

        if (offerErr || !offerRow) {
          setError("Offer not found.");
          setLoading(false);
          return;
        }

        const { data: loc } = await supabase
          .from("locations")
          .select("address, organizations(name)")
          .eq("id", offerRow.location_id)
          .single();

        setOffer({
          ...offerRow,
          business_name: (loc as any)?.organizations?.name ?? "Local Business",
          business_address: (loc as any)?.address ?? "",
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load offer.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const isExpired = offer ? new Date(offer.expires_at) <= new Date() : false;
  const isFull = offer ? offer.redemptions_count >= offer.max_redemptions : false;
  const canClaim = offer && !isExpired && !isFull && !claimed;

  const handleClaim = useCallback(async () => {
    if (!offer) return;

    if (!isLoggedIn && (!name.trim() || !email.trim())) {
      Alert.alert("Missing info", "Please enter your name and email.");
      return;
    }
    if (isLoggedIn && !phone.trim()) {
      Alert.alert("Missing info", "Please enter your phone number.");
      return;
    }

    setBusy(true);
    try {
      const recipientEmail = isLoggedIn ? userEmail : email.trim();
      const recipientName = isLoggedIn
        ? (name.trim() || "Customer")
        : name.trim();
      const code = offer.redemption_code;

      if (supabase) {
        const { error: claimErr } = await supabase.rpc("register_customer_offer_claim", {
          p_offer_id: offer.id,
          p_name: recipientName,
          p_email: recipientEmail,
          p_phone: isLoggedIn ? phone.trim() : "",
        });
        if (claimErr) {
          Alert.alert("Could not save claim", claimErr.message);
          setBusy(false);
          return;
        }
      }

      await sendClaimEmail(recipientEmail, recipientName, offer.business_name, offer.headline, {
        redemptionCode: code,
      });

      await saveClaim({
        businessName: offer.business_name,
        offerHeadline: offer.headline,
        code,
        email: isLoggedIn ? phone.trim() : email.trim(),
      });

      setClaimCode(code);
      setClaimed(true);
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [offer, isLoggedIn, name, email, phone, userEmail, supabase]);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={s.muted}>Loading offer…</Text>
      </View>
    );
  }

  if (error || !offer) {
    return (
      <View style={s.center}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.red} />
        <Text style={s.errorText}>{error ?? "Offer not found."}</Text>
      </View>
    );
  }

  if (claimed) {
    return (
      <ScrollView contentContainerStyle={s.claimedContainer}>
        <View style={s.successIcon}>
          <Ionicons name="checkmark-circle" size={64} color={colors.green} />
        </View>
        <Text style={s.claimedTitle}>Offer Claimed!</Text>
        <Text style={s.claimedSub}>
          Show this QR code to the merchant to redeem your {offer.discount_pct}% discount.
        </Text>

        <View style={s.qrContainer}>
          <QRCode
            value={JSON.stringify({ code: claimCode, offerId: offer.id })}
            size={200}
            backgroundColor="#fff"
            color={colors.ink}
          />
        </View>
        <Text style={s.qrHint}>
          Merchant: scan this QR or type the code in Scanner — it matches the offer published in the dashboard.
        </Text>

        <View style={s.codeBox}>
          <Text style={s.codeLabel}>Your code</Text>
          <Text style={s.codeValue}>{claimCode}</Text>
        </View>

        <View style={s.claimedCard}>
          <Text style={s.claimedHeadline}>{offer.headline}</Text>
          <Text style={s.claimedBusiness}>{offer.business_name}</Text>
          {offer.business_address ? <Text style={s.claimedAddress}>{offer.business_address}</Text> : null}
          <Text style={s.claimedExpiry}>
            Expires {new Date(offer.expires_at).toLocaleDateString()}
          </Text>
        </View>

        <Text style={s.savedNote}>
          This offer is saved in your Wallet tab for easy access.
        </Text>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={s.body}>
        {/* Offer banner */}
        <View style={s.banner}>
          <View style={s.discountBadge}>
            <Text style={s.discountText}>{offer.discount_pct}%</Text>
            <Text style={s.discountLabel}>OFF</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headline}>{offer.headline}</Text>
            <Text style={s.business}>{offer.business_name}</Text>
          </View>
        </View>

        {/* Offer details */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
            <Text style={s.cardTitle}>Offer Details</Text>
          </View>
          {offer.business_address ? (
            <DetailRow icon="location-outline" text={offer.business_address} />
          ) : null}
          <DetailRow
            icon="time-outline"
            text={`Expires ${new Date(offer.expires_at).toLocaleDateString()} at ${new Date(offer.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
          />
          <DetailRow
            icon="people-outline"
            text={`${offer.max_redemptions - offer.redemptions_count} of ${offer.max_redemptions} redemptions remaining`}
          />
        </View>

        {/* Status alerts */}
        {isExpired && (
          <View style={[s.alertBox, { borderColor: colors.red }]}>
            <Ionicons name="time-outline" size={20} color={colors.red} />
            <Text style={[s.alertText, { color: colors.red }]}>This offer has expired.</Text>
          </View>
        )}
        {isFull && !isExpired && (
          <View style={[s.alertBox, { borderColor: colors.red }]}>
            <Ionicons name="close-circle-outline" size={20} color={colors.red} />
            <Text style={[s.alertText, { color: colors.red }]}>All redemptions have been used.</Text>
          </View>
        )}

        {/* Claim form */}
        {canClaim && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Ionicons name="hand-left-outline" size={18} color={colors.accent} />
              <Text style={s.cardTitle}>Claim This Offer</Text>
            </View>

            {isLoggedIn ? (
              <View style={s.form}>
                <Text style={s.formHint}>
                  Signed in as {userEmail}. Enter your phone number to complete the claim.
                </Text>
                <Text style={s.label}>Phone number</Text>
                <TextInput
                  style={s.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="(555) 555-1234"
                  placeholderTextColor={colors.inkSofter}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                />
              </View>
            ) : (
              <View style={s.form}>
                <Text style={s.formHint}>
                  Enter your info to claim this offer. You'll receive a confirmation email.
                </Text>
                <Text style={s.label}>Your name</Text>
                <TextInput
                  style={s.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Jane Doe"
                  placeholderTextColor={colors.inkSofter}
                  autoComplete="name"
                />
                <Text style={[s.label, { marginTop: space(3) }]}>Email</Text>
                <TextInput
                  style={s.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.inkSofter}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
              </View>
            )}

            <Pressable
              style={[s.claimBtn, busy && { opacity: 0.6 }]}
              onPress={handleClaim}
              disabled={busy}
            >
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={s.claimBtnText}>{busy ? "Claiming…" : "Claim this offer"}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function DetailRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={s.detailRow}>
      <Ionicons name={icon} size={16} color={colors.inkSoft} />
      <Text style={s.detailText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space(3) },
  muted: { color: colors.inkSoft },
  errorText: { color: colors.red, fontSize: 16, textAlign: "center", paddingHorizontal: space(6) },
  body: { padding: space(4), gap: space(4), paddingBottom: space(10) },

  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(4),
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    padding: space(4),
  },
  discountBadge: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.2)", borderRadius: radius.md, paddingHorizontal: space(3), paddingVertical: space(2) },
  discountText: { color: "#fff", fontSize: 28, fontWeight: "800" },
  discountLabel: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  headline: { color: "#fff", fontSize: 18, fontWeight: "700", lineHeight: 24 },
  business: { color: "rgba(255,255,255,0.8)", fontSize: 14, marginTop: 2 },

  card: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: space(4), gap: space(2) },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: space(2) },
  cardTitle: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: space(2), paddingVertical: space(1) },
  detailText: { color: colors.inkSoft, fontSize: 14, flex: 1, lineHeight: 20 },

  alertBox: { flexDirection: "row", alignItems: "center", gap: space(2), borderWidth: 1, borderRadius: radius.md, padding: space(3) },
  alertText: { fontSize: 14, fontWeight: "600" },

  form: { gap: space(1) },
  formHint: { color: colors.inkSoft, fontSize: 13, lineHeight: 18, marginBottom: space(2) },
  label: { color: colors.inkSoft, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(4), paddingVertical: space(3), fontSize: 16, color: colors.ink },
  claimBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: space(3.5), flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space(2), marginTop: space(2) },
  claimBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  claimedContainer: { alignItems: "center", padding: space(6), gap: space(4), paddingBottom: space(10) },
  successIcon: { marginTop: space(4) },
  claimedTitle: { color: colors.ink, fontSize: 24, fontWeight: "800" },
  claimedSub: { color: colors.inkSoft, fontSize: 15, textAlign: "center", lineHeight: 22, paddingHorizontal: space(4) },
  qrContainer: { backgroundColor: "#fff", padding: space(5), borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginVertical: space(2) },
  codeBox: { alignItems: "center", gap: space(1) },
  codeLabel: { color: colors.inkSofter, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  codeValue: { color: colors.ink, fontSize: 28, fontWeight: "800", letterSpacing: 2 },
  claimedCard: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: space(4), gap: space(1), width: "100%", alignItems: "center" },
  claimedHeadline: { color: colors.ink, fontSize: 16, fontWeight: "700", textAlign: "center" },
  claimedBusiness: { color: colors.accent, fontSize: 14, fontWeight: "600" },
  claimedAddress: { color: colors.inkSoft, fontSize: 13, textAlign: "center" },
  claimedExpiry: { color: colors.inkSofter, fontSize: 12, marginTop: space(1) },
  qrHint: { color: colors.inkSofter, fontSize: 12, textAlign: "center", lineHeight: 18, paddingHorizontal: space(4) },
  savedNote: { color: colors.inkSofter, fontSize: 13, textAlign: "center", paddingHorizontal: space(6) },
});
