import type { SlowHour } from "@/lib/supabase/types";

export const DAY_LABELS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

export const FULL_DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return h * 60 + (m || 0);
}

/**
 * Is `now` inside any of the merchant's slow-hour windows?
 * Returns the matching window plus a human reason string for offer context.
 */
export function findActiveSlowWindow(
  slowHours: SlowHour[],
  now: Date = new Date(),
): { window: SlowHour; reason: string } | null {
  if (!Array.isArray(slowHours) || slowHours.length === 0) return null;
  const day = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();
  for (const w of slowHours) {
    if (w.day !== day) continue;
    const start = toMinutes(w.start);
    const end = toMinutes(w.end);
    if (minutes >= start && minutes < end) {
      const reason = `${FULL_DAY_LABELS[day]} ${w.start}–${w.end} marked as a slow window by the merchant`;
      return { window: w, reason };
    }
  }
  return null;
}

export function formatHHMM(input: string): string {
  if (!input) return "";
  const parts = input.split(":");
  if (parts.length < 2) return input;
  return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
}
