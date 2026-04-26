import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  ActivityIndicator,
  Alert,
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
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { geocodeAddress } from "@/lib/geocode";
import {
  listMerchantOrganizations,
  resolveOrganizationId,
  selectNewOrganization,
} from "@/lib/merchantOrg";
import { colors, radius, space } from "@/lib/theme";

type OrgData = {
  orgName: string;
  orgId: string;
  locationCount: number;
  activeOffers: number;
  todayRedemptions: number;
};

type ManagementCard = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  description: string;
  color: string;
};

const CARDS: ManagementCard[] = [
  { title: "Business Profile", icon: "storefront-outline", route: "/merchant-screens/setup", description: "Name, address, slow hours, photo", color: "#2563EB" },
  { title: "Locations", icon: "location-outline", route: "/merchant-screens/locations", description: "Manage your locations", color: "#7C3AED" },
  { title: "Menu Items", icon: "restaurant-outline", route: "/merchant-screens/items", description: "Products and pricing", color: "#059669" },
  { title: "Offer Rules", icon: "pricetag-outline", route: "/merchant-screens/rules", description: "Discounts and promotions", color: "#D97706" },
  { title: "Approvals", icon: "checkmark-done-outline", route: "/merchant-screens/approvals", description: "Review pending rules", color: "#DC2626" },
  { title: "Loyalty", icon: "heart-outline", route: "/merchant-screens/loyalty", description: "Stamp cards and points", color: "#EC4899" },
  { title: "Payments", icon: "card-outline", route: "/merchant-screens/payments", description: "Stripe Connect status", color: "#0891B2" },
  { title: "POS", icon: "hardware-chip-outline", route: "/merchant-screens/pos", description: "Square integration", color: "#4F46E5" },
  { title: "Team", icon: "people-outline", route: "/merchant-screens/team", description: "Members and roles", color: "#0D9488" },
];

