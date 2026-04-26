import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { useStripe } from "@stripe/stripe-react-native";
import type { OfferWithMerchant } from "@city-wallet/api-client";
import { api } from "@/lib/api";
import { getSessionId } from "@/lib/session";
import { colors, radius, space } from "@/lib/theme";
import { apiBaseUrl } from "@/lib/config";

type Tab = "code" | "qr" | "pay";

export default function RedeemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [offer, setOffer] = useState<OfferWithMerchant | null>(null);
  const [tab, setTab] = useState<Tab>("code");
  const [sid, setSid] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .fetchOffer(String(id))
      .then((j) => setOffer(j.offer))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load offer."),
      );
    getSessionId().then(setSid);
  }, [id]);

  // Poll for redemption / count.
  useEffect(() => {
    if (!offer || !sid) return;
    let stopped = false;
    const tick = async () => {
      try {
        const checked = await api.checkRedeemed(offer.id, sid);
        if (checked.redeemed && !stopped) {
          router.replace(`/confirmed/${offer.id}`);
        }
      } catch {
        // ignored
      }
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [offer, sid]);

  const tabs: Tab[] = useMemo(
    () => (offer?.stripe_enabled ? ["code", "qr", "pay"] : ["code", "qr"]),
    [offer?.stripe_enabled],
  );

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.red }}>{error}</Text>
      </View>
    );
  }
  if (!offer || !sid) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const qrPayload = JSON.stringify({
    v: 1,
    code: offer.redemption_code,
    session: sid,
  });

  return (
    <ScrollView contentContainerStyle={{ padding: space(4), gap: space(4) }}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>{offer.merchant_name}</Text>
        <Text style={styles.title}>
          {tab === "pay" ? "Pay with Nearby" : "Show this at the register"}
        </Text>
        <Text style={styles.muted}>
          {offer.discount_pct}% off ·{" "}
          {offer.max_redemptions - offer.redemptions_count} of{" "}
          {offer.max_redemptions} left
        </Text>
      </View>

      <View style={styles.tabs}>
        {tabs.map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[styles.tab, tab === t && styles.tabActive]}
          >
            <Text
              style={[styles.tabText, tab === t && styles.tabTextActive]}
            >
              {t === "code" ? "Code" : t === "qr" ? "QR" : "Pay now"}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.card}>
        {tab === "code" && (
          <View style={{ alignItems: "center", gap: space(3) }}>
            <Text style={styles.label}>Redemption code</Text>
            <Text style={styles.code}>{offer.redemption_code}</Text>
            <Text style={styles.muted}>
              Read aloud at the register or have the merchant type it.
            </Text>
          </View>
        )}
        {tab === "qr" && (
          <View style={{ alignItems: "center", gap: space(3) }}>
            <View
              style={{
                backgroundColor: "white",
                padding: space(3),
                borderRadius: radius.md,
              }}
            >
              <QRCode value={qrPayload} size={220} />
            </View>
            <Text style={styles.muted}>
              Have the merchant scan this with the Nearby scanner.
            </Text>
          </View>
        )}
        {tab === "pay" && offer.stripe_enabled && (
          <PayTab offerId={offer.id} sessionId={sid} />
        )}
      </View>
    </ScrollView>
  );
}

function PayTab({ offerId, sessionId }: { offerId: string; sessionId: string }) {
  const stripe = useStripe();
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState<string>("usd");

  async function startPay() {
    setLoading(true);
    try {
      const intent = await api.createPaymentIntent({
        offerId,
        sessionId,
      });
      setAmount(intent.amount);
      setCurrency(intent.currency);

      const init = await stripe.initPaymentSheet({
        merchantDisplayName: "Nearby",
        paymentIntentClientSecret: intent.client_secret,
        returnURL: `${apiBaseUrl.replace(/^https?/, "citywallet")}/confirmed/${offerId}`,
      });
      if (init.error) throw new Error(init.error.message);

      const present = await stripe.presentPaymentSheet();
      if (present.error) {
        if (present.error.code !== "Canceled") {
          Alert.alert("Payment failed", present.error.message);
        }
      } else {
        router.replace(`/confirmed/${offerId}`);
      }
    } catch (e: unknown) {
      Alert.alert("Payment error", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const display =
    amount != null
      ? (amount / 100).toLocaleString(undefined, {
          style: "currency",
          currency: currency.toUpperCase(),
        })
      : null;

  return (
    <View style={{ gap: space(3), alignItems: "center" }}>
      <Text style={styles.muted}>Pay the discounted total directly here.</Text>
      {display && <Text style={styles.code}>{display}</Text>}
      <Pressable
        style={[styles.cta, loading && { opacity: 0.6 }]}
        onPress={startPay}
        disabled={loading}
      >
        <Text style={styles.ctaText}>
          {loading ? "Opening payment sheet…" : "Pay now"}
        </Text>
      </Pressable>
      <Text style={styles.muted}>
        Test mode · use 4242 4242 4242 4242 with any future date / CVC.
      </Text>
    </View>
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
  title: { color: colors.ink, fontSize: 18, fontWeight: "700" },
  muted: { color: colors.inkSoft, fontSize: 12, textAlign: "center" },
  label: {
    color: colors.inkSoft,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  code: {
    color: colors.ink,
    fontSize: 36,
    fontWeight: "700",
    fontFamily: "Menlo",
    letterSpacing: 4,
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: colors.border,
    padding: 4,
    borderRadius: radius.md,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: space(2.5),
    alignItems: "center",
    borderRadius: radius.sm,
  },
  tabActive: { backgroundColor: colors.card },
  tabText: { color: colors.inkSoft, fontWeight: "500" },
  tabTextActive: { color: colors.ink, fontWeight: "700" },
  cta: {
    backgroundColor: colors.accent,
    paddingVertical: space(3.5),
    paddingHorizontal: space(8),
    borderRadius: radius.pill,
  },
  ctaText: { color: "white", fontWeight: "700", fontSize: 16 },
});
