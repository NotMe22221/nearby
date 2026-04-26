import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  // Restart the onboarding flow; the onboard route handles the loop.
  return NextResponse.redirect(`${url.protocol}//${url.host}/api/stripe/connect/onboard`, {
    status: 303,
  });
}
