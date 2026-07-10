/**
 * The "when-to-hire instrument": turns raw check-ins into the signals and
 * thresholds Michele uses to decide hire / automate-or-redesign / rebalance.
 * Pure functions — no I/O — so every rule is testable and explainable.
 *
 * ── SCALE ORIENTATION (decided with Michele — read before touching a
 *    comparison) ──────────────────────────────────────────────────────────
 * The `capacity` number is a LOAD / BUSYNESS rating:
 *     10 = drowning (fully loaded, no spare capacity)
 *      1 = wide open (lots of spare capacity)
 * So HIGHER = busier = MORE strained. Every threshold comparison below is
 * "capacity >= line" for strain, "avg > line" for an overloaded day, etc.
 * If you ever see a `<=` against a capacity here, it's a bug from the old
 * (inverted) scale — the team reads 10 as "full", so we match them.
 */

export type DayRow = {
  check_date: string; // YYYY-MM-DD
  member_name: string;
  capacity: number | null;
  reason: string | null;
  client_count: number | null;
  status?: "ok" | "out" | null;
};

export type MemberSeries = {
  name: string;
  /** check_date → capacity, only days they responded */
  days: Map<string, { capacity: number; reason: string | null }>;
  /** days marked out (sick/leave) — excused, excluded from averages */
  outDays: Set<string>;
  latestReason: string | null;
  latestClientCount: number | null;
};

export type Signal = {
  severity: "critical" | "serious" | "warning" | "good";
  /** The router verdict: what kind of action this points at. */
  action: "HIRE" | "REBALANCE" | "AUTOMATE" | "WATCH" | "DATA" | "NONE";
  title: string;
  detail: string;
};

// ── Thresholds (the "data you can stand behind" — documented on the page) ──
// Every value is overridable via a Vercel env var, no code change/redeploy-
// from-a-PR required — see THRESHOLD_DOCS below, surfaced on /about.
function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const THRESHOLDS = {
  strainZone: envNumber("THRESHOLD_STRAIN_ZONE", 8), // capacity ≥ this = strained (10 = drowning)
  structuralLine: envNumber("THRESHOLD_STRUCTURAL_LINE", 6), // team avg above this = overloaded day
  structuralDays: envNumber("THRESHOLD_STRUCTURAL_DAYS", 7), // ...on ≥N of last 10 working days = hire signal
  minHistoryDays: envNumber("THRESHOLD_MIN_HISTORY_DAYS", 10), // days of data before structural calls are trusted
  strainAvg: envNumber("THRESHOLD_STRAIN_AVG", 7.5), // member 5-day avg ≥ this = individual strain
  strainGap: envNumber("THRESHOLD_STRAIN_GAP", 2), // ...while team sits ≥ this much LOWER (less busy) = rebalance
  themeShare: envNumber("THRESHOLD_THEME_SHARE", 0.4), // one theme ≥40% of high-load reasons = automate
  themeMinCount: envNumber("THRESHOLD_THEME_MIN_COUNT", 3),
  responseFloor: envNumber("THRESHOLD_RESPONSE_FLOOR", 0.7), // 7-day response rate below this = data warning
};

export type Thresholds = { [K in keyof typeof THRESHOLDS]: number };

/**
 * Docs + validation bounds for the /about settings panel — one row per
 * tunable threshold. min/max/step also drive the form inputs.
 */
