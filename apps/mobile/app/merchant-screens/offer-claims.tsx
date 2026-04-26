import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { colors, radius, space } from "@/lib/theme";

type ClaimRow = {
  kind: "claim";
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  at: string;
};

type RedemptionRow = {
  kind: "redemption";
  id: string;
  method: string;
  customer_session_id: string;
  at: string;
};

type Row = ClaimRow | RedemptionRow;

function sortKey(r: Row): number {
  return new Date(r.at).getTime();
}

export default function OfferClaimsScreen() {
  const params = useLocalSearchParams<{ offerId: string }>();
  const offerId = Array.isArray(params.offerId) ? params.offerId[0] : params.offerId;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !offerId) {
      setLoading(false);
      return;
    }
    setErr(null);
    const [claimsRes, redeemsRes] = await Promise.all([
      supabase
        .from("offer_customer_claims")
        .select("id, name, email, phone, created_at")
        .eq("offer_id", offerId)
        .order("created_at", { ascending: false }),
      supabase
        .from("redemptions")
        .select("id, redeemed_at, method, customer_session_id")
        .eq("offer_id", offerId)
        .order("redeemed_at", { ascending: false }),
    ]);

    const e = claimsRes.error ?? redeemsRes.error;
    if (e) {
      setErr(e.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const claimRows: ClaimRow[] = (claimsRes.data ?? []).map((c) => ({
      kind: "claim" as const,
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      at: c.created_at,
    }));
    const redemptionRows: RedemptionRow[] = (redeemsRes.data ?? []).map((r) => ({
      kind: "redemption" as const,
      id: r.id,
      method: r.method,
      customer_session_id: r.customer_session_id,
      at: r.redeemed_at,
    }));

    const merged = [...claimRows, ...redemptionRows].sort(
      (a, b) => sortKey(b) - sortKey(a),
    );
    setRows(merged);
    setLoading(false);
  }, [offerId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (err) {
    return (
      <View style={s.center}>
        <Ionicons name="alert-circle-outline" size={40} color={colors.red} />
        <Text style={s.error}>{err}</Text>
        <Text style={s.muted}>
          Run migration 9_customer_claims.sql in Supabase if you see a missing table error.
        </Text>
        <Pressable style={s.retry} onPress={() => { setLoading(true); load(); }}>
          <Text style={s.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={s.content}
    >
      <Text style={s.lead}>
        Includes everyone who completed the in-app claim form (contact info) and
        every checkout redemption (code, QR, or card) that increments the offer
        counter — they are not the same list.
      </Text>
      {rows.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="people-outline" size={40} color={colors.inkSofter} />
          <Text style={s.emptyTitle}>No activity yet</Text>
          <Text style={s.muted}>
            After customers claim the offer or staff redeems at checkout, entries
            appear here.
          </Text>
        </View>
      ) : (
        rows.map((r) =>
          r.kind === "claim" ? (
            <View key={`c-${r.id}`} style={s.card}>
              <View style={s.pillRow}>
                <View style={s.pillClaim}>
                  <Text style={s.pillClaimText}>Contact sign-up</Text>
                </View>
                <Text style={s.time}>
                  {new Date(r.at).toLocaleString()}
                </Text>
              </View>
              <Text style={s.name}>
                {r.name?.trim() || "Customer"}
              </Text>
              {r.phone ? (
                <View style={s.row}>
                  <Ionicons name="call-outline" size={16} color={colors.accent} />
                  <Text style={s.contact}>{r.phone}</Text>
                </View>
              ) : null}
              {r.email ? (
                <View style={s.row}>
                  <Ionicons name="mail-outline" size={16} color={colors.inkSoft} />
                  <Text style={s.contactSmall}>{r.email}</Text>
                </View>
              ) : null}
              {!r.phone && !r.email ? (
                <Text style={s.muted}>No contact on file</Text>
              ) : null}
            </View>
          ) : (
            <View key={`r-${r.id}`} style={s.card}>
              <View style={s.pillRow}>
                <View style={s.pillRedeem}>
                  <Text style={s.pillRedeemText}>
                    Redeemed · {methodLabel(r.method)}
                  </Text>
                </View>
                <Text style={s.time}>
                  {new Date(r.at).toLocaleString()}
                </Text>
              </View>
              <Text style={s.redeemTitle}>Checkout</Text>
              <Text style={s.sessionId} numberOfLines={1}>
                Session {shortSession(r.customer_session_id)}
              </Text>
              <Text style={s.muted}>
                No contact form — this row is from a successful redemption at the register.
              </Text>
            </View>
          ),
        )
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6), gap: space(2) },
  error: { color: colors.red, textAlign: "center", fontSize: 15 },
  muted: { color: colors.inkSofter, fontSize: 13, lineHeight: 20, textAlign: "center" },
  lead: { color: colors.inkSoft, fontSize: 14, lineHeight: 20, marginBottom: space(2) },
  content: { padding: space(4), paddingBottom: space(10), gap: space(3) },
  empty: { alignItems: "center", paddingVertical: space(8), gap: space(2) },
  emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space(4),
    gap: space(2),
  },
  name: { color: colors.ink, fontSize: 16, fontWeight: "700", flex: 1 },
  time: { color: colors.inkSofter, fontSize: 11, flexShrink: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: space(2) },
  contact: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  contactSmall: { color: colors.ink, fontSize: 14, flex: 1 },
  retry: { marginTop: space(2), backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: space(2), paddingHorizontal: space(4) },
  retryText: { color: "#fff", fontWeight: "700" },
  pillRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: space(2),
    gap: space(2),
  },
  pillClaim: {
    backgroundColor: colors.accent + "18",
    paddingHorizontal: space(2),
    paddingVertical: space(1),
    borderRadius: radius.pill,
  },
  pillClaimText: { color: colors.accent, fontSize: 11, fontWeight: "700" },
  pillRedeem: {
    backgroundColor: colors.green + "22",
    paddingHorizontal: space(2),
    paddingVertical: space(1),
    borderRadius: radius.pill,
  },
  pillRedeemText: { color: colors.green, fontSize: 11, fontWeight: "700" },
  redeemTitle: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  sessionId: { color: colors.inkSoft, fontSize: 13, fontFamily: "monospace" },
});

function methodLabel(m: string): string {
  if (m === "qr") return "QR";
  if (m === "code") return "Code";
  if (m === "stripe") return "Card";
  return m;
}

function shortSession(s: string): string {
  if (!s || s.length <= 12) return s || "—";
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}
