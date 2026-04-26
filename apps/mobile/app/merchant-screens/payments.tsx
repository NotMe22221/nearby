import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { apiBaseUrl } from "@/lib/config";
import { resolveOrganizationId } from "@/lib/merchantOrg";
import { colors, radius, space } from "@/lib/theme";

type Payment = { id: string; amount: number; currency: string; status: string; created_at: string };

export default function PaymentsScreen() {
  const [loading, setLoading] = useState(true);
  const [stripeId, setStripeId] = useState<string | null>(null);
  const [chargesEnabled, setChargesEnabled] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [orgId, setOrgId] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const oid = await resolveOrganizationId(supabase);
    if (!oid) { setLoading(false); return; }
    setOrgId(oid);
    const { data: org } = await supabase.from("organizations").select("stripe_account_id, stripe_charges_enabled").eq("id", oid).single();
    if (org) {
      setStripeId(org.stripe_account_id ?? null);
      setChargesEnabled(!!org.stripe_charges_enabled);
    }
    const { data: pays } = await supabase.from("payments").select("*").eq("organization_id", oid).order("created_at", { ascending: false }).limit(50);
    setPayments((pays ?? []) as Payment[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>;

  return (
    <View style={s.root}>
      <View style={s.statusCard}>
        <Ionicons name={stripeId ? "card" : "card-outline"} size={32} color={stripeId ? colors.green : colors.inkSofter} />
        <View style={{ flex: 1 }}>
          <Text style={s.statusTitle}>{stripeId ? "Stripe Connected" : "Stripe Not Connected"}</Text>
          <Text style={s.statusSub}>
            {stripeId ? (chargesEnabled ? "Charges enabled" : "Onboarding incomplete") : "Connect to receive payments"}
          </Text>
        </View>
        {!stripeId && (
          <Pressable
            style={s.connectBtn}
            onPress={() => {
              const url = `${apiBaseUrl}/api/stripe/connect/start?org_id=${orgId}`;
              Linking.openURL(url);
            }}
          >
            <Text style={s.connectBtnText}>Connect</Text>
          </Pressable>
        )}
      </View>

      <Text style={s.sectionTitle}>Recent Payments</Text>
      <FlatList
        data={payments}
        keyExtractor={(i) => i.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={<Text style={s.empty}>No payments yet.</Text>}
        renderItem={({ item: p }) => (
          <View style={s.payCard}>
            <View style={{ flex: 1 }}>
              <Text style={s.payAmount}>${(p.amount / 100).toFixed(2)} {p.currency.toUpperCase()}</Text>
              <Text style={s.payDate}>{new Date(p.created_at).toLocaleDateString()}</Text>
            </View>
            <View style={[s.payBadge, { backgroundColor: p.status === "succeeded" ? colors.green : colors.inkSofter }]}>
              <Text style={s.payBadgeText}>{p.status}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: space(4) },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  statusCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space(4), gap: space(3), marginBottom: space(4) },
  statusTitle: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  statusSub: { color: colors.inkSoft, fontSize: 13, marginTop: 2 },
  connectBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space(4), paddingVertical: space(2) },
  connectBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: "700", marginBottom: space(2) },
  list: { gap: space(2), paddingBottom: space(6) },
  empty: { color: colors.inkSofter, textAlign: "center", marginTop: space(6) },
  payCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space(3), gap: space(3) },
  payAmount: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  payDate: { color: colors.inkSoft, fontSize: 12, marginTop: 2 },
  payBadge: { paddingHorizontal: space(2), paddingVertical: 2, borderRadius: radius.pill },
  payBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
});
