import { timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { config } from "./config";

/**
 * Constant-time string comparison for secrets (cron/webhook/setup tokens,
 * dashboard password). A plain `===` short-circuits on the first differing
 * byte, which leaks a timing signal proportional to how many leading
 * characters an attacker guessed correctly.
 */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Our secrets are fixed-length by construction (openssl rand -hex 32), so
  // a length mismatch only ever means "not this secret" — it carries no
  // per-character signal the way an early byte-mismatch return would.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is
 * configured. We accept that, and also allow ?secret= for manual triggering
 * during setup/testing.
 */
export function isAuthorizedCron(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  if (auth && safeCompare(auth, `Bearer ${config.cron.secret}`)) return true;
  const secret = new URL(req.url).searchParams.get("secret");
  return !!secret && safeCompare(secret, config.cron.secret);
}
