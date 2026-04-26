import * as SecureStore from "expo-secure-store";

const KEY = "nearby.session";

let cached: string | null = null;

export async function getSessionId(): Promise<string> {
  if (cached) return cached;
  const existing = await SecureStore.getItemAsync(KEY);
  if (existing) {
    cached = existing;
    return existing;
  }
  const fresh =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await SecureStore.setItemAsync(KEY, fresh);
  cached = fresh;
  return fresh;
}
