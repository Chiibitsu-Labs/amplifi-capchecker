import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { safeCompare } from "@/lib/auth";
import { setWebhook } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/**
 * One-time (idempotent) webhook registration. Call after deploying:
 *   curl -X POST "https://<app>/api/telegram/setup?secret=<SETUP_SECRET>"
 * Points Telegram at our webhook and locks it to TELEGRAM_WEBHOOK_SECRET.
 */
export async function POST(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (!secret || !safeCompare(secret, config.setupSecret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const url = `${config.publicBaseUrl.replace(/\/$/, "")}/api/telegram/webhook`;
  await setWebhook(url, config.telegram.webhookSecret);

  return NextResponse.json({ ok: true, webhook: url });
}
