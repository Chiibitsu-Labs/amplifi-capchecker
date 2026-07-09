import { supabase } from "./supabase";
import { THRESHOLDS, THRESHOLD_DOCS, Thresholds } from "./analytics";

/**
 * Effective thresholds for this request. Resolution order:
 * saved in-app setting (capchecker_settings) → THRESHOLD_* env var → default.
 * Falls back to env/defaults if the settings table is missing or unreadable,
 * so the dashboard never breaks on a database hiccup.
 */
export async function getThresholds(): Promise<{
  thresholds: Thresholds;
  overrides: Partial<Record<keyof Thresholds, number>>;
}> {
  const thresholds: Thresholds = { ...THRESHOLDS };
  const overrides: Partial<Record<keyof Thresholds, number>> = {};
  try {
    const { data, error } = await supabase()
      .from("capchecker_settings")
      .select("key, value");
    if (error) throw error;
    const validKeys = new Set(THRESHOLD_DOCS.map((d) => d.key as string));
    for (const row of (data ?? []) as { key: string; value: string }[]) {
      if (!validKeys.has(row.key)) continue;
      const n = Number(row.value);
      if (!Number.isFinite(n)) continue;
      const k = row.key as keyof Thresholds;
      thresholds[k] = n;
      overrides[k] = n;
    }
  } catch {
    // table absent (pre-migration) or transient error — env/defaults apply
  }
  return { thresholds, overrides };
}

/** Persist changes: a number upserts an override; null clears it (back to env/default). */
export async function saveThresholds(
  changes: Partial<Record<keyof Thresholds, number | null>>
): Promise<void> {
  const sb = supabase();
  const upserts = Object.entries(changes)
    .filter(([, v]) => v !== null)
    .map(([key, value]) => ({ key, value: String(value) }));
  const clears = Object.entries(changes)
    .filter(([, v]) => v === null)
    .map(([key]) => key);

  if (upserts.length) {
    const { error } = await sb
      .from("capchecker_settings")
      .upsert(upserts, { onConflict: "key" });
    if (error) throw error;
  }
  if (clears.length) {
    const { error } = await sb
      .from("capchecker_settings")
      .delete()
      .in("key", clears);
    if (error) throw error;
  }
}
