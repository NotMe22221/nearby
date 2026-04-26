import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { colors, radius, space } from "@/lib/theme";

export default function ConfirmedScreen() {
  useLocalSearchParams<{ id: string }>();

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.confetti}>
        {[..."✦✦✦✧✧✧"].map((c, i) => (
          <Text
            key={i}
            style={[
              styles.confettiBit,
              {
                color: i % 2 === 0 ? colors.accent : colors.green,
                transform: [
                  { rotate: `${i * 30}deg` },
                  { translateY: -i * 4 },
                ],
              },
            ]}
          >
            {c}
          </Text>
        ))}
      </View>
      <Text style={styles.title}>Redeemed!</Text>
      <Text style={styles.subtitle}>
        Show this screen at the register if asked.
      </Text>
      <Pressable
        style={styles.btn}
        onPress={() => router.replace("/(tabs)/wallet")}
      >
        <Text style={styles.btnText}>View wallet</Text>
      </Pressable>
      <Pressable onPress={() => router.replace("/(tabs)")}>
        <Text style={styles.link}>Back to offers</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space(6),
    gap: space(4),
  },
  confetti: {
    flexDirection: "row",
    gap: space(2),
  },
  confettiBit: { fontSize: 28 },
  title: { color: colors.ink, fontSize: 32, fontWeight: "800" },
  subtitle: { color: colors.inkSoft, fontSize: 14, textAlign: "center" },
  btn: {
    backgroundColor: colors.accent,
    paddingVertical: space(3.5),
    paddingHorizontal: space(8),
    borderRadius: radius.pill,
  },
  btnText: { color: "white", fontWeight: "700", fontSize: 16 },
  link: { color: colors.accent, fontSize: 14, marginTop: space(2) },
});
