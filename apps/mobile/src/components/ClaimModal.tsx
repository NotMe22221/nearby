import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { sendClaimEmail } from "@/lib/email";
import { saveClaim } from "@/lib/claims";
import { colors, radius, space } from "@/lib/theme";

interface ClaimModalProps {
  visible: boolean;
  onClose: () => void;
  businessName: string;
  offerHeadline: string;
  isLoggedIn: boolean;
  onClaimed?: () => void;
}

export default function ClaimModal({
  visible,
  onClose,
  businessName,
  offerHeadline,
  isLoggedIn,
  onClaimed,
}: ClaimModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setName("");
    setEmail("");
    setPhone("");
    setBusy(false);
  }

  async function submit() {
    if (!isLoggedIn && (!name.trim() || !email.trim())) {
      Alert.alert("Missing info", "Please enter your name and email.");
      return;
    }
    if (isLoggedIn && !phone.trim()) {
      Alert.alert("Missing info", "Please enter your phone number.");
      return;
    }

    setBusy(true);

    try {
      const recipientEmail = isLoggedIn ? `${phone.trim()}@placeholder.local` : email.trim();
      const recipientName = isLoggedIn ? "Customer" : name.trim();

      const result = await sendClaimEmail(
        recipientEmail,
        recipientName,
        businessName,
        offerHeadline,
      );

      const code = result.ok ? result.code : "------";

      await saveClaim({
        businessName,
        offerHeadline,
        code,
        email: isLoggedIn ? phone.trim() : email.trim(),
      });

      reset();
      onClose();
      onClaimed?.();

      Alert.alert(
        "Offer claimed!",
        `Your "${offerHeadline}" offer at ${businessName} has been reserved.${
          result.ok
            ? ` Your code is ${code}.${
                isLoggedIn
                  ? ""
                  : " Check your email for details."
              }`
            : " Your code is saved in your wallet."
        }`,
      );
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Claim offer</Text>
              <Text style={styles.subtitle}>
                {offerHeadline} at {businessName}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.inkSofter} />
            </Pressable>
          </View>

          {isLoggedIn ? (
            <View style={styles.form}>
              <Text style={styles.label}>Phone number</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="(555) 555-1234"
                placeholderTextColor={colors.inkSofter}
                keyboardType="phone-pad"
                autoComplete="tel"
              />
              <Text style={styles.hint}>
                We'll send the offer code to this number.
              </Text>
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={styles.label}>Your name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Jane Doe"
                placeholderTextColor={colors.inkSofter}
                autoComplete="name"
              />
              <Text style={[styles.label, { marginTop: space(3) }]}>
                Email
              </Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.inkSofter}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
              <Text style={styles.hint}>
                We'll email you the offer code and details.
              </Text>
            </View>
          )}

          <Pressable
            style={[styles.submitBtn, busy && { opacity: 0.6 }]}
            onPress={submit}
            disabled={busy}
          >
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.submitText}>
              {busy ? "Claiming…" : "Claim this offer"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: space(6),
    gap: space(4),
    paddingBottom: space(10),
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space(3),
  },
  title: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  subtitle: { color: colors.inkSoft, fontSize: 14, marginTop: 2 },
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
  hint: {
    color: colors.inkSofter,
    fontSize: 12,
    marginTop: space(1),
  },
  submitBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space(3.5),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(2),
  },
  submitText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
