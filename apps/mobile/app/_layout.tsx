import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StripeProvider } from "@stripe/stripe-react-native";
import * as SecureStore from "expo-secure-store";
import { stripePublishableKey } from "@/lib/config";
import { colors } from "@/lib/theme";

const ONBOARDED_KEY = "nearby.onboarded";

export default function RootLayout() {
  const [checked, setChecked] = useState(false);
  const [onboarded, setOnboarded] = useState(true);

  useEffect(() => {
    SecureStore.getItemAsync(ONBOARDED_KEY)
      .then((v) => {
        setOnboarded(!!v);
        setChecked(true);
      })
      .catch(() => setChecked(true));
  }, []);

  const inner = (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: "#FFFFFF" },
            headerTintColor: "#0F172A",
            headerTitleStyle: { fontWeight: "600" },
            contentStyle: { backgroundColor: "#F8FAFC" },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="offer/[id]" options={{ title: "Offer" }} />
          <Stack.Screen name="redeem/[id]" options={{ title: "Redeem" }} />
          <Stack.Screen
            name="confirmed/[id]"
            options={{ title: "Confirmed", headerBackVisible: false }}
          />
          <Stack.Screen name="scanner" options={{ title: "Scanner" }} />
          <Stack.Screen
            name="business/[id]"
            options={{ title: "" }}
          />
          <Stack.Screen
            name="auth/customer"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="auth/merchant"
            options={{ headerShown: false }}
          />
        </Stack>

        {!checked && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "#FFFFFF",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        )}

        {checked && !onboarded && <Redirect href="/onboarding" />}
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );

  if (stripePublishableKey) {
    return (
      <StripeProvider
        publishableKey={stripePublishableKey}
        merchantIdentifier="merchant.com.citywallet.app"
      >
        {inner}
      </StripeProvider>
    );
  }
  return inner;
}
