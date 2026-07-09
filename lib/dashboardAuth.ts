import { cookies } from "next/headers";
import { config } from "./config";
import { safeCompare } from "./auth";

export const DASHBOARD_AUTH_COOKIE = "capchecker_auth";

/**
 * True if the visitor may see the dashboard: either they've already logged
 * in via the password form (cookie), or they carry the legacy ?key= link.
 * If no DASHBOARD_PASSWORD is configured, the dashboard is open to everyone.
 */
export function isDashboardAuthed(providedKey?: string): boolean {
  if (!config.dashboardPassword) return true;
  const cookieVal = cookies().get(DASHBOARD_AUTH_COOKIE)?.value;
  if (cookieVal && safeCompare(cookieVal, config.dashboardPassword)) return true;
  if (providedKey && safeCompare(providedKey, config.dashboardPassword)) return true;
  return false;
}
