import { NextRequest } from "next/server";
import { config } from "./config";

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is
 * configured. We accept that, and also allow ?secret= for manual triggering
 * during setup/testing.
 */
export function isAuthorizedCron(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${config.cron.secret}`) return true;
  const secret = new URL(req.url).searchParams.get("secret");
  return secret === config.cron.secret;
}
