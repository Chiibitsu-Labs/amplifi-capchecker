"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { safeCompare } from "@/lib/auth";
import { DASHBOARD_AUTH_COOKIE } from "@/lib/dashboardAuth";

/** Only ever redirect within this app — the hidden field is trusted input we
 * set ourselves, but validate anyway rather than trust an open redirect. */
function safeRedirectTarget(path: string): string {
  if (path.startsWith("/") && !path.startsWith("//") && !path.includes("://")) {
    return path;
  }
  return "/";
}

export async function authenticateDashboard(formData: FormData): Promise<void> {
  const provided = String(formData.get("key") ?? "");
  const redirectTo = safeRedirectTarget(String(formData.get("redirectTo") ?? "/"));

  if (!config.dashboardPassword || !safeCompare(provided, config.dashboardPassword)) {
    redirect(`${redirectTo}${redirectTo.includes("?") ? "&" : "?"}error=1`);
  }

  cookies().set(DASHBOARD_AUTH_COOKIE, provided, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180, // 180 days
  });

  redirect(redirectTo);
}
