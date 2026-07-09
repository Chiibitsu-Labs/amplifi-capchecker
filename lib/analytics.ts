/**
 * The "when-to-hire instrument": turns raw check-ins into the signals and
 * thresholds Michele uses to decide hire / automate-or-redesign / rebalance.
 * Pure functions — no I/O — so every rule is testable and explainable.
 */

export type DayRow = {
  check_date: string; // YYYY-MM-DD
  member_name: string;
  capacity: number | null;
  reason: string | null;
  client_count: number | null;
};

export type MemberSeries = {
  name: string;
  /** check_date → capacity, only days they responded */
  days: Map<string, { capacity: number; reason: string | null }>;
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
export const THRESHOLDS = {
  redZone: 3, // capacity ≤ 3 = strained
  structuralLine: 5, // team avg below this = overloaded day
  structuralDays: 7, // ...on ≥7 of last 10 working days = hire signal
  minHistoryDays: 10, // days of data before structural calls are trusted
  strainAvg: 3.5, // member 5-day avg ≤ this = individual strain
  strainGap: 2, // ...while team is ≥ this much higher = rebalance
  themeShare: 0.4, // one theme ≥40% of low-capacity reasons = automate
  themeMinCount: 3,
  responseFloor: 0.7, // 7-day response rate below this = data warning
} as const;

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
    if (r.capacity == null) continue;
    dateSet.add(r.check_date);
    let m = byMember.get(r.member_name);
    if (!m) {
      m = { name: r.member_name, days: new Map(), latestReason: null, latestClientCount: null };
      byMember.set(r.member_name, m);
    }
    m.days.set(r.check_date, { capacity: r.capacity, reason: r.reason });
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
): { date: string; avg: number; responded: number }[] {
  return dates.map((date) => {
    const caps = members
      .map((m) => m.days.get(date)?.capacity)
      .filter((c): c is number => c != null);
    return {
      date,
      avg: caps.length ? caps.reduce((s, c) => s + c, 0) / caps.length : 0,
      responded: caps.length,
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
  activeMemberCount: number
): Signal[] {
  const signals: Signal[] = [];
  const daily = teamAverageByDate(members, dates);
  const today = dates[dates.length - 1];

  // Data confidence gate — structural calls need history.
  if (dates.length < THRESHOLDS.minHistoryDays) {
    signals.push({
      severity: "warning",
      action: "DATA",
      title: `Calibrating — ${dates.length}/${THRESHOLDS.minHistoryDays} working days of data`,
      detail:
        "Structural signals (hire / automate) unlock at 10 working days. Daily and individual reads below are already live.",
    });
  }

  // HIRE — sustained team-wide overload.
  if (dates.length >= THRESHOLDS.minHistoryDays) {
    const last10 = lastN(daily, 10);
    const lowDays = last10.filter((d) => d.avg < THRESHOLDS.structuralLine).length;
    if (lowDays >= THRESHOLDS.structuralDays) {
      signals.push({
        severity: "critical",
        action: "HIRE",
        title: `Structural overload: team below ${THRESHOLDS.structuralLine}/10 on ${lowDays} of the last 10 working days`,
        detail:
          "Sustained team-wide strain that individual fixes won't solve. If the reason themes below aren't automatable, this is the hire signal.",
      });
    }
  }

  // REBALANCE — one person sinking while the team floats.
  const team7 = avg(lastN(daily, 7).map((d) => d.avg));
  for (const m of members) {
    const caps = dates
      .map((d) => m.days.get(d)?.capacity)
      .filter((c): c is number => c != null);
    const m5 = avg(lastN(caps, 5));
    if (
      m5 != null &&
      caps.length >= 3 &&
      m5 <= THRESHOLDS.strainAvg &&
      team7 != null &&
      team7 - m5 >= THRESHOLDS.strainGap
    ) {
      signals.push({
        severity: "serious",
        action: "REBALANCE",
        title: `${m.name} is strained: ${m5.toFixed(1)}/10 average over recent check-ins vs team ${team7.toFixed(1)}`,
        detail:
          "Individual strain while the team has headroom — a workload rebalance or delegation candidate before it becomes attrition.",
      });
    }
  }

  // AUTOMATE — one theme dominating low-capacity days.
  const lowReasons: string[] = [];
  for (const m of members) {
    for (const d of lastN(dates, 14)) {
      const day = m.days.get(d);
      if (day && day.capacity <= THRESHOLDS.structuralLine && day.reason) {
        lowReasons.push(day.reason);
      }
    }
  }
  const themeCounts = new Map<string, number>();
  for (const r of lowReasons) {
    for (const t of themesFor(r)) themeCounts.set(t, (themeCounts.get(t) ?? 0) + 1);
  }
  const topTheme = [...themeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (
    topTheme &&
    topTheme[0] !== "Other" &&
    topTheme[1] >= THRESHOLDS.themeMinCount &&
    lowReasons.length > 0 &&
    topTheme[1] / lowReasons.length >= THRESHOLDS.themeShare
  ) {
    signals.push({
      severity: "warning",
      action: "AUTOMATE",
      title: `"${topTheme[0]}" drives ${topTheme[1]} of ${lowReasons.length} low-capacity reports (last 14 days)`,
      detail:
        "A recurring theme eating capacity is a workflow problem, not a headcount problem — automate or redesign it before hiring for it.",
    });
  }

  // WATCH — multiple people in the red zone today.
  if (today) {
    const redToday = members.filter(
      (m) => (m.days.get(today)?.capacity ?? 99) <= THRESHOLDS.redZone
    );
    if (redToday.length >= 2) {
      signals.push({
        severity: "warning",
        action: "WATCH",
        title: `${redToday.length} people in the red zone today (${redToday.map((m) => m.name.split(" ")[0]).join(", ")})`,
        detail: "Same-day crunch. Check whether it's one deliverable or coincidence.",
      });
    }
  }

  // Instrument health — the data is only as good as the response rate.
  const last7 = lastN(daily, 7);
  const rr =
    last7.length && activeMemberCount
      ? last7.reduce((s, d) => s + d.responded, 0) / (last7.length * activeMemberCount)
      : null;
  if (rr != null && rr < THRESHOLDS.responseFloor) {
    signals.push({
      severity: "serious",
      action: "DATA",
      title: `Response rate ${(rr * 100).toFixed(0)}% over the last week — below the ${THRESHOLDS.responseFloor * 100}% floor`,
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