export const THRESHOLD_DOCS: {
  key: keyof Thresholds;
  envVar: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
}[] = [
  { key: "structuralLine", envVar: "THRESHOLD_STRUCTURAL_LINE", label: "Team average above this = an overloaded day (10 = drowning)", default: 6, min: 1, max: 10, step: 0.5 },
  { key: "structuralDays", envVar: "THRESHOLD_STRUCTURAL_DAYS", label: "...on this many of the last 10 working days triggers Hire", default: 7, min: 1, max: 10, step: 1 },
  { key: "minHistoryDays", envVar: "THRESHOLD_MIN_HISTORY_DAYS", label: "Working days of history required before structural signals unlock", default: 10, min: 1, max: 60, step: 1 },
  { key: "strainAvg", envVar: "THRESHOLD_STRAIN_AVG", label: "Individual 5-day average at/above this = personal strain", default: 7.5, min: 1, max: 10, step: 0.5 },
  { key: "strainGap", envVar: "THRESHOLD_STRAIN_GAP", label: "...while the team sits at least this many points lower (less busy), triggers Rebalance", default: 2, min: 0, max: 9, step: 0.5 },
  { key: "themeShare", envVar: "THRESHOLD_THEME_SHARE", label: "Share of high-load reports one theme must dominate to trigger Automate", default: 0.4, min: 0.05, max: 1, step: 0.05, unit: "0.4 = 40%" },
  { key: "themeMinCount", envVar: "THRESHOLD_THEME_MIN_COUNT", label: "Minimum occurrences of a theme before it can trigger Automate", default: 3, min: 1, max: 50, step: 1 },
  { key: "responseFloor", envVar: "THRESHOLD_RESPONSE_FLOOR", label: "7-day response rate floor before a Data Health warning fires", default: 0.7, min: 0.1, max: 1, step: 0.05, unit: "0.7 = 70%" },
  { key: "strainZone", envVar: "THRESHOLD_STRAIN_ZONE", label: "Capacity at/above this = the strain zone (heatmap color, Watch signal, KPI tile)", default: 8, min: 1, max: 10, step: 1 },
];

