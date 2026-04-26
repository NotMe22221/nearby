import { useCallback, useEffect, useState } from "react";
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
import type { WalletOrgSummary } from "@city-wallet/api-client";
import { api } from "@/lib/api";
import { getSessionId } from "@/lib/session";
import { registerForPush } from "@/lib/push";
import { supabase } from "@/lib/supabase";
import { clearClaims } from "@/lib/claims";
import { colors, radius, space } from "@/lib/theme";
import { apiBaseUrl } from "@/lib/config";

const isExpoGo = Constants.appOwnership === "expo";
const ONBOARDED_KEY = "nearby.onboarded";

export default function ProfileScreen() {
  const [sid, setSid] = useState<string>("");
  const [orgs, setOrgs] = useState<WalletOrgSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [pushStatus, setPushStatus] = useState<"idle" | "pending" | "registered" | "error">("idle");
  const [pushMsg, setPushMsg] = useState<string>("");
  const [showDebug, setShowDebug] = useState(false);
  const [isMerchant, setIsMerchant] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const load = useCallback(async () => {
    const id = await getSessionId();
    setSid(id);

    if (supabase) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const roles = (user.user_metadata?.roles as string[]) ?? [];
          setIsMerchant(roles.includes("merchant"));
          setIsSignedIn(true);
          setEmail(user.email ?? "");
          setDisplayName(user.user_metadata?.display_name ?? "");
        }
      } catch {}
    }

    try {
      const w = await api.fetchWallet(id);
      setOrgs(w.orgs ?? []);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function saveDisplayName() {
    if (!supabase || !draftName.trim()) return;
    setSavingName(true);
    const { error } = await supabase.auth.updateUser({ data: { display_name: draftName.trim() } });
    if (error) { Alert.alert("Error", error.message); }
    else { setDisplayName(draftName.trim()); setEditingName(false); }
    setSavingName(false);
  }

  async function enablePush() {
    setPushStatus("pending");
    setPushMsg("");
    const r = await registerForPush();
    if (r.ok) {
      setPushStatus("registered");
      setPushMsg("You're all set. We'll ping you when offers go live nearby.");
    } else {
      setPushStatus("error");
      const isFcmError = r.error.includes("FirebaseApp") || r.error.includes("Firebase");
      setPushMsg(isFcmError
        ? "Push notifications need Firebase Cloud Messaging. Available in the production release."
        : r.error);
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

  const totalPoints = orgs.reduce((sum, o) => sum + o.points, 0);
  const totalStamps = orgs.reduce(
    (sum, o) => sum + o.stamps.reduce((s, c) => s + (c.stamps % c.card.stamps_required), 0), 0);

  const greeting = isSignedIn
    ? (displayName || email.split("@")[0])
    : "Anonymous explorer";

  const subtitle = isSignedIn
    ? email
    : "You browse Nearby without an account. Your wallet is tied to this device.";

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Hero */}
      <View style={styles.hero}>
        <Image source={require("../../assets/icon.png")} style={styles.heroLogo} resizeMode="cover" />
        {isSignedIn && editingName ? (
          <View style={styles.editRow}>
            <TextInput
              style={styles.editInput}
              value={draftName}
              onChangeText={setDraftName}
              autoFocus
              placeholder="Your display name"
              placeholderTextColor={colors.inkSofter}
            />
            <Pressable style={styles.editSaveBtn} onPress={saveDisplayName} disabled={savingName}>
              <Text style={styles.editSaveBtnText}>{savingName ? "…" : "Save"}</Text>
            </Pressable>
            <Pressable onPress={() => setEditingName(false)}>
              <Ionicons name="close-circle" size={24} color={colors.inkSofter} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={styles.nameRow}
            onPress={isSignedIn ? () => { setDraftName(displayName || ""); setEditingName(true); } : undefined}
            disabled={!isSignedIn}
          >
            <Text style={styles.heroTitle}>{greeting}</Text>
            {isSignedIn && <Ionicons name="pencil-outline" size={16} color={colors.inkSofter} />}
          </Pressable>
        )}
        <Text style={styles.heroSubtitle}>{subtitle}</Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <Stat icon="business-outline" label="Merchants" value={orgs.length} />
        <Stat icon="star-outline" label="Points" value={totalPoints} />
        <Stat icon="ribbon-outline" label="Stamps" value={totalStamps} />
      </View>

      {/* Switch to merchant */}
      {isMerchant && (
        <Card>
          <Pressable style={styles.switchBtn} onPress={() => router.replace("/(merchant)")}>
            <Ionicons name="storefront" size={20} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Switch to merchant view</Text>
              <Text style={styles.switchBody}>Manage your business, scan codes, and view offers</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkSofter} />
          </Pressable>
        </Card>
      )}

      {/* Account */}
      <Card>
        <View style={styles.cardHeader}>
          <Ionicons name="log-out-outline" size={20} color={colors.accent} />
          <Text style={styles.cardTitle}>Account</Text>
        </View>
        <Text style={styles.cardBody}>
          Sign out and restart the onboarding flow to switch accounts or explore as a different user.
        </Text>
        <Pressable style={styles.btn} onPress={confirmSignOut}>
          <Ionicons name="refresh-outline" size={16} color="#fff" />
          <Text style={styles.btnText}>Sign out and restart</Text>
        </Pressable>
      </Card>

      {/* Notifications */}
      <Card>
        <View style={styles.cardHeader}>
          <Ionicons name="notifications-outline" size={20} color={colors.accent} />
          <Text style={styles.cardTitle}>Notifications</Text>
        </View>
        {isExpoGo ? (
          <View style={{ gap: space(2) }}>
            <Text style={styles.cardBody}>
              Push notifications need a dev build. They're disabled in Expo Go.
            </Text>
            <View style={styles.infoBadge}>
              <Ionicons name="information-circle" size={14} color={colors.accent} />
              <Text style={styles.infoBadgeText}>Build the Nearby dev client to enable</Text>
            </View>
          </View>
        ) : (
          <View style={{ gap: space(2) }}>
            <Text style={styles.cardBody}>
              {pushStatus === "registered" ? pushMsg
                : pushStatus === "error" ? `Couldn't enable: ${pushMsg}`
                : "Get a quiet ping when an offer drops within 8 km."}
            </Text>
            <Pressable
              style={[styles.btn, pushStatus === "registered" && styles.btnGreen]}
              onPress={enablePush}
              disabled={pushStatus === "pending" || pushStatus === "registered"}
            >
              <Text style={styles.btnText}>
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
        <View style={styles.cardHeader}>
          <Ionicons name="sparkles-outline" size={20} color={colors.accent} />
          <Text style={styles.cardTitle}>About Nearby</Text>
        </View>
        <Text style={styles.cardBody}>
          Nearby surfaces real, hyper-local offers from places within walking
          distance. Every offer is generated for the moment — current weather,
          time of day, foot traffic — and approved by the merchant. No spam,
          no fake deals.
        </Text>
        <Text style={styles.version}>Version 0.1.0</Text>
      </Card>

      {/* Debug */}
      <Pressable style={styles.disclosure} onPress={() => setShowDebug((s) => !s)}>
        <Ionicons name={showDebug ? "chevron-down" : "chevron-forward"} size={16} color={colors.inkSofter} />
        <Text style={styles.disclosureText}>Developer info</Text>
      </Pressable>

      {showDebug && (
        <Card>
          <DebugRow label="Session id" value={sid || "—"} mono />
          <DebugRow label="API base" value={apiBaseUrl} mono />
          <DebugRow label="Runtime" value={isExpoGo ? "Expo Go" : "Dev / standalone"} />
          <Pressable
            style={[styles.btn, styles.btnDark, { marginTop: space(2) }]}
            onPress={() => router.push("/scanner")}
          >
            <Ionicons name="qr-code-outline" size={16} color="#fff" />
            <Text style={styles.btnText}>Open merchant scanner</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.btnGhost, { marginTop: space(2) }]}
            onPress={signOutAndRestart}
          >
            <Text style={[styles.btnText, { color: colors.inkSoft }]}>Reset onboarding</Text>
          </Pressable>
        </Card>
      )}
    </ScrollView>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function Stat({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function DebugRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.debugRow}>
      <Text style={styles.debugLabel}>{label}</Text>
      <Text style={[styles.debugValue, mono && styles.mono]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: space(4), gap: space(3), paddingBottom: space(10) },
  hero: { alignItems: "center", gap: space(1.5), paddingVertical: space(4) },
  heroLogo: { width: 72, height: 72, borderRadius: 18, marginBottom: space(1) },
  heroTitle: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  heroSubtitle: { color: colors.inkSoft, fontSize: 13, textAlign: "center", paddingHorizontal: space(6), lineHeight: 18 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
  editRow: { flexDirection: "row", alignItems: "center", gap: space(2), paddingHorizontal: space(4), width: "100%" },
  editInput: { flex: 1, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(3), paddingVertical: space(2), fontSize: 16, color: colors.ink },
  editSaveBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(2) },
  editSaveBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  statsRow: { flexDirection: "row", gap: space(2) },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(3), alignItems: "center", gap: space(1) },
  statValue: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  statLabel: { color: colors.inkSofter, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  card: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: space(4), gap: space(2) },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: space(2) },
  cardTitle: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  cardBody: { color: colors.inkSoft, fontSize: 14, lineHeight: 20 },
  version: { color: colors.inkSofter, fontSize: 12 },
  infoBadge: { flexDirection: "row", alignItems: "center", gap: space(1.5), backgroundColor: colors.accentSoft, alignSelf: "flex-start", paddingVertical: space(1.5), paddingHorizontal: space(2.5), borderRadius: radius.pill },
  infoBadgeText: { color: colors.accent, fontSize: 12, fontWeight: "600" },
  btn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: space(2.5), alignItems: "center", flexDirection: "row", justifyContent: "center", gap: space(2) },
  btnGreen: { backgroundColor: colors.green },
  btnDark: { backgroundColor: colors.ink },
  btnGhost: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  btnText: { color: "white", fontWeight: "700", fontSize: 14 },
  disclosure: { flexDirection: "row", alignItems: "center", gap: space(1.5), paddingVertical: space(2), paddingHorizontal: space(2) },
  disclosureText: { color: colors.inkSofter, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  debugRow: { gap: 2, paddingVertical: space(1.5) },
  debugLabel: { color: colors.inkSofter, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  debugValue: { color: colors.ink, fontSize: 13 },
  mono: { fontFamily: "Menlo", fontSize: 11, color: colors.inkSoft },
  switchBtn: { flexDirection: "row", alignItems: "center", gap: space(3) },
  switchTitle: { color: colors.ink, fontWeight: "700", fontSize: 15 },
  switchBody: { color: colors.inkSoft, fontSize: 13 },
});
