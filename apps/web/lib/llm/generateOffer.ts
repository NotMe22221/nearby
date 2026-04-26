import OpenAI from "openai";
import { z } from "zod";
import type { OfferContext } from "@/lib/context/buildContext";
import { readEnv, requireEnv } from "@/lib/supabase/env";

export const GeneratedOfferSchema = z.object({
  headline: z.string().min(3).max(80),
  body: z.string().min(10).max(280),
  scarcity_text: z.string().min(3).max(80),
  discount_pct: z.number().int().min(1).max(90),
});

export type GeneratedOffer = z.infer<typeof GeneratedOfferSchema>;

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const apiKey = requireEnv("OPENAI_API_KEY");
  _client = new OpenAI({ apiKey });
  return _client;
}

function effectiveCap(ctx: OfferContext): number {
  // Discount cannot exceed rule cap or any per-item max.
  const ruleCap = ctx.rule.discount_cap_pct;
  const itemCap = Math.min(...ctx.items.map((i) => i.max_discount_pct));
  return Math.max(1, Math.min(ruleCap, itemCap));
}

function buildPrompt(ctx: OfferContext): {
  system: string;
  user: string;
  cap: number;
} {
  const cap = effectiveCap(ctx);
  const system = `You write short, friendly promotional offers for an independent local business.
Constraints:
- Discount must be a whole percentage between 1 and ${cap}.
- Mention only the listed items.
- Reference the real-world context (weather, time of day) when it makes the offer feel timely, but keep it natural.
- Keep the body under 2 short sentences. No emojis. No exclamation marks.
- Scarcity text must mention the limited number of redemptions available.
- Do not invent menu items or prices.
- Tone: warm, neighborly, factual.
Return strict JSON matching the schema.`;

  const w = ctx.snapshot.weather;
  const localTime = new Date(ctx.snapshot.local_time_iso);
  const timeStr = localTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const itemList = ctx.items
    .map(
      (i) =>
        `- ${i.name} (base $${i.base_price.toFixed(2)}, max ${i.max_discount_pct}% off)`,
    )
    .join("\n");

  const events = ctx.snapshot.events ?? [];
  const eventLines = events
    .slice(0, 3)
    .map((e) => {
      const when = new Date(e.start_at).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
      const dist =
        e.distance_km != null ? `, ~${e.distance_km.toFixed(1)} km away` : "";
      return `- ${e.name} at ${when}${dist}${e.classification ? ` (${e.classification})` : ""}`;
    })
    .join("\n");

  const loyaltyLine = ctx.loyalty
    ? `Loyalty hint: this customer has ${ctx.loyalty.stamps}/${ctx.loyalty.required} stamps toward "${ctx.loyalty.reward_text}". You may nudge them gently.`
    : "";

  const user = `Business: ${ctx.location.name}
Location: ${ctx.location.address}
${ctx.distance_km != null ? `Distance from customer: ${ctx.distance_km.toFixed(2)} km` : ""}
Local time: ${timeStr}
Why now: ${ctx.snapshot.slow_hour_reason}
${
  w
    ? `Current weather: ${w.description}, ${w.temp_c}°C`
    : "Current weather: unavailable"
}
${eventLines ? `Local events in the next few hours:\n${eventLines}` : ""}
${loyaltyLine}
Rule window: ${ctx.rule.time_window_start.slice(0, 5)}–${ctx.rule.time_window_end.slice(0, 5)}
Max redemptions: ${ctx.rule.max_redemptions}
Eligible items:
${itemList}

Write a single offer card. Keep the discount whole and at or below ${cap}%.`;

  return { system, user, cap };
}

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    headline: { type: "string", minLength: 3, maxLength: 80 },
    body: { type: "string", minLength: 10, maxLength: 280 },
    scarcity_text: { type: "string", minLength: 3, maxLength: 80 },
    discount_pct: { type: "integer", minimum: 1, maximum: 90 },
  },
  required: ["headline", "body", "scarcity_text", "discount_pct"],
} as const;

export async function generateOffer(ctx: OfferContext): Promise<GeneratedOffer> {
  const { system, user, cap } = buildPrompt(ctx);
  const model = readEnv("OPENAI_MODEL") || "gpt-4o-mini";

  const completion = await client().chat.completions.create({
    model,
    temperature: 0.7,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "GeneratedOffer",
        schema: responseSchema,
        strict: true,
      },
    },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("LLM returned no content.");
  const parsed = GeneratedOfferSchema.parse(JSON.parse(raw));
  // Hard-clamp the discount to the cap, in case the model exceeded it.
  const clamped = Math.max(1, Math.min(cap, parsed.discount_pct));
  return { ...parsed, discount_pct: clamped };
}
