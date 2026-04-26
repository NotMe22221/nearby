import { useState } from "react";
import {
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
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors, radius, space } from "@/lib/theme";

type Mode = "sign-in" | "sign-up";

export default function MerchantAuth() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function addRole(role: string) {
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const roles: string[] = (user.user_metadata?.roles as string[]) ?? [];
      if (!roles.includes(role)) {
        await supabase.auth.updateUser({
          data: { roles: [...roles, role] },
        });
      }
    } catch {
      // non-fatal
    }
  }

  async function trySignIn(): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return false;
    await addRole("merchant");
    return true;
  }

  async function submit() {
    if (!supabase) {
      Alert.alert("Config error", "Supabase is not configured.");
      return;
    }
    if (!email || !password) {
      Alert.alert("Missing fields", "Please enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          if (error.message?.toLowerCase().includes("email not confirmed")) {
            Alert.alert(
              "Email not confirmed",
              "Check your inbox and click the confirmation link, then try signing in again.",
            );
          } else {
            throw error;
          }
          return;
        }
        await addRole("merchant");
        openDashboard();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { roles: ["merchant"] } },
        });
        if (error) {
          if (error.message?.toLowerCase().includes("already registered")) {
            const signedIn = await trySignIn();
            if (signedIn) {
              openDashboard();
            } else {
              Alert.alert(
                "Account exists",
                "An account with this email already exists but the password doesn't match. Switch to Sign in and use the original password.",
              );
            }
          } else {
            throw error;
          }
        } else if (data.session) {
          await addRole("merchant");
          openDashboard();
        } else {
          Alert.alert(
            "Account created",
            "Check your email to confirm, then sign in.",
          );
          setMode("sign-in");
        }
      }
    } catch (err) {
      Alert.alert(
        "Auth error",
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  }

  function openDashboard() {
    router.replace("/(merchant)");
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + space(4) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/onboarding")
          }
          style={styles.back}
        >
          <Ionicons name="arrow-back" size={20} color={colors.ink} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <View style={styles.header}>
          <Ionicons name="storefront" size={32} color={colors.accent} />
          <Text style={styles.title}>Merchant account</Text>
          <Text style={styles.subtitle}>
            Manage your offers, view redemptions, connect Square POS, and track
            loyalty — all from the Nearby merchant dashboard.
          </Text>
        </View>

        <View style={styles.toggle}>
          <Pressable
            style={[styles.toggleBtn, mode === "sign-in" && styles.toggleActive]}
            onPress={() => setMode("sign-in")}
          >
            <Text
              style={[
                styles.toggleText,
                mode === "sign-in" && styles.toggleTextActive,
              ]}
            >
              Sign in
            </Text>
          </Pressable>
          <Pressable
            style={[styles.toggleBtn, mode === "sign-up" && styles.toggleActive]}
            onPress={() => setMode("sign-up")}
          >
            <Text
              style={[
                styles.toggleText,
                mode === "sign-up" && styles.toggleTextActive,
              ]}
            >
              Create account
            </Text>
          </Pressable>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@business.com"
            placeholderTextColor={colors.inkSofter}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />

          <Text style={[styles.label, { marginTop: space(3) }]}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder={mode === "sign-up" ? "Min 6 characters" : "Password"}
            placeholderTextColor={colors.inkSofter}
            secureTextEntry
            autoComplete={
              mode === "sign-in" ? "current-password" : "new-password"
            }
          />

          <Pressable
            style={[styles.submitBtn, busy && { opacity: 0.6 }]}
            onPress={submit}
            disabled={busy}
          >
            <Text style={styles.submitText}>
              {busy
                ? "Working…"
                : mode === "sign-in"
                  ? "Sign in"
                  : "Create account"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.hint}>
          <Ionicons name="globe-outline" size={16} color={colors.inkSofter} />
          <Text style={styles.hintText}>
            After signing in, you'll see your merchant dashboard with scanner,
            offers, and stats right in the app.
          </Text>
        </View>

        <Pressable
          style={styles.guestLink}
          onPress={() => router.replace("/(tabs)")}
        >
          <Text style={styles.guestLinkText}>Continue as guest instead</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  container: { padding: space(6), gap: space(4), flexGrow: 1 },
  back: { flexDirection: "row", alignItems: "center", gap: space(1) },
  backText: { color: colors.ink, fontWeight: "600" },
  header: { gap: space(2), marginTop: space(2) },
  title: { color: colors.ink, fontSize: 24, fontWeight: "800" },
  subtitle: { color: colors.inkSoft, fontSize: 15, lineHeight: 22 },
  toggle: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: space(2.5),
    alignItems: "center",
    borderRadius: radius.sm,
  },
  toggleActive: { backgroundColor: colors.accent },
  toggleText: { color: colors.inkSoft, fontWeight: "600", fontSize: 14 },
  toggleTextActive: { color: "#fff" },
  form: { gap: space(1) },
  label: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    fontSize: 16,
    color: colors.ink,
  },
  submitBtn: {
    marginTop: space(4),
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space(3.5),
    alignItems: "center",
  },
  submitText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  hint: {
    flexDirection: "row",
    gap: space(2),
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space(3),
  },
  hintText: { color: colors.inkSoft, fontSize: 12, lineHeight: 18, flex: 1 },
  guestLink: { alignItems: "center", paddingVertical: space(2) },
  guestLinkText: { color: colors.inkSofter, fontWeight: "600", fontSize: 14 },
});
