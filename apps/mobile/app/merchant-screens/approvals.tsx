import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { colors, radius, space } from "@/lib/theme";

type RuleRow = { id: string; name: string; discount_cap_pct: number; status: string; created_at: string; location_id: string };

const STATUS_COLORS: Record<string, string> = { pending: "#F59E0B", rejected: "#DC2626", approved: "#16A34A" };

export default function ApprovalsScreen() {
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data: mem } = await supabase.from("memberships").select("organization_id").eq("user_id", user.id).limit(1);
    if (!mem?.length) { setLoading(false); return; }
    const { data: locs } = await supabase.from("locations").select("id").eq("organization_id", mem[0].organization_id);
    if (!locs?.length) { setLoading(false); return; }
    const locIds = locs.map(l => l.id);
    const { data } = await supabase
      .from("offer_rules").select("*").in("location_id", locIds)
      .in("status", ["pending", "rejected"])
      .order("created_at", { ascending: false });
    setRules((data ?? []) as RuleRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function approve(ruleId: string) {
    if (!supabase) return;
    await supabase.from("offer_rules").update({ status: "approved" }).eq("id", ruleId);
    await supabase.from("rule_approvals").insert({ rule_id: ruleId, reviewer_id: userId, decision: "approved" });
    load();
  }

  function confirmReject(ruleId: string) {
    Alert.prompt ? Alert.prompt("Reject", "Add a note (optional):", [
      { text: "Cancel", style: "cancel" },
      { text: "Reject", style: "destructive", onPress: (note) => reject(ruleId, note ?? "") },
    ]) : reject(ruleId, "");
  }

  async function reject(ruleId: string, note: string) {
    if (!supabase) return;
    await supabase.from("offer_rules").update({ status: "rejected" }).eq("id", ruleId);
    await supabase.from("rule_approvals").insert({ rule_id: ruleId, reviewer_id: userId, decision: "rejected", note });
    load();
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>;

  return (
    <FlatList
      data={rules}
      keyExtractor={(i) => i.id}
      contentContainerStyle={s.list}
      ListEmptyComponent={
        <View style={s.emptyWrap}>
          <Ionicons name="checkmark-circle-outline" size={48} color={colors.inkSofter} />
          <Text style={s.empty}>All caught up! No pending approvals.</Text>
        </View>
      }
      renderItem={({ item: rule }) => (
        <View style={s.card}>
          <View style={{ flex: 1 }}>
            <View style={s.nameRow}>
              <Text style={s.ruleName}>{rule.name}</Text>
              <View style={[s.badge, { backgroundColor: STATUS_COLORS[rule.status] ?? "#94A3B8" }]}>
                <Text style={s.badgeText}>{rule.status}</Text>
              </View>
            </View>
            <Text style={s.meta}>{rule.discount_cap_pct}% discount cap</Text>
          </View>
          <View style={s.actions}>
            <Pressable onPress={() => approve(rule.id)} style={s.approveBtn}>
              <Ionicons name="checkmark" size={18} color="#fff" />
            </Pressable>
            <Pressable onPress={() => confirmReject(rule.id)} style={s.rejectBtn}>
              <Ionicons name="close" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>
      )}
    />
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: space(4), gap: space(3), flexGrow: 1 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: space(3), marginTop: space(10) },
  empty: { color: colors.inkSofter, textAlign: "center", fontSize: 15 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space(4), gap: space(3) },
  nameRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
  ruleName: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  meta: { color: colors.inkSoft, fontSize: 13, marginTop: 2 },
  badge: { paddingHorizontal: space(2), paddingVertical: 2, borderRadius: radius.pill },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  actions: { flexDirection: "row", gap: space(2) },
  approveBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  rejectBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.red, alignItems: "center", justifyContent: "center" },
});
