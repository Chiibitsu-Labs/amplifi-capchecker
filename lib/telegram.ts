import { config } from "./config";

const API_BASE = "https://api.telegram.org";

type InlineKeyboardButton = {
  text: string;
  callback_data: string;
};

export type ReplyMarkup = {
  inline_keyboard: InlineKeyboardButton[][];
};

async function callTelegram<T = unknown>(
  method: string,
  body: Record<string, unknown>
): Promise<T> {
  const res = await fetch(
    `${API_BASE}/bot${config.telegram.botToken}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.description ?? res.status}`);
  }
  return data.result as T;
}

export async function sendMessage(
  chatId: string | number,
  text: string,
  replyMarkup?: ReplyMarkup
): Promise<void> {
  await callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<void> {
  await callTelegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

export async function editMessageText(
  chatId: string | number,
  messageId: number,
  text: string,
  replyMarkup?: ReplyMarkup
): Promise<void> {
  await callTelegram("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export async function setWebhook(url: string, secretToken: string): Promise<void> {
  await callTelegram("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
}

/**
 * A 1–10 capacity picker laid out as two rows of five, plus a small legend
 * baked into the button labels via the accompanying prompt text.
 * callback_data is "cap:<n>".
 */
/**
 * Admin roster keyboard: one button per member showing current status.
 * Tapping flips is_active. callback_data is "toggle:<member uuid>".
 */
export function teamKeyboard(
  members: { id: string; name: string; is_active: boolean }[]
): ReplyMarkup {
  return {
    inline_keyboard: members.map((m) => [
      {
        text: `${m.is_active ? "✅" : "💤"} ${m.name}`,
        callback_data: `toggle:${m.id}`,
      },
    ]),
  };
}

export function capacityKeyboard(): ReplyMarkup {
  const row = (start: number) =>
    Array.from({ length: 5 }, (_, i) => {
      const n = start + i;
      return { text: String(n), callback_data: `cap:${n}` };
    });
  return {
    inline_keyboard: [
      row(1),
      row(6),
      [{ text: "🤒 Out today (sick / leave)", callback_data: "cap:out" }],
    ],
  };
}
