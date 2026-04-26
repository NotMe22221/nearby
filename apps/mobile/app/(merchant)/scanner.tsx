import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { colors, radius, space } from "@/lib/theme";

export default function MerchantScanner() {
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [last, setLast] = useState<string | null>(null);
  const lastScannedRef = useRef<string | null>(null);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  async function submit(payload: string, method: "qr" | "code") {
    if (busy || !supabase) return;
    if (lastScannedRef.current === payload) return;
    lastScannedRef.current = payload;
    setBusy(true);
    try {
      let redeemCode = payload.trim();

      // If QR payload is JSON, extract the code from it
      if (redeemCode.startsWith("{")) {
        try {
          const obj = JSON.parse(redeemCode);
          if (obj.code) redeemCode = obj.code;
        } catch { /* use raw */ }
      }

      const { data, error } = await supabase.rpc("redeem_offer_by_code", {
        p_code: redeemCode,
      });

      if (error) {
        throw new Error(error.message);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLast(
        `Redeemed · ${data?.discount_pct ?? 0}% off (${data?.redemptions_count ?? 0}/${data?.max_redemptions ?? 0} used)`,
      );
    } catch (e: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Redemption failed", msg);
    } finally {
      setTimeout(() => {
        lastScannedRef.current = null;
        setBusy(false);
      }, 1500);
    }
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Requesting camera permission…</Text>
      </View>
    );
  }
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>
          Camera permission is required to scan customer QR codes.
        </Text>
        <Pressable style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant access</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={(result) => {
          if (result.data) submit(result.data, "qr");
        }}
      />
      <View style={styles.bottom}>
        {last && <Text style={styles.success}>{last}</Text>}
        <Text style={styles.label}>Or type a code</Text>
        <View style={{ flexDirection: "row", gap: space(2) }}>
          <TextInput
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            placeholder="e.g. 49952973"
            placeholderTextColor={colors.inkSofter}
            style={styles.input}
          />
          <Pressable
            style={styles.btn}
            disabled={busy || !code}
            onPress={() => submit(code.trim(), "code")}
          >
            <Text style={styles.btnText}>Apply</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space(6),
    gap: space(3),
  },
  muted: { color: colors.inkSoft, textAlign: "center" },
  bottom: {
    backgroundColor: colors.card,
    padding: space(4),
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: space(2),
  },
  label: {
    color: colors.inkSoft,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    flex: 1,
    color: colors.ink,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space(3),
    paddingVertical: space(3),
    fontFamily: "monospace",
    letterSpacing: 2,
  },
  btn: {
    backgroundColor: colors.accent,
    paddingVertical: space(3),
    paddingHorizontal: space(4),
    borderRadius: radius.md,
    justifyContent: "center",
  },
  btnText: { color: "white", fontWeight: "600" },
  success: { color: colors.green, fontSize: 14, fontWeight: "600" },
});