export default function MerchantDashboard() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<OrgData | null>(null);
  const [allOrgs, setAllOrgs] = useState<{ id: string; name: string }[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState("");
  const [newBizModal, setNewBizModal] = useState(false);
  const [newBizName, setNewBizName] = useState("");
  const [newBizAddress, setNewBizAddress] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserName(user.email ?? "Merchant");

      const orgs = await listMerchantOrganizations(supabase);
      setAllOrgs(orgs);
      if (orgs.length === 0) {
        setData(null);
        return;
      }

      const orgId = await resolveOrganizationId(supabase);
      if (!orgId) {
        setData(null);
        return;
      }
      const current = orgs.find((o) => o.id === orgId) ?? orgs[0];

      const { count: locationCount } = await supabase
        .from("locations").select("id", { count: "exact", head: true }).eq("organization_id", orgId);

      const { data: locations } = await supabase
        .from("locations").select("id").eq("organization_id", orgId);

      const locationIds = locations?.map((l: { id: string }) => l.id) ?? [];

      let activeOffers = 0;
      let todayRedemptions = 0;

      if (locationIds.length > 0) {
        const now = new Date().toISOString();
        const { count: offersCount } = await supabase
          .from("offers").select("id", { count: "exact", head: true }).in("location_id", locationIds).gte("expires_at", now);
        activeOffers = offersCount ?? 0;

        const { data: offerRows } = await supabase
          .from("offers").select("id").in("location_id", locationIds);
        const offerIds = offerRows?.map((o: { id: string }) => o.id) ?? [];

        if (offerIds.length > 0) {
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const { count: redemptionsCount } = await supabase
            .from("redemptions")
            .select("id", { count: "exact", head: true })
            .in("offer_id", offerIds)
            .gte("redeemed_at", todayStart.toISOString());
          todayRedemptions = redemptionsCount ?? 0;
        }
      }

      setData({
        orgName: current.name,
        orgId: orgId,
        locationCount: locationCount ?? 0,
        activeOffers,
        todayRedemptions,
      });
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function switchOrg(orgId: string) {
    if (!supabase) return;
    await selectNewOrganization(orgId);
    setLoading(true);
    await load();
  }

  function createNewBusiness() {
    setNewBizName("");
    setNewBizAddress("");
    setNewBizModal(true);
  }

  async function doCreateBusiness() {
    if (!supabase || !newBizName.trim()) { Alert.alert("Required", "Enter a business name."); return; }
    if (!newBizAddress.trim()) { Alert.alert("Location Required", "Your business address is essential for customers to find you. Please enter your address."); return; }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: newOrg, error: orgErr } = await supabase.rpc("create_new_business", { p_name: newBizName.trim() });
      if (orgErr) { Alert.alert("Error", orgErr.message); return; }
      if (newOrg?.org_id) {
        await selectNewOrganization(newOrg.org_id as string);
      }
      if (newOrg?.location_id) {
        await supabase.from("locations").update({ address: newBizAddress.trim() }).eq("id", newOrg.location_id);
        const coords = await geocodeAddress(newBizAddress.trim());
        if (coords) {
          await supabase.rpc("update_location_coords", {
            p_location_id: newOrg.location_id,
            p_lat: coords.lat,
            p_lng: coords.lng,
          });
        }
      }
      setNewBizModal(false);
      Alert.alert("Created", `"${newBizName.trim()}" is now your active business. Add a photo in Business Profile so it stands out!`);
      load();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed");
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  }

  if (!data) {
    return (
      <View style={s.center}>
        <View style={s.iconBubble}>
          <Ionicons name="storefront-outline" size={48} color={colors.accent} />
        </View>
        <Text style={s.emptyTitle}>No business set up yet</Text>
        <Text style={s.emptyBody}>Get started by setting up your business profile.</Text>
        <Pressable style={s.primaryBtn} onPress={() => router.push("/merchant-screens/setup")}>
          <Ionicons name="add-circle-outline" size={16} color="#fff" />
          <Text style={s.primaryBtnText}>Set Up Business</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={s.hero}>
        <View style={s.avatarCircle}>
          <Ionicons name="storefront" size={28} color={colors.accent} />
        </View>
        <Text style={s.orgName}>{data.orgName}</Text>
        {allOrgs.length > 1 && (
          <View style={s.orgSwitch}>
            {allOrgs.map((o) => (
              <Pressable
                key={o.id}
                onPress={() => o.id !== data.orgId && switchOrg(o.id)}
                style={[s.orgChip, o.id === data.orgId && s.orgChipActive]}
              >
                <Text numberOfLines={1} style={[s.orgChipText, o.id === data.orgId && s.orgChipTextActive]}>
                  {o.name}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        <Text style={s.greeting}>Welcome back, {userName}</Text>
      </View>

      <View style={s.statsGrid}>
        <StatCard icon="location-outline" label="Locations" value={data.locationCount} />
        <StatCard icon="pricetag-outline" label="Active Offers" value={data.activeOffers} />
        <StatCard icon="checkmark-circle-outline" label="Redeemed Today" value={data.todayRedemptions} />
        <StatCard icon="star-outline" label="Rating" value="--" />
      </View>

      <Pressable style={s.scanBtn} onPress={() => router.navigate("/(merchant)/scanner")}>
        <Ionicons name="scan" size={22} color="#fff" />
        <Text style={s.scanBtnText}>Quick Scan</Text>
        <Text style={s.scanBtnSub}>Tap to redeem a customer offer</Text>
      </Pressable>

      <Text style={s.sectionTitle}>Manage Your Business</Text>
      <View style={s.mgmtGrid}>
        {CARDS.map((card) => (
          <Pressable key={card.route} style={s.mgmtCard} onPress={() => router.push(card.route as any)}>
            <View style={[s.mgmtIcon, { backgroundColor: card.color + "15" }]}>
              <Ionicons name={card.icon} size={24} color={card.color} />
            </View>
            <Text style={s.mgmtTitle}>{card.title}</Text>
            <Text style={s.mgmtDesc}>{card.description}</Text>
          </Pressable>
        ))}
        <Pressable style={s.addBizCard} onPress={createNewBusiness}>
          <Ionicons name="add-circle-outline" size={28} color={colors.accent} />
          <Text style={s.addBizText}>Add Another Business</Text>
        </Pressable>
      </View>

      <Modal visible={newBizModal} animationType="slide" transparent onRequestClose={() => setNewBizModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modal, { paddingBottom: space(5) + insets.bottom }]}>
            <Text style={s.modalTitle}>New Business</Text>
            <Text style={s.modalLabel}>Business Name</Text>
            <TextInput style={s.modalInput} value={newBizName} onChangeText={setNewBizName} placeholder="e.g. My Restaurant" placeholderTextColor={colors.inkSofter} autoFocus />
            <Text style={s.modalLabel}>Business Address *</Text>
            <TextInput style={s.modalInput} value={newBizAddress} onChangeText={setNewBizAddress} placeholder="e.g. 123 Main St, City, State" placeholderTextColor={colors.inkSofter} multiline />
            <Text style={s.modalHint}>Your address is how nearby customers discover you. The new business becomes active immediately.</Text>
            <View style={s.modalActions}>
              <Pressable onPress={() => setNewBizModal(false)} style={s.modalCancelBtn}><Text style={s.modalCancelText}>Cancel</Text></Pressable>
              <Pressable onPress={doCreateBusiness} style={s.modalCreateBtn}><Text style={s.modalCreateText}>Create</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function StatCard({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number | string }) {
  return (
    <View style={s.stat}>
      <Ionicons name={icon} size={22} color={colors.accent} />
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(8), gap: space(3) },
  container: { padding: space(4), gap: space(4), paddingBottom: space(10) },
  hero: { alignItems: "center", gap: space(1), paddingVertical: space(4) },
  avatarCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center", marginBottom: space(1) },
  orgName: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  orgSwitch: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space(2), maxWidth: "100%" as any, marginTop: space(2) },
  orgChip: { maxWidth: 160, paddingVertical: space(1.5), paddingHorizontal: space(2.5), borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  orgChipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  orgChipText: { color: colors.inkSoft, fontSize: 12, fontWeight: "600" },
  orgChipTextActive: { color: colors.accent },
  greeting: { color: colors.inkSoft, fontSize: 14, marginTop: space(1) },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: space(3) },
  stat: { width: "47%" as any, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(4), alignItems: "center", gap: space(1) },
  statValue: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  statLabel: { color: colors.inkSofter, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" },
  scanBtn: { backgroundColor: colors.accent, borderRadius: radius.lg, padding: space(5), alignItems: "center", gap: space(1) },
  scanBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  scanBtnSub: { color: "rgba(255,255,255,0.7)", fontSize: 13 },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  mgmtGrid: { flexDirection: "row", flexWrap: "wrap", gap: space(3) },
  mgmtCard: { width: "47%" as any, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(4), gap: space(2) },
  mgmtIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  mgmtTitle: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  mgmtDesc: { color: colors.inkSoft, fontSize: 12, lineHeight: 16 },
  iconBubble: { width: 88, height: 88, borderRadius: 22, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: colors.ink, fontSize: 20, fontWeight: "800", textAlign: "center" },
  emptyBody: { color: colors.inkSoft, fontSize: 15, lineHeight: 22, textAlign: "center" },
  primaryBtn: { flexDirection: "row", alignItems: "center", gap: space(2), backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: space(3), paddingHorizontal: space(5), marginTop: space(2) },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  addBizCard: { width: "47%" as any, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.accent, borderStyle: "dashed", padding: space(4), gap: space(2), alignItems: "center", justifyContent: "center" },
  addBizText: { color: colors.accent, fontSize: 13, fontWeight: "700", textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#fff", borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space(5), paddingBottom: space(8), gap: space(3) },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
  modalLabel: { color: colors.inkSoft, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  modalInput: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(3), paddingVertical: space(3), fontSize: 16, color: colors.ink },
  modalActions: { flexDirection: "row", gap: space(3), marginTop: space(2) },
  modalCancelBtn: { flex: 1, paddingVertical: space(3), alignItems: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  modalCancelText: { color: colors.inkSoft, fontWeight: "600" },
  modalCreateBtn: { flex: 1, paddingVertical: space(3), alignItems: "center", borderRadius: radius.pill, backgroundColor: colors.accent },
  modalCreateText: { color: "#fff", fontWeight: "700" },
  modalHint: { color: colors.inkSofter, fontSize: 12, lineHeight: 16 },
});
