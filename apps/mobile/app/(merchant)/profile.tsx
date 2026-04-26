import { useCallback, useState } from "react";
import {
  Alert,
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
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { registerForPush } from "@/lib/push";
import { clearClaims } from "@/lib/claims";
import { resolveOrganizationId } from "@/lib/merchantOrg";
import { colors, radius, space } from "@/lib/theme";

const isExpoGo = Constants.appOwnership === "expo";
const ONBOARDED_KEY = "nearby.onboarded";

type Stats = {
  locations: number;
  activeOffers: number;
  totalRedemptions: number;
  totalRules: number;
};

export default function MerchantProfile() {
  const [email, setEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats>({ locations: 0, activeOffers: 0, totalRedemptions: 0, totalRules: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [pushStatus, setPushStatus] = useState<"idle" | "pending" | "registered" | "error">("idle");
  const [pushMsg, setPushMsg] = useState("");
  const [orgId, setOrgId] = useState("");
  const [address, setAddress] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setEmail(user.email ?? "");
    setRoles((user.user_metadata?.roles as string[]) ?? []);

    const oid = await resolveOrganizationId(supabase);
    if (!oid) return;
    setOrgId(oid);
    const { data: orgRow } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", oid)
      .single();
    setOrgName(orgRow?.name ?? "");

    const { data: locs } = await supabase
      .from("locations")
      .select("id, address")
      .eq("organization_id", oid);

    const locationIds = locs?.map((l: any) => l.id) ?? [];
    if (locs?.length) setAddress(locs[0].address ?? "");

    let activeOffers = 0;
    let totalRedemptions = 0;
    let totalRules = 0;

    if (locationIds.length > 0) {
      const now = new Date().toISOString();
      const { count: offersCount } = await supabase
        .from("offers").select("id", { count: "exact", head: true })
        .in("location_id", locationIds).gte("expires_at", now);
      activeOffers = offersCount ?? 0;

      const { count: rulesCount } = await supabase
        .from("offer_rules").select("id", { count: "exact", head: true })
        .in("location_id", locationIds);
      totalRules = rulesCount ?? 0;

      const { data: offerRows } = await supabase
        .from("offers")
        .select("id")
        .in("location_id", locationIds);
      const offerIds = offerRows?.map((o: { id: string }) => o.id) ?? [];
      if (offerIds.length > 0) {
        const { count: redemptionsCount } = await supabase
          .from("redemptions")
          .select("id", { count: "exact", head: true })
          .in("offer_id", offerIds);
        totalRedemptions = redemptionsCount ?? 0;
      }
    }

    setStats({
      locations: locs?.length ?? 0,
      activeOffers,
      totalRedemptions,
      totalRules,
    });
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function saveOrgName() {
    if (!supabase || !orgId || !draftName.trim()) return;
    setSavingName(true);
    const { error } = await supabase.from("organizations").update({ name: draftName.trim() }).eq("id", orgId);
    if (error) { Alert.alert("Error", error.message); }
    else { setOrgName(draftName.trim()); setEditingName(false); }
    setSavingName(false);
  }

  async function enablePush() {
    setPushStatus("pending");
    setPushMsg("");
    const r = await registerForPush();
    if (r.ok) {
      setPushStatus("registered");
      setPushMsg("You'll be notified when customers redeem offers.");
    } else {
      setPushStatus("error");
      const isFcm = r.error.includes("FirebaseApp") || r.error.includes("Firebase");
      setPushMsg(isFcm ? "Push notifications need Firebase Cloud Messaging. Available in the production release." : r.error);
    }
  }

  async function signOutAndRestart() {
    try { if (supabase) await supabase.auth.signOut(); } catch {}
    await clearClaims();
    await SecureStore.deleteItemAsync(ONBOARDED_KEY);
    router.replace("/onboarding");
  }

  function confirmSignOut() {
    Alert.alert("Sign out", "This will sign you out and restart the onboarding flow. Continue?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: signOutAndRestart },
    ]);
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Hero */}
      <View style={s.hero}>
        <Image source={require("../../assets/icon.png")} style={s.heroLogo} resizeMode="cover" />
        {editingName ? (
          <View style={s.editRow}>
            <TextInput
              style={s.editInput}
              value={draftName}
              onChangeText={setDraftName}
              autoFocus
              placeholder="Business name"
              placeholderTextColor={colors.inkSofter}
            />
            <Pressable style={s.editSaveBtn} onPress={saveOrgName} disabled={savingName}>
              <Text style={s.editSaveBtnText}>{savingName ? "…" : "Save"}</Text>
            </Pressable>
            <Pressable onPress={() => setEditingName(false)}>
              <Ionicons name="close-circle" size={24} color={colors.inkSofter} />
            </Pressable>
          </View>
        ) : (
          <Pressable style={s.nameRow} onPress={() => { setDraftName(orgName); setEditingName(true); }}>
            <Text style={s.heroTitle}>{orgName || "Merchant"}</Text>
            <Ionicons name="pencil-outline" size={16} color={colors.inkSofter} />
          </Pressable>
        )}
        <Text style={s.heroEmail}>{email}</Text>
        {address ? <Text style={s.heroAddress}>{address}</Text> : null}
        <View style={s.roleBadges}>
          {roles.map((role) => (
            <View key={role} style={s.roleBadge}>
              <Ionicons name={role === "merchant" ? "storefront" : "bag-handle"} size={12} color={colors.accent} />
              <Text style={s.roleBadgeText}>{role.charAt(0).toUpperCase() + role.slice(1)}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Stats */}
      <View style={s.statsGrid}>
        <StatCard icon="location-outline" label="Locations" value={stats.locations} />
        <StatCard icon="pricetag-outline" label="Active Offers" value={stats.activeOffers} />
        <StatCard icon="checkmark-circle-outline" label="Redemptions" value={stats.totalRedemptions} />
        <StatCard icon="list-outline" label="Rules" value={stats.totalRules} />
      </View>

      {/* Quick Actions */}
      <Card>
        <View style={s.cardHeader}>
          <Ionicons name="flash-outline" size={20} color={colors.accent} />
          <Text style={s.cardTitle}>Quick Actions</Text>
        </View>
        <ActionRow icon="storefront-outline" label="Edit Business Profile" sub="Name, address, slow hours" onPress={() => router.push("/merchant-screens/setup")} />
        <ActionRow icon="pricetag-outline" label="Manage Offers" sub="Create and publish offers" onPress={() => router.navigate("/(merchant)/offers")} />
        <ActionRow icon="scan-outline" label="Scan Customer Code" sub="Redeem an offer" onPress={() => router.navigate("/(merchant)/scanner")} />
        <ActionRow icon="people-outline" label="Team" sub="Members and roles" onPress={() => router.push("/merchant-screens/team")} />
      </Card>

      {/* Switch to customer */}
      {roles.includes("customer") && (
        <Card>
          <Pressable style={s.switchBtn} onPress={() => router.replace("/(tabs)")}>
            <Ionicons name="swap-horizontal" size={20} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={s.switchTitle}>Switch to customer view</Text>
              <Text style={s.switchBody}>Browse offers and earn loyalty as a customer</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkSofter} />
          </Pressable>
        </Card>
      )}

      {/* Notifications */}
      <Card>
        <View style={s.cardHeader}>
          <Ionicons name="notifications-outline" size={20} color={colors.accent} />
          <Text style={s.cardTitle}>Notifications</Text>
        </View>
        {isExpoGo ? (
          <View style={{ gap: space(2) }}>
            <Text style={s.cardBody}>Push notifications need a dev build. They're disabled in Expo Go.</Text>
            <View style={s.infoBadge}>
              <Ionicons name="information-circle" size={14} color={colors.accent} />
              <Text style={s.infoBadgeText}>Build the Nearby dev client to enable</Text>
            </View>
          </View>
        ) : (
          <View style={{ gap: space(2) }}>
            <Text style={s.cardBody}>
              {pushStatus === "registered" ? pushMsg
                : pushStatus === "error" ? `Couldn't enable: ${pushMsg}`
                : "Get notified when customers redeem your offers."}
            </Text>
            <Pressable
              style={[s.btn, pushStatus === "registered" && s.btnGreen]}
              onPress={enablePush}
              disabled={pushStatus === "pending" || pushStatus === "registered"}
            >
              <Text style={s.btnText}>
                {pushStatus === "registered" ? "Enabled"
                  : pushStatus === "pending" ? "Requesting…"
                  : "Enable notifications"}
              </Text>
            </Pressable>
          </View>
        )}
      </Card>

      {/* About */}
      <Card>
        <View style={s.cardHeader}>
          <Ionicons name="sparkles-outline" size={20} color={colors.accent} />
          <Text style={s.cardTitle}>About Nearby</Text>
        </View>
        <Text style={s.cardBody}>
          Nearby helps local businesses connect with customers through hyper-local offers.
          Publish deals, track redemptions, and grow your customer base -- all from your phone.
        </Text>
        <Text style={s.version}>Version 0.1.0</Text>
      </Card>

      {/* Sign out */}
      <Card>
        <View style={s.cardHeader}>
          <Ionicons name="log-out-outline" size={20} color={colors.accent} />
          <Text style={s.cardTitle}>Account</Text>
        </View>
        <Pressable style={s.signOutBtn} onPress={confirmSignOut}>
          <Ionicons name="refresh-outline" size={16} color="#fff" />
          <Text style={s.signOutText}>Sign out and restart</Text>
        </Pressable>
      </Card>
    </ScrollView>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={s.card}>{children}</View>;
}

function StatCard({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number }) {
  return (
    <View style={s.stat}>
      <Ionicons name={icon} size={22} color={colors.accent} />
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function ActionRow({ icon, label, sub, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; sub: string; onPress: () => void }) {
  return (
    <Pressable style={s.actionRow} onPress={onPress}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <View style={{ flex: 1 }}>
        <Text style={s.actionLabel}>{label}</Text>
        <Text style={s.actionSub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.inkSofter} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  container: { padding: space(4), gap: space(3), paddingBottom: space(10) },
  hero: { alignItems: "center", gap: space(1), paddingVertical: space(4) },
  heroLogo: { width: 72, height: 72, borderRadius: 18, marginBottom: space(1) },
  heroTitle: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  heroEmail: { color: colors.inkSoft, fontSize: 14 },
  heroAddress: { color: colors.inkSofter, fontSize: 12, textAlign: "center", paddingHorizontal: space(8) },
  nameRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
  editRow: { flexDirection: "row", alignItems: "center", gap: space(2), paddingHorizontal: space(4), width: "100%" },
  editInput: { flex: 1, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(3), paddingVertical: space(2), fontSize: 16, color: colors.ink },
  editSaveBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(2) },
  editSaveBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  roleBadges: { flexDirection: "row", gap: space(2), marginTop: space(1) },
  roleBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.accentSoft, paddingHorizontal: space(2.5), paddingVertical: space(1), borderRadius: radius.pill },
  roleBadgeText: { color: colors.accent, fontSize: 12, fontWeight: "600" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: space(3) },
  stat: { width: "47%" as any, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(3), alignItems: "center", gap: space(1) },
  statValue: { color: colors.ink, fontSize: 24, fontWeight: "800" },
  statLabel: { color: colors.inkSofter, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" },
  card: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: space(4), gap: space(2) },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: space(2) },
  cardTitle: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  cardBody: { color: colors.inkSoft, fontSize: 14, lineHeight: 20 },
  version: { color: colors.inkSofter, fontSize: 12 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(2.5), borderTopWidth: 1, borderTopColor: colors.border },
  actionLabel: { color: colors.ink, fontWeight: "600", fontSize: 14 },
  actionSub: { color: colors.inkSoft, fontSize: 12 },
  switchBtn: { flexDirection: "row", alignItems: "center", gap: space(3) },
  switchTitle: { color: colors.ink, fontWeight: "700", fontSize: 15 },
  switchBody: { color: colors.inkSoft, fontSize: 13 },
  infoBadge: { flexDirection: "row", alignItems: "center", gap: space(1.5), backgroundColor: colors.accentSoft, alignSelf: "flex-start", paddingVertical: space(1.5), paddingHorizontal: space(2.5), borderRadius: radius.pill },
  infoBadgeText: { color: colors.accent, fontSize: 12, fontWeight: "600" },
  btn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: space(2.5), alignItems: "center", flexDirection: "row", justifyContent: "center", gap: space(2) },
  btnGreen: { backgroundColor: colors.green },
  btnText: { color: "white", fontWeight: "700", fontSize: 14 },
  signOutBtn: { backgroundColor: colors.red, borderRadius: radius.pill, paddingVertical: space(2.5), alignItems: "center", flexDirection: "row", justifyContent: "center", gap: space(2) },
  signOutText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
