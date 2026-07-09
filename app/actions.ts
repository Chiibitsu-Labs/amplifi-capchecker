"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { safeCompare } from "@/lib/auth";
import { DASHBOARD_AUTH_COOKIE } from "@/lib/dashboardAuth";
import { THRESHOLD_DOCS, Thresholds } from "@/lib/analytics";
import { saveThresholds } from "@/lib/settings";

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

/**
 * Save threshold changes from the /about settings panel. Deliberately
 * re-asks for the dashboard password on every save — being logged in
 * (cookie) is enough to VIEW, but changing how the instrument computes
 * signals is a bigger action and gets its own confirmation.
 */
export async function updateThresholds(formData: FormData): Promise<void> {
  const confirm = String(formData.get("confirmPassword") ?? "");
  if (!config.dashboardPassword || !safeCompare(confirm, config.dashboardPassword)) {
    redirect("/about?terror=badpass#thresholds");
  }

  const changes: Partial<Record<keyof Thresholds, number | null>> = {};
  for (const doc of THRESHOLD_DOCS) {
    const raw = String(formData.get(doc.key) ?? "").trim();
    if (raw === "") {
      changes[doc.key] = null; // blank = clear override, back to default
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < doc.min || n > doc.max) {
      redirect(`/about?terror=range&field=${encodeURIComponent(doc.key)}#thresholds`);
    }
    changes[doc.key] = n;
  }

  try {
    await saveThresholds(changes);
  } catch {
    redirect("/about?terror=save#thresholds");
  }
  redirect("/about?saved=1#thresholds");
}
