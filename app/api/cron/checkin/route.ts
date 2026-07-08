import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/auth";
import { getActiveMembers, getCurrentClientCount, setMemberState } from "@/lib/db";
import { capacityKeyboard, sendMessage } from "@/lib/telegram";
import { checkinPrompt } from "@/lib/messages";
import { isLocalWeekday } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily 8am (UTC+8) blast. Sends every active member the capacity picker.
 * Skips weekends. Vercel fires this at 00:00 UTC == 08:00 UTC+8.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  if (!isLocalWeekday()) {
    return NextResponse.json({ ok: true, skipped: "weekend" });
  }

  const members = await getActiveMembers();
  const results: { member: string; ok: boolean; error?: string }[] = [];

  for (const member of members) {
    try {
      const clientCount = await getCurrentClientCount(member.id);
      // Reset any stale state so a tap today starts a clean check-in.
      await setMemberState(member.id, "idle");
      await sendMessage(
        member.telegram_user_id,
        checkinPrompt(member, clientCount),
        capacityKeyboard()
      );
      results.push({ member: member.name, ok: true });
    } catch (err) {
      // One member's blocked bot / deleted chat shouldn't halt the blast.
      results.push({
        member: member.name,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
