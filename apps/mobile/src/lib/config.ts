import Constants from "expo-constants";

type Extra = {
  apiBaseUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  stripePublishableKey?: string;
  googlePlacesApiKey?: string;
  resendApiKey?: string;
};

const extra = (Constants.expoConfig?.extra as Extra | undefined) ?? {};

export const apiBaseUrl: string =
  extra.apiBaseUrl ||
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "http://localhost:3000";

export const supabaseUrl: string =
  extra.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || "";

export const supabaseAnonKey: string =
  extra.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

export const stripePublishableKey: string =
  extra.stripePublishableKey ||
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
  "";

export const googlePlacesApiKey: string =
  extra.googlePlacesApiKey ||
  process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ||
  "";

export const resendApiKey: string =
  extra.resendApiKey ||
  process.env.EXPO_PUBLIC_RESEND_API_KEY ||
  "";
