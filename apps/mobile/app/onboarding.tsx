import { useRef, useState } from "react";
import {
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { router } from "expo-router";
import { registerForPush } from "@/lib/push";
import { colors, radius, space } from "@/lib/theme";

const { width: SCREEN_W } = Dimensions.get("window");
const PAGE_PAD = space(7);
const CONTENT_W = SCREEN_W - PAGE_PAD * 2;
const ONBOARDED_KEY = "nearby.onboarded";
const isExpoGo = Constants.appOwnership === "expo";
const TOTAL_PAGES = 4;

type PermStatus = "idle" | "pending" | "granted" | "denied";

export default function Onboarding() {
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [locStatus, setLocStatus] = useState<PermStatus>("idle");
  const [pushStatus, setPushStatus] = useState<PermStatus>("idle");
  const insets = useSafeAreaInsets();

  function go(next: number) {
    scrollRef.current?.scrollTo({ x: next * SCREEN_W, animated: true });
    setPage(next);
  }

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (idx !== page) setPage(idx);
  }

  async function requestLocation() {
    setLocStatus("pending");
    const { status } = await Location.requestForegroundPermissionsAsync();
    setLocStatus(status === "granted" ? "granted" : "denied");
  }

  async function requestPush() {
    setPushStatus("pending");
    const r = await registerForPush();
    setPushStatus(r.ok ? "granted" : "denied");
  }

  async function finishAsGuest() {
    await SecureStore.setItemAsync(ONBOARDED_KEY, "1");
    router.replace("/(tabs)");
  }

  async function goToCustomerAuth() {
    await SecureStore.setItemAsync(ONBOARDED_KEY, "1");
    router.replace("/auth/customer");
  }

  async function goToMerchantAuth() {
    await SecureStore.setItemAsync(ONBOARDED_KEY, "1");
    router.replace("/auth/merchant");
  }

  const isLastPage = page === TOTAL_PAGES - 1;

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={{ flex: 1 }}
      >
        <PageOne />
        <PageTwo />
        <PagePerms
          locStatus={locStatus}
          pushStatus={pushStatus}
          onRequestLocation={requestLocation}
          onRequestPush={requestPush}
        />
        <PageAuth
          onCustomer={goToCustomerAuth}
          onMerchant={goToMerchantAuth}
          onGuest={finishAsGuest}
        />
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, space(6)) + space(2) },
        ]}
      >
        <View style={styles.dots}>
          {Array.from({ length: TOTAL_PAGES }).map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === page && styles.dotActive]}
            />
          ))}
        </View>

        {!isLastPage && (
          <>
            <Pressable style={styles.cta} onPress={() => go(page + 1)}>
              <Text style={styles.ctaText}>Continue</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </Pressable>
            <Pressable onPress={finishAsGuest} style={styles.skip}>
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

function PageOne() {
  return (
    <View style={[styles.page, { width: SCREEN_W }]}>
      <Image
        source={require("../assets/icon.png")}
        style={styles.logo}
        resizeMode="cover"
      />
      <Text style={styles.eyebrow}>Welcome to Nearby</Text>
      <Text style={styles.headline}>
        Real offers from real places near you.
      </Text>
      <Text style={styles.body}>
        No spam. No fake deals. Just hand-picked, AI-crafted perks from the
        coffee shop down the street and the boutique around the corner.
      </Text>
    </View>
  );
}

function PageTwo() {
  return (
    <View style={[styles.page, { width: SCREEN_W }]}>
      <View style={styles.iconBubble}>
        <Ionicons name="navigate" size={42} color={colors.accent} />
      </View>
      <Text style={styles.eyebrow}>How it works</Text>
      <Text style={styles.headline}>Three steps. That's it.</Text>
      <View style={[styles.steps, { width: CONTENT_W }]}>
        <Step
          n={1}
          title="Allow location"
          body="We show offers within 8 km of you, in real time."
        />
        <Step
          n={2}
          title="Tap to redeem"
          body="Show your QR, the merchant scans, instant savings."
        />
        <Step
          n={3}
          title="Earn loyalty"
          body="Stamps and points stack at every place you visit."
        />
      </View>
    </View>
  );
}

function PagePerms({
  locStatus,
  pushStatus,
  onRequestLocation,
  onRequestPush,
}: {
  locStatus: PermStatus;
  pushStatus: PermStatus;
  onRequestLocation: () => void;
  onRequestPush: () => void;
}) {
  return (
    <View style={[styles.page, { width: SCREEN_W }]}>
      <View style={styles.iconBubble}>
        <Ionicons name="shield-checkmark" size={42} color={colors.accent} />
      </View>
      <Text style={styles.eyebrow}>Quick permissions</Text>
      <Text style={styles.headline}>Two taps and you're in.</Text>
      <View style={[styles.permList, { width: CONTENT_W }]}>
        <PermRow
          icon="location"
          title="Location"
          body="To show offers near you. Used only while the app is open."
          status={locStatus}
          onPress={onRequestLocation}
        />
        <PermRow
          icon="notifications"
          title="Notifications"
          body={
            isExpoGo
              ? "Available in the Nearby dev build (not in Expo Go)."
              : "We'll ping you when a hot offer drops nearby. Quiet otherwise."
          }
          status={isExpoGo ? "denied" : pushStatus}
          onPress={onRequestPush}
          disabled={isExpoGo}
        />
      </View>
    </View>
  );
}

function PageAuth({
  onCustomer,
  onMerchant,
  onGuest,
}: {
  onCustomer: () => void;
  onMerchant: () => void;
  onGuest: () => void;
}) {
  return (
    <View style={[styles.page, { width: SCREEN_W }]}>
      <View style={styles.iconBubble}>
        <Ionicons name="person-add" size={42} color={colors.accent} />
      </View>
      <Text style={styles.eyebrow}>Almost there</Text>
      <Text style={styles.headline}>How would you like to continue?</Text>
      <View style={[styles.authList, { width: CONTENT_W }]}>
        <Pressable style={styles.authCard} onPress={onCustomer}>
          <View style={styles.authIcon}>
            <Ionicons name="bag-handle-outline" size={24} color={colors.accent} />
          </View>
          <View style={styles.authTextWrap}>
            <Text style={styles.authTitle}>I'm a customer</Text>
            <Text style={styles.authBody}>
              Sign up or log in to save your wallet and earn loyalty across
              devices.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.inkSofter} />
        </Pressable>

        <Pressable style={styles.authCard} onPress={onMerchant}>
          <View style={styles.authIcon}>
            <Ionicons name="storefront-outline" size={24} color={colors.accent} />
          </View>
          <View style={styles.authTextWrap}>
            <Text style={styles.authTitle}>I'm a merchant</Text>
            <Text style={styles.authBody}>
              Log in to manage your offers, view redemptions, and connect your
              POS.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.inkSofter} />
        </Pressable>

        <Pressable style={styles.guestBtn} onPress={onGuest}>
          <Ionicons name="eye-outline" size={18} color={colors.inkSoft} />
          <Text style={styles.guestBtnText}>Continue as guest</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <View style={styles.stepText}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepBody}>{body}</Text>
      </View>
    </View>
  );
}

