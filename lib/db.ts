import { supabase } from "./supabase";

export type ConversationState =
  | "idle"
  | "awaiting_reason"
  | "awaiting_roster";

export type Member = {
  id: string;
  telegram_user_id: number;
  name: string;
  username: string | null;
  is_active: boolean;
  state: ConversationState;
  state_context: Record<string, unknown> | null;
};

export type Checkin = {
  id: string;
  member_id: string;
  check_date: string;
  capacity: number | null;
  reason: string | null;
  client_count: number | null;
  status: "ok" | "out";
};

const MEMBER_COLUMNS =
  "id, telegram_user_id, name, username, is_active, state, state_context";

/** Create the member on first /start, or update their name/username on return. */
export async function upsertMember(tg: {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}): Promise<Member> {
  const name = [tg.first_name, tg.last_name].filter(Boolean).join(" ") || "there";
  const { data, error } = await supabase()
    .from("capchecker_members")
    .upsert(
      {
        telegram_user_id: tg.id,
        name,
        username: tg.username ?? null,
        is_active: true,
      },
      { onConflict: "telegram_user_id" }
    )
    .select(MEMBER_COLUMNS)
    .single();
  if (error) throw error;
  return data as Member;
}

export async function getMemberByTelegramId(
  telegramUserId: number
): Promise<Member | null> {
  const { data, error } = await supabase()
    .from("capchecker_members")
    .select(MEMBER_COLUMNS)
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  if (error) throw error;
  return (data as Member) ?? null;
}

export async function getActiveMembers(): Promise<Member[]> {
  const { data, error } = await supabase()
    .from("capchecker_members")
    .select(MEMBER_COLUMNS)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data as Member[]) ?? [];
}

/** Everyone, active or not — for the admin /team roster. */
export async function getAllMembers(): Promise<Member[]> {
  const { data, error } = await supabase()
    .from("capchecker_members")
    .select(MEMBER_COLUMNS)
    .order("name");
  if (error) throw error;
  return (data as Member[]) ?? [];
}

export async function setMemberActive(
  memberId: string,
  isActive: boolean
): Promise<Member | null> {
  const { data, error } = await supabase()
    .from("capchecker_members")
    .update({ is_active: isActive })
    .eq("id", memberId)
    .select(MEMBER_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return (data as Member) ?? null;
}

export async function setMemberState(
  memberId: string,
  state: ConversationState,
  context: Record<string, unknown> | null = null
): Promise<void> {
  const { error } = await supabase()
    .from("capchecker_members")
    .update({ state, state_context: context })
    .eq("id", memberId);
  if (error) throw error;
}

/** Record (or overwrite) today's capacity number; leaves reason untouched. */
export async function upsertCheckinCapacity(
  memberId: string,
  checkDate: string,
  capacity: number
): Promise<void> {
  const { error } = await supabase()
    .from("capchecker_checkins")
    .upsert(
      { member_id: memberId, check_date: checkDate, capacity, status: "ok" },
      { onConflict: "member_id,check_date" }
    );
  if (error) throw error;
}

/** Mark the member out (sick/leave) for the day — an excused absence, not a gap. */
export async function markCheckinOut(
  memberId: string,
  checkDate: string
): Promise<void> {
  const { error } = await supabase()
    .from("capchecker_checkins")
    .upsert(
      { member_id: memberId, check_date: checkDate, status: "out", capacity: null },
      { onConflict: "member_id,check_date" }
    );
  if (error) throw error;
}

export async function setCheckinReason(
  memberId: string,
  checkDate: string,
  reason: string
): Promise<void> {
  const { error } = await supabase()
    .from("capchecker_checkins")
    .upsert(
      { member_id: memberId, check_date: checkDate, reason },
      { onConflict: "member_id,check_date" }
    );
  if (error) throw error;
}

/** Snapshot the client count onto the day's check-in for the dashboard series. */
export async function setCheckinClientCount(
  memberId: string,
  checkDate: string,
  clientCount: number
): Promise<void> {
  const { error } = await supabase()
    .from("capchecker_checkins")
    .upsert(
      { member_id: memberId, check_date: checkDate, client_count: clientCount },
      { onConflict: "member_id,check_date" }
    );
  if (error) throw error;
}

export async function getCheckinsForDate(
  checkDate: string
): Promise<Checkin[]> {
  const { data, error } = await supabase()
    .from("capchecker_checkins")
    .select("id, member_id, check_date, capacity, reason, client_count, status")
    .eq("check_date", checkDate);
  if (error) throw error;
  return (data as Checkin[]) ?? [];
}

/**
 * Replace a member's current client roster with a fresh snapshot. We keep old
 * rows (is_current = false) for history so the dashboard can show churn over
 * time, and insert the new set as is_current = true.
 */
export async function replaceCurrentClients(
  memberId: string,
  snapshotDate: string,
  clients: { client_name: string; task_context: string | null }[]
): Promise<void> {
  const sb = supabase();
  const { error: clearErr } = await sb
    .from("capchecker_clients")
    .update({ is_current: false })
    .eq("member_id", memberId)
    .eq("is_current", true);
  if (clearErr) throw clearErr;

  if (clients.length === 0) return;

  const { error: insErr } = await sb.from("capchecker_clients").insert(
    clients.map((c) => ({
      member_id: memberId,
      client_name: c.client_name,
      task_context: c.task_context,
      snapshot_date: snapshotDate,
      is_current: true,
    }))
  );
  if (insErr) throw insErr;
}

export async function getCurrentClientCount(
  memberId: string
): Promise<number> {
  const { count, error } = await supabase()
    .from("capchecker_clients")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId)
    .eq("is_current", true);
  if (error) throw error;
  return count ?? 0;
}

/** True if today's summary already went out — guards against double-sends. */
export async function wasSummarySent(summaryDate: string): Promise<boolean> {
  const { data, error } = await supabase()
    .from("capchecker_summaries")
    .select("sent_at")
    .eq("summary_date", summaryDate)
    .maybeSingle();
  if (error) throw error;
  return !!data?.sent_at;
}

export async function recordSummary(
  summaryDate: string,
  payload: unknown
): Promise<void> {
  const { error } = await supabase()
    .from("capchecker_summaries")
    .upsert(
      { summary_date: summaryDate, payload, sent_at: new Date().toISOString() },
      { onConflict: "summary_date" }
    );
  if (error) throw error;
}
