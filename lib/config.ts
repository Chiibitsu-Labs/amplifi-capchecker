/**
 * Centralised, validated access to environment configuration.
 * Throwing early with a clear message beats a cryptic runtime failure later.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const config = {
  telegram: {
    get botToken() {
      return required("TELEGRAM_BOT_TOKEN");
    },
    get webhookSecret() {
      return required("TELEGRAM_WEBHOOK_SECRET");
    },
    get micheleChatId() {
      return required("MICHELE_CHAT_ID");
    },
  },
  supabase: {
    get url() {
      return required("SUPABASE_URL");
    },
    get serviceRoleKey() {
      return required("SUPABASE_SERVICE_ROLE_KEY");
    },
  },
  cron: {
    get secret() {
      return required("CRON_SECRET");
    },
  },
  get setupSecret() {
    return required("SETUP_SECRET");
  },
  get publicBaseUrl() {
    return required("PUBLIC_BASE_URL");
  },
  get tzOffsetMinutes() {
    return parseInt(optional("TZ_OFFSET_MINUTES", "480"), 10);
  },
};
