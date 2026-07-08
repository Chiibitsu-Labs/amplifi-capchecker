import { config } from "./config";

/**
 * The team's "working day" is computed in their local timezone (UTC+8 by
 * default). A check-in sent at 8am and a summary at 10am on the same calendar
 * day in Manila must map to the SAME check_date, even though the server runs
 * in UTC. So we shift "now" by the configured offset before taking the date.
 */

export function localDateString(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + config.tzOffsetMinutes * 60_000);
  return shifted.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** 0 = Sunday ... 1 = Monday ... 6 = Saturday, in the team's local timezone. */
export function localDayOfWeek(now: Date = new Date()): number {
  const shifted = new Date(now.getTime() + config.tzOffsetMinutes * 60_000);
  return shifted.getUTCDay();
}

export function isLocalWeekday(now: Date = new Date()): boolean {
  const dow = localDayOfWeek(now);
  return dow >= 1 && dow <= 5;
}

export function isLocalMonday(now: Date = new Date()): boolean {
  return localDayOfWeek(now) === 1;
}
