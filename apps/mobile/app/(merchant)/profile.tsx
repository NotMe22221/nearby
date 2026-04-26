import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { clearClaims } from "@/lib/claims";
import { colors, radius, space } from "@/lib/theme";

const ONBOARDED_KEY = "nearby.onboarded";

export default function MerchantProfile() {
  const [email, setEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [roles, setRoles] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      if (!supabase) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? "");
      setRoles((user.user_metadata?.roles as string[]) ?? []);

      const { data: memberships } = await supabase
        .from("memberships")
        .select("organizations(name)")
        .eq("user_id", user.id)
        .limit(1);

      if (memberships && memberships.length > 0) {
        setOrgName((memberships[0] as any).organizations?.name ?? "");
      }
    })();
  }, []);

  async function signOutAndRestart() {
    try {
      if (supabase) await supabase.auth.signOut();
    } catch {
      // non-fatal
    }
    await clearClaims();
    await SecureStore.deleteItemAsync(ONBOARDED_KEY);
    router.replace("/onboarding");
  }

  function confirmSignOut() {
    Alert.alert(
      "Sign out",
      "This will sign you out and restart the onboarding flow. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: signOutAndRestart },
      ],
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.container}
    >
      <View style={styles.hero}>
        <Image
          source={require("../../assets/icon.png")}
          style={styles.heroLogo}
          resizeMode="cover"
        />
        <Text style={styles.heroTitle}>{orgName || "Merchant"}</Text>
        <Text style={styles.heroEmail}>{email}</Text>
        <View style={styles.roleBadges}>
          {roles.map((role) => (
            <View key={role} style={styles.roleBadge}>
              <Ionicons
                name={role === "merchant" ? "storefront" : "bag-handle"}
                size={12}
                color={colors.accent}
              />
              <Text style={styles.roleBadgeText}>
                {role.charAt(0).toUpperCase() + role.slice(1)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {roles.includes("customer") && (
        <Card>
          <Pressable
            style={styles.switchBtn}
            onPress={() => router.replace("/(tabs)")}
          >
            <Ionicons name="swap-horizontal" size={20} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Switch to customer view</Text>
              <Text style={styles.switchBody}>
                Browse offers and earn loyalty as a customer
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.inkSofter}
            />
          </Pressable>
        </Card>
      )}

      <Card>
        <View style={styles.cardHeader}>
          <Ionicons name="log-out-outline" size={20} color={colors.accent} />
          <Text style={styles.cardTitle}>Account</Text>
        </View>
        <Pressable style={styles.signOutBtn} onPress={confirmSignOut}>
          <Ionicons name="refresh-outline" size={16} color="#fff" />
          <Text style={styles.signOutText}>Sign out and restart</Text>
        </Pressable>
      </Card>
    </ScrollView>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  container: { padding: space(4), gap: space(3), paddingBottom: space(10) },
  hero: { alignItems: "center", gap: space(1), paddingVertical: space(4) },
  heroLogo: {
    width: 72,
    height: 72,
    borderRadius: 18,
    marginBottom: space(1),
  },
  heroTitle: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  heroEmail: { color: colors.inkSoft, fontSize: 14 },
  roleBadges: {
    flexDirection: "row",
    gap: space(2),
    marginTop: space(1),
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
    borderRadius: radius.pill,
  },
  roleBadgeText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "600",
  },
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
  switchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
  },
  switchTitle: { color: colors.ink, fontWeight: "700", fontSize: 15 },
  switchBody: { color: colors.inkSoft, fontSize: 13 },
  signOutBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space(2.5),
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: space(2),
  },
  signOutText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