// ── Reason themes (keyword v1; an LLM pass can replace this later) ─────────
const THEME_KEYWORDS: [string, RegExp][] = [
  ["Reports & analysis", /report|analys|analytics|template|assessment|study|studies|data\b|eom/i],
  ["Meetings & admin", /meeting|admin|pa'?s|alignment|call|sync|prep/i],
  ["Events & workshops", /workshop|conference|event|sprint|session|launch/i],
  ["Client fires", /urgent|fire|asap|revision|rush|emergency/i],
];

export function themesFor(reason: string): string[] {
  const hits = THEME_KEYWORDS.filter(([, re]) => re.test(reason)).map(([t]) => t);
  return hits.length ? hits : ["Other"];
}

// ── Series shaping ──────────────────────────────────────────────────────────
export function buildSeries(rows: DayRow[]): {
  members: MemberSeries[];
  dates: string[]; // ascending, only dates with ≥1 response
} {
  const byMember = new Map<string, MemberSeries>();
  const dateSet = new Set<string>();

  // rows arrive ordered by check_date ascending
  for (const r of rows) {
    const isOut = r.status === "out";
    if (r.capacity == null && !isOut) continue;
    dateSet.add(r.check_date);
    let m = byMember.get(r.member_name);
    if (!m) {
      m = {
        name: r.member_name,
        days: new Map(),
        outDays: new Set(),
        latestReason: null,
        latestClientCount: null,
      };
      byMember.set(r.member_name, m);
    }
    if (isOut) {
      m.outDays.add(r.check_date);
      continue;
    }
    m.days.set(r.check_date, { capacity: r.capacity!, reason: r.reason });
    m.latestReason = r.reason ?? m.latestReason;
    m.latestClientCount = r.client_count ?? m.latestClientCount;
  }

  return {
    members: [...byMember.values()].sort((a, b) => a.name.localeCompare(b.name)),
    dates: [...dateSet].sort(),
  };
}

export function teamAverageByDate(
  members: MemberSeries[],
  dates: string[]
): { date: string; avg: number; responded: number; out: number }[] {
  return dates.map((date) => {
    const caps = members
      .map((m) => m.days.get(date)?.capacity)
      .filter((c): c is number => c != null);
    const out = members.filter((m) => m.outDays.has(date)).length;
    return {
      date,
      avg: caps.length ? caps.reduce((s, c) => s + c, 0) / caps.length : 0,
      responded: caps.length,
      out,
    };
  });
}

function lastN<T>(arr: T[], n: number): T[] {
  return arr.slice(Math.max(0, arr.length - n));
}

function avg(nums: number[]): number | null {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null;
}

// ── The router ──────────────────────────────────────────────────────────────
export function computeSignals(
  members: MemberSeries[],
  dates: string[],
  activeMemberCount: number,
  T: Thresholds = THRESHOLDS
): Signal[] {
  const signals: Signal[] = [];
  const daily = teamAverageByDate(members, dates);
  const today = dates[dates.length - 1];

  // Data confidence gate — structural calls need history.
  if (dates.length < T.minHistoryDays) {
    signals.push({
      severity: "warning",
      action: "DATA",
      title: `Calibrating — ${dates.length}/${T.minHistoryDays} working days of data`,
      detail:
        "Structural signals (hire / automate) unlock at 10 working days. Daily and individual reads below are already live.",
    });
  }

  // HIRE — sustained team-wide overload (high load = busy).
  if (dates.length >= T.minHistoryDays) {
    const last10 = lastN(daily, 10);
    const busyDays = last10.filter((d) => d.avg > T.structuralLine).length;
    if (busyDays >= T.structuralDays) {
      signals.push({
        severity: "critical",
        action: "HIRE",
        title: `Structural overload: team above ${T.structuralLine}/10 on ${busyDays} of the last 10 working days`,
        detail:
          "Sustained team-wide strain that individual fixes won't solve. If the reason themes below aren't automatable, this is the hire signal.",
      });
    }
  }

  // REBALANCE — one person swamped while the team has headroom.
  const team7 = avg(lastN(daily, 7).map((d) => d.avg));
  for (const m of members) {
    const caps = dates
      .map((d) => m.days.get(d)?.capacity)
      .filter((c): c is number => c != null);
    const m5 = avg(lastN(caps, 5));
    if (
      m5 != null &&
      caps.length >= 3 &&
      m5 >= T.strainAvg &&
      team7 != null &&
      m5 - team7 >= T.strainGap
    ) {
      signals.push({
        severity: "serious",
        action: "REBALANCE",
        title: `${m.name} is swamped: ${m5.toFixed(1)}/10 average over recent check-ins vs team ${team7.toFixed(1)}`,
        detail:
          "Individual strain while the team has headroom — a workload rebalance or delegation candidate before it becomes attrition.",
      });
    }
  }

  // AUTOMATE — one theme dominating high-load days.
  const highReasons: string[] = [];
  for (const m of members) {
    for (const d of lastN(dates, 14)) {
      const day = m.days.get(d);
      if (day && day.capacity >= T.structuralLine && day.reason) {
        highReasons.push(day.reason);
      }
    }
  }
  const themeCounts = new Map<string, number>();
  for (const r of highReasons) {
    for (const t of themesFor(r)) themeCounts.set(t, (themeCounts.get(t) ?? 0) + 1);
  }
  const topTheme = [...themeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (
    topTheme &&
    topTheme[0] !== "Other" &&
    topTheme[1] >= T.themeMinCount &&
    highReasons.length > 0 &&
    topTheme[1] / highReasons.length >= T.themeShare
  ) {
    signals.push({
      severity: "warning",
      action: "AUTOMATE",
      title: `"${topTheme[0]}" drives ${topTheme[1]} of ${highReasons.length} high-load reports (last 14 days)`,
      detail:
        "A recurring theme eating capacity is a workflow problem, not a headcount problem — automate or redesign it before hiring for it.",
    });
  }

  // WATCH — multiple people in the strain zone today (high load).
  if (today) {
    const strainedToday = members.filter(
      (m) => (m.days.get(today)?.capacity ?? -1) >= T.strainZone
    );
    if (strainedToday.length >= 2) {
      signals.push({
        severity: "warning",
        action: "WATCH",
        title: `${strainedToday.length} people in the strain zone today (${strainedToday.map((m) => m.name.split(" ")[0]).join(", ")})`,
        detail: "Same-day crunch. Check whether it's one deliverable or coincidence.",
      });
    }
  }

  // Instrument health — the data is only as good as the response rate.
  // "Out" days are excused: they count as engaging with the check-in.
  const last7 = lastN(daily, 7);
  const rr =
    last7.length && activeMemberCount
      ? last7.reduce((s, d) => s + d.responded + d.out, 0) /
        (last7.length * activeMemberCount)
      : null;
  if (rr != null && rr < T.responseFloor) {
    signals.push({
      severity: "serious",
      action: "DATA",
      title: `Response rate ${(rr * 100).toFixed(0)}% over the last week — below the ${T.responseFloor * 100}% floor`,
      detail:
        "Below this, the averages stop being trustworthy. Chase the check-in habit before acting on the numbers.",
    });
  }

  if (signals.length === 0) {
    signals.push({
      severity: "good",
      action: "NONE",
      title: "Capacity healthy — no action needed",
      detail: "No structural, individual, or theme signals firing. Keep the cadence.",
    });
  }

  const order = { critical: 0, serious: 1, warning: 2, good: 3 };
  return signals.sort((a, b) => order[a.severity] - order[b.severity]);
}