function PermRow({
  icon,
  title,
  body,
  status,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  status: PermStatus;
  onPress: () => void;
  disabled?: boolean;
}) {
  const granted = status === "granted";
  const pending = status === "pending";
  return (
    <View style={styles.permRow}>
      <View style={styles.permIcon}>
        <Ionicons name={icon} size={22} color={colors.accent} />
      </View>
      <View style={styles.permText}>
        <Text style={styles.permTitle}>{title}</Text>
        <Text style={styles.permBody}>{body}</Text>
      </View>
      <Pressable
        disabled={disabled || granted || pending}
        onPress={onPress}
        style={[
          styles.permBtn,
          granted && styles.permBtnGranted,
          disabled && styles.permBtnDisabled,
        ]}
      >
        {granted ? (
          <Ionicons name="checkmark" size={18} color="#fff" />
        ) : (
          <Text style={styles.permBtnText}>
            {pending ? "…" : disabled ? "—" : "Allow"}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  page: {
    flex: 1,
    paddingHorizontal: PAGE_PAD,
    paddingTop: space(20),
    alignItems: "flex-start",
    gap: space(3),
  },
  logo: {
    width: 88,
    height: 88,
    borderRadius: 22,
    marginBottom: space(2),
  },
  iconBubble: {
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space(2),
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  headline: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
  },
  body: {
    color: colors.inkSoft,
    fontSize: 16,
    lineHeight: 24,
  },
  steps: { gap: space(4), marginTop: space(2) },
  step: {
    flexDirection: "row",
    gap: space(3),
    alignItems: "flex-start",
    width: "100%",
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stepNumText: { color: "#fff", fontWeight: "800" },
  stepText: { flexShrink: 1, flex: 1 },
  stepTitle: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  stepBody: { color: colors.inkSoft, fontSize: 14, lineHeight: 20 },
  permList: { gap: space(3), marginTop: space(2) },
  permRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(4),
    width: "100%",
  },
  permIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  permText: { flex: 1, flexShrink: 1 },
  permTitle: { color: colors.ink, fontWeight: "700", fontSize: 15 },
  permBody: { color: colors.inkSoft, fontSize: 12, lineHeight: 18 },
  permBtn: {
    minWidth: 64,
    paddingVertical: space(2),
    paddingHorizontal: space(3),
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  permBtnGranted: { backgroundColor: colors.green },
  permBtnDisabled: { backgroundColor: colors.inkSofter },
  permBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  authList: { gap: space(3), marginTop: space(2) },
  authCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(4),
    width: "100%",
  },
  authIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  authTextWrap: { flex: 1, flexShrink: 1 },
  authTitle: { color: colors.ink, fontWeight: "700", fontSize: 16 },
  authBody: { color: colors.inkSoft, fontSize: 13, lineHeight: 18, marginTop: 2 },
  guestBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(2),
    paddingVertical: space(3),
    marginTop: space(1),
  },
  guestBtnText: { color: colors.inkSoft, fontWeight: "600", fontSize: 15 },
  footer: {
    paddingHorizontal: PAGE_PAD,
    paddingTop: space(2),
    gap: space(2),
  },
  dots: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    paddingVertical: space(3),
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: { backgroundColor: colors.accent, width: 24 },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space(3.5),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(2),
  },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  skip: { alignItems: "center", paddingVertical: space(2) },
  skipText: { color: colors.inkSofter, fontWeight: "600", fontSize: 14 },
});
