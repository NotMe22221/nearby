"use client";

const KEY = "city-wallet:session";

export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  let sid = window.localStorage.getItem(KEY);
  if (!sid) {
    sid =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    window.localStorage.setItem(KEY, sid);
  }
  return sid;
}

const ACCEPTED_KEY = "city-wallet:accepted";
const DISMISSED_KEY = "city-wallet:dismissed";

function readSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeSet(key: string, set: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(Array.from(set)));
}

export function acceptOfferLocal(offerId: string) {
  const s = readSet(ACCEPTED_KEY);
  s.add(offerId);
  writeSet(ACCEPTED_KEY, s);
}

export function dismissOfferLocal(offerId: string) {
  const s = readSet(DISMISSED_KEY);
  s.add(offerId);
  writeSet(DISMISSED_KEY, s);
}

export function isAcceptedLocal(offerId: string): boolean {
  return readSet(ACCEPTED_KEY).has(offerId);
}

export function isDismissedLocal(offerId: string): boolean {
  return readSet(DISMISSED_KEY).has(offerId);
}
