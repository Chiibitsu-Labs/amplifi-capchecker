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
    `<i>1 = wide open · 10 = drowning (fully loaded)</i>\n\n` +
    `Tap a number 👇`
  );
}

/**
 * Q2 confirms the tapped number IN WORDS before asking why, so a misread
 * surfaces instantly and can be fixed with the redo button under this message.
 * SCALE (decided with Michele): the team reads 10 as "full", so that's now the
 * definition — 10 = drowning (fully loaded), 1 = wide open. Higher = busier.
 * Bands mirror the dashboard heatmap legend.
 */
export function capacityRecorded(capacity: number): string {
  let read: string;
  let ask: string;
  if (capacity >= 9) {
    read = "you're <b>drowning — fully loaded, no room left</b>";
    ask = "In one line, what's eating your day?";
  } else if (capacity >= 7) {
    read = "you're <b>stretched thin</b>";
    ask = "In one line, what's driving that today?";
  } else if (capacity >= 5) {
    read = "you're <b>holding steady</b> — some room, not lots";
    ask = "In one line, what's taking most of your day?";
  } else if (capacity >= 3) {
    read = "you have <b>good available capacity</b>";
    ask = "In one line, what are you working on right now?";
  } else {
    read = "you're <b>wide open — lots of available capacity</b>";
    ask = "In one line, what are you working on right now?";
  }
  return `Got it — <b>${capacity}/10</b>, meaning ${read}. ${ask}`;
}

export function redoPrompt(): string {
  return (
    `No problem — how's your capacity today?\n` +
    `<i>1 = wide open · 10 = drowning (fully loaded)</i>\n\n` +
    `Tap a number 👇`
  );
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

/**
 * Confirmation when a PAST day's reason is corrected via the redo button.
 * No roster follow-up — the client roster is a "right now" concept, so
 * replaying it against an old date would overwrite today's live roster.
 */
export function reasonUpdated(date: string): string {
  return `Thanks 🙏 Updated for <b>${date}</b>.`;
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
