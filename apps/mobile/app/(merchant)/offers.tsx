import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { resolveOrganizationId } from "@/lib/merchantOrg";
import { colors, radius, space } from "@/lib/theme";

type Offer = {
  id: string;
  headline: string;
  discount_pct: number;
  expires_at: string;
  created_at: string;
  redemption_code: string;
  redemptions_count: number;
  max_redemptions: number;
  location_name: string;
};

type Rule = {
  id: string;
  name: string;
  discount_cap_pct: number;
  max_redemptions: number;
  status: string;
  active: boolean;
};

export default function MerchantOffers() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [locationId, setLocationId] = useState("");

  const [createModal, setCreateModal] = useState(false);
  const [headline, setHeadline] = useState("");
  const [discount, setDiscount] = useState("15");
  const [maxRedemptions, setMaxRedemptions] = useState("100");
  const [expiresHours, setExpiresHours] = useState("24");
  const [publishing, setPublishing] = useState(false);

  const [rulePickerModal, setRulePickerModal] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const orgId = await resolveOrganizationId(supabase);
      if (!orgId) { setOffers([]); setLoading(false); return; }

      const { data: locations } = await supabase
        .from("locations")
        .select("id, name")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: true });

      if (!locations?.length) { setOffers([]); setLoading(false); return; }

      const locationMap = new Map<string, string>();
      locations.forEach((l: any) => locationMap.set(l.id, l.name));
      const locationIds = locations.map((l: any) => l.id);
      setLocationId(locationIds[0]);

      const [offersRes, rulesRes] = await Promise.all([
        supabase
          .from("offers")
          .select("id, headline, discount_pct, expires_at, created_at, location_id, redemption_code, redemptions_count, max_redemptions")
          .in("location_id", locationIds)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("offer_rules")
          .select("id, name, discount_cap_pct, max_redemptions, status, active")
          .in("location_id", locationIds)
          .order("created_at", { ascending: false }),
      ]);

      setOffers(
        (offersRes.data ?? []).map((o: any) => ({
          ...o,
          location_name: locationMap.get(o.location_id) ?? "Unknown",
        })),
      );

      setRules((rulesRes.data ?? []) as Rule[]);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function publishOffer() {
    if (!supabase || !locationId) return;
    if (!headline.trim()) { Alert.alert("Required", "Headline is required."); return; }
    setPublishing(true);
    try {
      const { data, error } = await supabase.rpc("publish_offer", {
        p_location_id: locationId,
        p_headline: headline.trim(),
        p_discount_pct: parseInt(discount) || 15,
        p_max_redemptions: parseInt(maxRedemptions) || 100,
        p_expires_hours: parseInt(expiresHours) || 24,
      });
      if (error) { Alert.alert("Error", error.message); setPublishing(false); return; }
      setCreateModal(false);
      Alert.alert("Published!", `Offer is now live. Code: ${data?.redemption_code ?? "N/A"}`);
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setPublishing(false);
    }
  }

  async function publishFromRule(rule: Rule) {
    if (!supabase) return;
    setPublishing(true);
    try {
      const { data, error } = await supabase.rpc("generate_offer_from_rule", {
        p_rule_id: rule.id,
      });
      if (error) { Alert.alert("Error", error.message); return; }
      setRulePickerModal(false);
      Alert.alert("Published!", `Offer generated from "${rule.name}". Code: ${data?.redemption_code ?? "N/A"}`);
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setPublishing(false);
    }
  }

  function openCreate() {
    setHeadline(""); setDiscount("15"); setMaxRedemptions("100"); setExpiresHours("24");
    setCreateModal(true);
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  }

  const now = new Date();

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={offers}
        keyExtractor={(o) => o.id}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          rules.length > 0 ? (
            <Pressable style={s.fromRuleBtn} onPress={() => setRulePickerModal(true)}>
              <Ionicons name="flash-outline" size={16} color={colors.accent} />
              <Text style={s.fromRuleBtnText}>Generate from Rule</Text>
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <View style={s.iconBubble}>
              <Ionicons name="pricetag-outline" size={48} color={colors.accent} />
            </View>
            <Text style={s.emptyTitle}>No offers yet</Text>
            <Text style={s.emptyBody}>
              Tap the + button to create your first offer, or generate one from your offer rules.
            </Text>
          </View>
        }
        renderItem={({ item: offer }) => {
          const expires = new Date(offer.expires_at);
          const isExpired = expires < now;
          const isFull = offer.redemptions_count >= offer.max_redemptions;
          const status = isExpired ? "Expired" : isFull ? "Full" : "Live";
          const badgeStyle = isExpired || isFull ? s.badgeExpired : s.badgeLive;
          const badgeTextStyle = isExpired || isFull ? s.badgeTextExpired : s.badgeTextLive;

          return (
            <View style={s.card}>
              <View style={s.cardTop}>
                <View style={s.cardHeader}>
                  <Text style={s.headline} numberOfLines={2}>{offer.headline}</Text>
                  <View style={[s.badge, badgeStyle]}>
                    <Text style={[s.badgeText, badgeTextStyle]}>{status}</Text>
                  </View>
                </View>
                <Text style={s.location}>{offer.location_name}</Text>
              </View>

              <View style={s.cardStats}>
                <View style={s.statItem}>
                  <Ionicons name="pricetag" size={14} color={colors.accent} />
                  <Text style={s.statText}>{offer.discount_pct}% off</Text>
                </View>
                <View style={s.statItem}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.green} />
                  <Text style={s.statText}>{offer.redemptions_count}/{offer.max_redemptions}</Text>
                </View>
                <View style={s.statItem}>
                  <Ionicons name="key-outline" size={14} color={colors.inkSofter} />
                  <Text style={s.statText}>{offer.redemption_code}</Text>
                </View>
              </View>

              <View style={s.signupsRow}>
                <Pressable
                  style={s.signupsBtn}
                  onPress={() =>
                    router.push({
                      pathname: "/merchant-screens/offer-claims",
                      params: { offerId: offer.id },
                    })
                  }
                >
                  <Ionicons name="people-outline" size={16} color={colors.accent} />
                  <Text style={s.signupsBtnText}>Customer sign-ups</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.inkSofter} />
                </Pressable>
              </View>

              <View style={s.cardFooter}>
                <Text style={s.footerText}>
                  Created {new Date(offer.created_at).toLocaleDateString()} · Expires {expires.toLocaleDateString()} {expires.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            </View>
          );
        }}
      />

      {/* FAB */}
      <Pressable style={[s.fab, { bottom: space(6) + insets.bottom }]} onPress={openCreate}>
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      {/* Create Offer Modal */}
      <Modal visible={createModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <ScrollView
            style={s.modal}
            contentContainerStyle={[s.modalContent, { paddingBottom: space(5) + insets.bottom }]}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={s.modalTitle}>Create Offer</Text>

            <Text style={s.label}>Headline</Text>
            <TextInput
              style={s.input}
              value={headline}
              onChangeText={setHeadline}
              placeholder="e.g. 20% off all drinks today!"
              placeholderTextColor={colors.inkSofter}
            />

            <Text style={s.label}>Discount %</Text>
            <TextInput
              style={s.input}
              value={discount}
              onChangeText={setDiscount}
              keyboardType="number-pad"
              placeholderTextColor={colors.inkSofter}
            />

            <Text style={s.label}>Max Redemptions</Text>
            <TextInput
              style={s.input}
              value={maxRedemptions}
              onChangeText={setMaxRedemptions}
              keyboardType="number-pad"
              placeholderTextColor={colors.inkSofter}
            />

            <Text style={s.label}>Expires in (hours)</Text>
            <TextInput
              style={s.input}
              value={expiresHours}
              onChangeText={setExpiresHours}
              keyboardType="number-pad"
              placeholder="24"
              placeholderTextColor={colors.inkSofter}
            />

            <View style={s.modalActions}>
              <Pressable onPress={() => setCreateModal(false)} style={s.cancelBtn}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={publishOffer}
                style={[s.publishBtn, publishing && { opacity: 0.6 }]}
                disabled={publishing}
              >
                <Ionicons name="megaphone-outline" size={16} color="#fff" />
                <Text style={s.publishBtnText}>{publishing ? "Publishing…" : "Publish"}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Generate from Rule — header X + scroll + cancel so the sheet is never a dead-end */}
      <Modal visible={rulePickerModal} animationType="slide" transparent onRequestClose={() => setRulePickerModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modal, s.ruleModalBox, { paddingBottom: space(3) + insets.bottom }]}>
            <View style={s.ruleModalHeader}>
              <View style={{ flex: 1, paddingRight: space(2) }}>
                <Text style={s.modalTitle}>Generate from Rule</Text>
                <Text style={s.hint}>Select a rule to auto-generate an offer from it.</Text>
              </View>
              <Pressable
                onPress={() => setRulePickerModal(false)}
                hitSlop={12}
                style={s.ruleModalClose}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={28} color={colors.inkSofter} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={s.ruleModalScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {rules.map((rule) => (
                <Pressable
                  key={rule.id}
                  style={s.ruleCard}
                  onPress={() => publishFromRule(rule)}
                  disabled={publishing}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.ruleName}>{rule.name}</Text>
                    <Text style={s.ruleMeta}>{rule.discount_cap_pct}% off · Max {rule.max_redemptions}</Text>
                  </View>
                  <Ionicons name="arrow-forward-circle" size={24} color={colors.accent} />
                </Pressable>
              ))}
              <Pressable onPress={() => setRulePickerModal(false)} style={[s.cancelBtn, s.ruleModalCancel]}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(8), gap: space(3) },
  list: { padding: space(4), gap: space(3), paddingBottom: space(20) },
  emptyWrap: { alignItems: "center", gap: space(3), paddingTop: space(12) },
  iconBubble: { width: 88, height: 88, borderRadius: 22, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: colors.ink, fontSize: 20, fontWeight: "800", textAlign: "center" },
  emptyBody: { color: colors.inkSoft, fontSize: 15, lineHeight: 22, textAlign: "center", paddingHorizontal: space(4) },
  fromRuleBtn: { flexDirection: "row", alignItems: "center", gap: space(2), alignSelf: "center", backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingVertical: space(2), paddingHorizontal: space(4), marginBottom: space(3) },
  fromRuleBtnText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  cardTop: { padding: space(4), gap: space(1) },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space(2) },
  headline: { flex: 1, color: colors.ink, fontSize: 16, fontWeight: "700", lineHeight: 22 },
  badge: { paddingHorizontal: space(2), paddingVertical: 2, borderRadius: radius.pill },
  badgeLive: { backgroundColor: "#DCFCE7" },
  badgeExpired: { backgroundColor: "#FEE2E2" },
  badgeText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  badgeTextLive: { color: colors.green },
  badgeTextExpired: { color: colors.red },
  location: { color: colors.inkSoft, fontSize: 13 },
  cardStats: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: space(4), paddingVertical: space(3), gap: space(4) },
  statItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { color: colors.inkSoft, fontSize: 12, fontWeight: "500" },
  signupsRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 2, paddingHorizontal: 2 },
  signupsBtn: { flexDirection: "row", alignItems: "center", gap: space(2), paddingVertical: space(2.5), paddingHorizontal: space(3) },
  signupsBtnText: { color: colors.accent, fontWeight: "600", fontSize: 14, flex: 1 },
  cardFooter: { borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: space(4), paddingVertical: space(2) },
  footerText: { color: colors.inkSofter, fontSize: 11 },
  fab: { position: "absolute", right: space(5), width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modal: { maxHeight: "85%", backgroundColor: "#fff", borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  modalContent: { padding: space(5), paddingBottom: space(8), gap: space(3) },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
  label: { color: colors.inkSoft, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  hint: { color: colors.inkSofter, fontSize: 13, lineHeight: 18 },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(3), paddingVertical: space(3), fontSize: 16, color: colors.ink },
  modalActions: { flexDirection: "row", gap: space(3), marginTop: space(2) },
  cancelBtn: { flex: 1, paddingVertical: space(3), alignItems: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  ruleModalCancel: { flexGrow: 0, alignSelf: "stretch" },
  cancelBtnText: { color: colors.inkSoft, fontWeight: "600" },
  ruleModalBox: { maxHeight: "90%" as const },
  ruleModalHeader: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: space(5), paddingTop: space(4), paddingBottom: space(2), borderBottomWidth: 1, borderBottomColor: colors.border, gap: space(1) },
  ruleModalClose: { padding: space(0.5) },
  ruleModalScroll: { paddingHorizontal: space(5), paddingTop: space(2), paddingBottom: space(6), gap: space(3) },
  publishBtn: { flex: 1, flexDirection: "row", gap: space(2), paddingVertical: space(3), alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.accent },
  publishBtnText: { color: "#fff", fontWeight: "700" },
  ruleCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space(4), gap: space(3) },
  ruleName: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  ruleMeta: { color: colors.inkSoft, fontSize: 12, marginTop: 2 },
});
