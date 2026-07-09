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
    /**
     * Telegram user ids allowed to run admin commands (/team). Michele is
     * always an admin; ADMIN_CHAT_IDS (comma-separated) adds more.
     */
    get adminChatIds(): Set<string> {
      const extra = (process.env.ADMIN_CHAT_IDS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return new Set([required("MICHELE_CHAT_ID"), ...extra]);
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
  /** If set, the web dashboard requires ?key=<value>. Empty = dashboard open. */
  get dashboardPassword(): string {
    return process.env.DASHBOARD_PASSWORD ?? "";
  },
};
