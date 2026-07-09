import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { isAuthorizedCron } from "@/lib/auth";
import {
  getActiveMembers,
  getCheckinsForDate,
  getCurrentClientCount,
  recordSummary,
  wasSummarySent,
} from "@/lib/db";
import { sendMessage } from "@/lib/telegram";
import { escapeHtml } from "@/lib/messages";
import { localDateString, isLocalWeekday } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LOW_CAPACITY_THRESHOLD = 3;

/**
 * Daily 10am (UTC+8) summary to Michele. Vercel fires this at 02:00 UTC.
 * Includes whoever responded by now + flags non-responders, so it never hangs
 * waiting on a full house.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  if (!isLocalWeekday()) {
    return NextResponse.json({ ok: true, skipped: "weekend" });
  }

  const date = localDateString();

  // Idempotency: send at most one summary per day. Guards against cron
  // double-fires and cron-after-manual-trigger. ?force=1 overrides for
  // deliberate re-sends.
  const force = new URL(req.url).searchParams.get("force") === "1";
  if (!force && (await wasSummarySent(date))) {
    return NextResponse.json({ ok: true, skipped: "already_sent", date });
  }

  const members = await getActiveMembers();
  const checkins = await getCheckinsForDate(date);
  const byMember = new Map(checkins.map((c) => [c.member_id, c]));

  const rows = await Promise.all(
    members.map(async (m) => {
      const c = byMember.get(m.id);
      return {
        name: m.name,
        clientCount: await getCurrentClientCount(m.id),
        capacity: c?.capacity ?? null,
        reason: c?.reason ?? null,
        out: c?.status === "out",
        responded: !!c && c.capacity !== null,
      };
    })
  );

  const responded = rows.filter((r) => r.responded);
  const out = rows.filter((r) => r.out);
  const missing = rows.filter((r) => !r.responded && !r.out);
  const avg =
    responded.length > 0
      ? responded.reduce((s, r) => s + (r.capacity ?? 0), 0) / responded.length
      : null;

  const message = buildSummary({ date, rows, responded, missing, out, avg });

  // Michele gets the summary; admins (ADMIN_CHAT_IDS) are CC'd so ops can
  // see exactly what she sees. Set is deduped, so Michele never gets two.
  const recipients = new Set([
    config.telegram.micheleChatId,
    ...config.telegram.adminChatIds,
  ]);
  for (const chatId of recipients) {
    try {
      await sendMessage(chatId, message);
    } catch (err) {
      console.error(`summary send failed for ${chatId}`, err);
    }
  }
  await recordSummary(date, { rows, avg, responded: responded.length, total: members.length });

  return NextResponse.json({
    ok: true,
    date,
    total: members.length,
    responded: responded.length,
  });
}

function buildSummary(args: {
  date: string;
  rows: SummaryRow[];
  responded: SummaryRow[];
  missing: SummaryRow[];
  out: SummaryRow[];
  avg: number | null;
}): string {
  const { date, responded, missing, out, avg } = args;

  if (responded.length === 0) {
    return (
      `<b>Capacity summary — ${date}</b>\n\n` +
      `No check-ins recorded yet today. ${missing.length} team member${
        missing.length === 1 ? "" : "s"
      } still to respond.`
    );
  }

  // Lowest capacity first — the people who may need support surface at the top.
  const sorted = [...responded].sort(
    (a, b) => (a.capacity ?? 99) - (b.capacity ?? 99)
  );

  const lines: string[] = [];
  lines.push(`<b>Capacity summary — ${date}</b>`);
  lines.push(
    `Team average: <b>${avg!.toFixed(1)}/10</b> · ${responded.length}/${
      responded.length + missing.length
    } responded`
  );

  const lowCount = responded.filter(
    (r) => (r.capacity ?? 99) <= LOW_CAPACITY_THRESHOLD
  ).length;
  if (lowCount > 0) {
    lines.push(
      `⚠️ <b>${lowCount}</b> at or below ${LOW_CAPACITY_THRESHOLD}/10 — may need support.`
    );
  }

  lines.push("");
  for (const r of sorted) {
    const flag = (r.capacity ?? 99) <= LOW_CAPACITY_THRESHOLD ? "🔴" : "🟢";
    const clients = r.clientCount > 0 ? ` · ${r.clientCount} client${r.clientCount === 1 ? "" : "s"}` : "";
    const reason = r.reason ? `\n   <i>${escapeHtml(r.reason)}</i>` : "";
    lines.push(`${flag} <b>${escapeHtml(r.name)}</b> — ${r.capacity}/10${clients}${reason}`);
  }

  if (out.length > 0) {
    lines.push("");
    lines.push(
      `🤒 Out today: ${out.map((m) => escapeHtml(m.name)).join(", ")}`
    );
  }

  if (missing.length > 0) {
    lines.push("");
    lines.push(
      `<i>No response yet: ${missing
        .map((m) => escapeHtml(m.name))
        .join(", ")}</i>`
    );
  }

  return lines.join("\n");
}

type SummaryRow = {
  name: string;
  clientCount: number;
  capacity: number | null;
  reason: string | null;
  out: boolean;
  responded: boolean;
};
