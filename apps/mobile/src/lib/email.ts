import { resendApiKey } from "./config";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export type SendClaimEmailResult = {
  /** Always set — this is the code the customer should use (or your explicit redemption code). */
  code: string;
  /** Whether Resend reported success. */
  emailSent: boolean;
  error?: string;
};

/**
 * Send claim confirmation email. Always returns a real `code` (never placeholder),
 * so the wallet and UI can show it even if email fails.
 * Pass `redemptionCode` for Supabase offers so the email matches the merchant’s offer code.
 */
export async function sendClaimEmail(
  to: string,
  customerName: string,
  businessName: string,
  offerHeadline: string,
  options?: { redemptionCode?: string },
): Promise<SendClaimEmailResult> {
  const code =
    options?.redemptionCode && options.redemptionCode.trim()
      ? options.redemptionCode.trim()
      : generateCode();

  if (!resendApiKey || resendApiKey === "REPLACE_WITH_YOUR_RESEND_API_KEY") {
    return { code, emailSent: false, error: "Resend not configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Nearby <onboarding@resend.dev>",
        to: [to],
        subject: `Your offer at ${businessName}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
            <h1 style="color: #0F172A; font-size: 24px; margin: 0 0 8px;">Offer claimed!</h1>
            <p style="color: #475569; font-size: 16px; margin: 0 0 24px;">
              Hey ${customerName}, your offer is ready.
            </p>
            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
              <p style="color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Your offer code</p>
              <p style="color: #2563EB; font-size: 32px; font-weight: 800; letter-spacing: 4px; margin: 0; font-family: monospace;">${code}</p>
            </div>
            <div style="background: #DBEAFE; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
              <p style="color: #2563EB; font-size: 14px; font-weight: 600; margin: 0 0 4px;">${offerHeadline}</p>
              <p style="color: #475569; font-size: 13px; margin: 0;">at ${businessName}</p>
            </div>
            <p style="color: #475569; font-size: 14px; line-height: 1.5;">
              Show this code to the cashier or staff at <strong>${businessName}</strong> to redeem your offer. This code is single-use.
            </p>
            <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0;" />
            <p style="color: #94A3B8; font-size: 11px; margin: 0;">
              Sent by Nearby &mdash; real offers from real places near you.
            </p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return {
        code,
        emailSent: false,
        error: `Email failed (${res.status}): ${body}`,
      };
    }

    return { code, emailSent: true };
  } catch (err) {
    return {
      code,
      emailSent: false,
      error: err instanceof Error ? err.message : "Email send failed.",
    };
  }
}
