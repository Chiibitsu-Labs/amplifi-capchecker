import type { Member } from "./db";

/** All user-facing bot copy lives here so tone stays consistent and tweakable. */

export function welcome(member: Member): string {
  return (
    `Hey ${escapeHtml(firstName(member))} — you're all set. 🎯\n\n` +
    `Each weekday morning I'll send a quick capacity check: one tap + one line. ` +
    `Takes about ten seconds and helps the team see where support is needed.\n\n` +
    `Commands anytime:\n` +
    `• /capacity — do today's check-in now\n` +
    `• /clients — update your client roster\n` +
    `• /help — how this works`
  );
}

export function help(): string {
  return (
    `<b>Capacity check-in</b>\n\n` +
    `Every weekday at 8am I ask two things:\n` +
    `1️⃣ Your capacity today, 1–10 (just tap a number)\n` +
    `2️⃣ One line on what's driving it\n\n` +
    `On Mondays I'll also ask if your client roster changed.\n\n` +
    `<b>Commands</b>\n` +
    `• /capacity — check in now\n` +
    `• /clients — update who you're working with\n` +
    `• /pause — going on leave? stop daily check-ins (/start to resume)\n` +
    `• /team — (admins) pause/resume team members\n` +
    `• /help — this message`
  );
}

export function checkinPrompt(member: Member, clientCount: number): string {
  const clientLine =
    clientCount > 0
      ? `You're currently tracked on <b>${clientCount}</b> client${clientCount === 1 ? "" : "s"}. `
      : "";
  return (
    `Morning ${escapeHtml(firstName(member))}! ☀️\n\n` +
    `${clientLine}How's your capacity today?\n` +
    `<i>1 = drowning · 10 = wide open</i>\n\n` +
    `Tap a number 👇`
  );
}

export function capacityRecorded(capacity: number): string {
  return `Got it — <b>${capacity}/10</b>. In one line, what's driving that today?`;
}

/**
 * Third daily question. Asked every day, but "same" lets people carry
 * yesterday's roster forward so it stays a one-word reply on stable days.
 */
export function dailyRosterPrompt(hasExisting: boolean): string {
  const shortcut = hasExisting
    ? `Reply <b>same</b> if nothing's changed. Otherwise send one client per line:\n\n`
    : `Send one client per line:\n\n`;
  return (
    `Last one — who are you working with today &amp; what's the load?\n\n` +
    shortcut +
    `<code>Acme Co — mid-launch, heavy this week\n` +
    `Globex — steady, retainer\n` +
    `Initech — winding down</code>\n\n` +
    `The part after the — is optional context.`
  );
}

/** Manual /clients refresh (no "same" shortcut framing). */
export function rosterPrompt(): string {
  return (
    `Let's refresh your client roster. Send one client per line, like:\n\n` +
    `<code>Acme Co — mid-launch, heavy this week\n` +
    `Globex — steady, retainer\n` +
    `Initech — winding down</code>\n\n` +
    `The part after the — is optional context. Send it all in one message.`
  );
}

export function rosterSaved(count: number): string {
  return `Saved — tracking <b>${count}</b> client${count === 1 ? "" : "s"} for you now. That's you done for today, thanks 🙏`;
}

export function rosterUnchanged(count: number): string {
  return `Kept your ${count} client${count === 1 ? "" : "s"} as-is. That's you done for today, thanks 🙏`;
}

export function reasonThanksNoRoster(): string {
  return `Thanks 🙏 Logged for today. See you tomorrow.`;
}

export function paused(): string {
  return (
    `You're paused — no more daily check-ins. 💤\n` +
    `Send /start whenever you're back.`
  );
}

export function teamHeader(): string {
  return (
    `<b>Team roster</b> — tap a button to pause/resume someone's daily check-ins.\n` +
    `💤 paused members get no messages and don't appear in summaries.`
  );
}

export function notAdmin(): string {
  return `That command is for team admins only.`;
}

export function capacityOutOfContext(): string {
  return (
    `Tap /capacity to log today's capacity, or /help to see how this works.`
  );
}

function firstName(member: Member): string {
  return member.name.split(" ")[0] || member.name;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
