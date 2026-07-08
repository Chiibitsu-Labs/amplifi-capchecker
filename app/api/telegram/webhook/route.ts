import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import {
  answerCallbackQuery,
  capacityKeyboard,
  editMessageText,
  sendMessage,
} from "@/lib/telegram";
import {
  getCurrentClientCount,
  getMemberByTelegramId,
  Member,
  replaceCurrentClients,
  setCheckinClientCount,
  setCheckinReason,
  setMemberState,
  upsertCheckinCapacity,
  upsertMember,
} from "@/lib/db";
import { localDateString } from "@/lib/dates";
import { parseRoster } from "@/lib/roster";
import * as msg from "@/lib/messages";

export const dynamic = "force-dynamic";

// Telegram expects a fast 200 no matter what. We swallow errors after logging
// so a single bad update never causes Telegram to retry-storm us.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== config.telegram.webhookSecret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update.message?.text) {
      await handleMessage(update.message);
    }
  } catch (err) {
    console.error("webhook handler error", err);
  }

  return NextResponse.json({ ok: true });
}

async function handleCallback(cb: NonNullable<TelegramUpdate["callback_query"]>) {
  const data = cb.data ?? "";
  const capMatch = data.match(/^cap:(\d{1,2})$/);
  if (!capMatch) {
    await answerCallbackQuery(cb.id);
    return;
  }
  const capacity = parseInt(capMatch[1], 10);
  if (capacity < 1 || capacity > 10) {
    await answerCallbackQuery(cb.id);
    return;
  }

  const member = await ensureMember(cb.from);
  const date = localDateString();

  await upsertCheckinCapacity(member.id, date, capacity);
  await setMemberState(member.id, "awaiting_reason", { date });

  await answerCallbackQuery(cb.id, `Logged ${capacity}/10`);
  // Freeze the picker so it can't be tapped twice / left ambiguous.
  if (cb.message) {
    await editMessageText(
      cb.message.chat.id,
      cb.message.message_id,
      `Capacity today: <b>${capacity}/10</b> ✅`
    );
  }
  await sendMessage(member.telegram_user_id, msg.capacityRecorded(capacity));
}

async function handleMessage(message: NonNullable<TelegramUpdate["message"]>) {
  const text = message.text!.trim();
  const from = message.from;
  if (!from) return;

  // Commands work from any state.
  if (text.startsWith("/")) {
    await handleCommand(text, from);
    return;
  }

  const member = await getMemberByTelegramId(from.id);
  if (!member) {
    // Unknown user typing free text — nudge them to enroll.
    await sendMessage(from.id, "Send /start to enroll in the capacity check-in.");
    return;
  }

  switch (member.state) {
    case "awaiting_reason": {
      const date =
        (member.state_context?.date as string | undefined) ?? localDateString();
      await setCheckinReason(member.id, date, text);
      // Q3 of the daily flow: client/task context, with a "same" shortcut.
      const existingCount = await getCurrentClientCount(member.id);
      await setMemberState(member.id, "awaiting_roster", { date, daily: true });
      await sendMessage(from.id, msg.dailyRosterPrompt(existingCount > 0));
      break;
    }
    case "awaiting_roster": {
      const date =
        (member.state_context?.date as string | undefined) ?? localDateString();
      const daily = member.state_context?.daily === true;

      if (isUnchangedReply(text)) {
        const count = await getCurrentClientCount(member.id);
        if (daily) await setCheckinClientCount(member.id, date, count);
        await setMemberState(member.id, "idle");
        await sendMessage(from.id, msg.rosterUnchanged(count));
        break;
      }

      const clients = parseRoster(text);
      await replaceCurrentClients(member.id, date, clients);
      if (daily) await setCheckinClientCount(member.id, date, clients.length);
      await setMemberState(member.id, "idle");
      await sendMessage(from.id, msg.rosterSaved(clients.length));
      break;
    }
    default:
      await sendMessage(from.id, msg.capacityOutOfContext());
  }
}

/** Recognise the "carry yesterday's roster forward" shortcut. */
function isUnchangedReply(text: string): boolean {
  return /^(same|no change|nochange|unchanged|no changes|n\/a|na|-)$/i.test(
    text.trim()
  );
}

async function handleCommand(text: string, from: TelegramUser) {
  const command = text.split(/\s|@/)[0].toLowerCase();

  if (command === "/start") {
    const member = await upsertMember(from);
    await setMemberState(member.id, "idle");
    await sendMessage(from.id, msg.welcome(member));
    return;
  }

  if (command === "/help") {
    await sendMessage(from.id, msg.help());
    return;
  }

  const member = await getMemberByTelegramId(from.id);
  if (!member) {
    await sendMessage(from.id, "Send /start first to enroll.");
    return;
  }

  if (command === "/capacity") {
    const clientCount = await getCurrentClientCount(member.id);
    await setMemberState(member.id, "idle");
    await sendMessage(
      member.telegram_user_id,
      msg.checkinPrompt(member, clientCount),
      capacityKeyboard()
    );
    return;
  }

  if (command === "/clients") {
    await setMemberState(member.id, "awaiting_roster");
    await sendMessage(member.telegram_user_id, msg.rosterPrompt());
    return;
  }

  await sendMessage(from.id, msg.help());
}

async function ensureMember(from: TelegramUser): Promise<Member> {
  const existing = await getMemberByTelegramId(from.id);
  if (existing) return existing;
  return upsertMember(from);
}

// ── Minimal Telegram update typings (only the fields we use) ───────────────
type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramUpdate = {
  message?: {
    message_id: number;
    from?: TelegramUser;
    chat: { id: number };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: TelegramUser;
    data?: string;
    message?: {
      message_id: number;
      chat: { id: number };
    };
  };
};
