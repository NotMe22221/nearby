import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "nearby.claims";

export interface ClaimedOffer {
  id: string;
  businessName: string;
  offerHeadline: string;
  code: string;
  email: string;
  claimedAt: string;
}

export async function saveClaim(
  claim: Omit<ClaimedOffer, "id" | "claimedAt">,
): Promise<ClaimedOffer> {
  const entry: ClaimedOffer = {
    ...claim,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    claimedAt: new Date().toISOString(),
  };
  const existing = await getClaims();
  existing.unshift(entry);
  await AsyncStorage.setItem(KEY, JSON.stringify(existing));
  return entry;
}

export async function getClaims(): Promise<ClaimedOffer[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ClaimedOffer[];
  } catch {
    return [];
  }
}

export async function clearClaims(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
