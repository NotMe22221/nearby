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
import { api } from "@/lib/api";
import { colors, radius, space } from "@/lib/theme";

export default function ScannerScreen() {
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
    if (busy) return;
    if (lastScannedRef.current === payload) return;
    lastScannedRef.current = payload;
    setBusy(true);
    try {
      const r =
        method === "qr"
          ? await api.merchantRedeem({ payload, method })
          : await api.merchantRedeem({ code: payload, method });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLast(`Redeemed · ${r.discount_pct}% off${r.already ? " (already)" : ""}`);
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
          Camera permission is required to scan QR codes.
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
            placeholder="ABCD-1234"
            placeholderTextColor={colors.inkSofter}
            style={styles.input}
          />
          <Pressable
            style={styles.btn}
            disabled={busy || !code}
            onPress={() => submit(code.trim().toUpperCase(), "code")}
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
    fontFamily: "Menlo",
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
