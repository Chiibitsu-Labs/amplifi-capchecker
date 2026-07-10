import { supabase } from "@/lib/supabase";
import { localDateString } from "@/lib/dates";
import { isDashboardAuthed } from "@/lib/dashboardAuth";
import { DASHBOARD_CSS } from "@/lib/theme";
import { LoginGate } from "@/components/LoginGate";
import { getThresholds } from "@/lib/settings";
import {
  buildSeries,
  computeSignals,
  DayRow,
  MemberSeries,
  postEpochDates,
  Signal,
  SCALE_EPOCH,
  teamAverageByDate,
  themesFor,
} from "@/lib/analytics";

export const dynamic = "force-dynamic";

// ── Data ────────────────────────────────────────────────────────────────────

type ClientRow = { member_id: string; client_name: string; task_context: string | null };
type MemberRow = { id: string; name: string; is_active: boolean };

async function getData(): Promise<{
  rows: DayRow[];
  members: MemberRow[];
  clients: ClientRow[];
} | null> {
  try {
    const sb = supabase();
    const [checkins, members, clients] = await Promise.all([
      sb
        .from("capchecker_daily_view")
        .select("check_date, member_name, capacity, reason, client_count, status")
        .order("check_date", { ascending: true })
        .limit(2000),
      sb.from("capchecker_members").select("id, name, is_active"),
      sb
        .from("capchecker_clients")
        .select("member_id, client_name, task_context")
        .eq("is_current", true),
    ]);
    if (checkins.error) throw checkins.error;
    if (members.error) throw members.error;
    if (clients.error) throw clients.error;
    return {
      rows: (checkins.data as DayRow[]) ?? [],
      members: (members.data as MemberRow[]) ?? [],
      clients: (clients.data as ClientRow[]) ?? [],
    };
  } catch {
    return null;
  }
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function Home({
  searchParams,
}: {
  searchParams: { key?: string; error?: string };
}) {
  if (!isDashboardAuthed(searchParams.key)) {
    return <LoginGate error={searchParams.error === "1"} redirectTo="/" title="Capacity Dashboard" />;
  }

  const data = await getData();
  if (!data) {
    return (
      <main className="viz-root" style={{ maxWidth: 640, margin: "0 auto", padding: "64px 20px" }}>
        <style>{DASHBOARD_CSS}</style>
        <h1 style={{ fontSize: 20 }}>Capacity Dashboard</h1>
        <p className="sub">Not connected to Supabase yet — check env vars and the migration.</p>
      </main>
    );
  }

  const { thresholds: T } = await getThresholds();
  const activeMembers = data.members.filter((m) => m.is_active);
  const { members, dates: allDates } = buildSeries(data.rows);
  // Every aggregate view (signals, KPIs, heatmap, trend, theme analysis)
  // only trusts days on/after the scale flip's epoch — see SCALE_EPOCH.
  // Older rows stay visible, unfiltered, in the raw check-in log below.
  const dates = postEpochDates(allDates);
  const daily = teamAverageByDate(members, dates);
  const signals = computeSignals(members, dates, activeMembers.length, T);

  const today = localDateString();
  const todayRow = daily.find((d) => d.date === today);
  const prevRow = daily.filter((d) => d.date < today).slice(-1)[0];
  const last7 = daily.slice(-7);
  const avg7 = last7.length ? last7.reduce((s, d) => s + d.avg, 0) / last7.length : null;
  const responseRate =
    last7.length && activeMembers.length
      ? last7.reduce((s, d) => s + d.responded + d.out, 0) /
        (last7.length * activeMembers.length)
      : null;
  const strainedToday = members.filter(
    (m) => (m.days.get(today)?.capacity ?? -1) >= T.strainZone
  ).length;

  const clientsByMemberName = new Map<string, ClientRow[]>();
  for (const c of data.clients) {
    const member = data.members.find((m) => m.id === c.member_id);
    if (!member) continue;
    const list = clientsByMemberName.get(member.name) ?? [];
    list.push(c);
    clientsByMemberName.set(member.name, list);
  }

  // Theme counts on high-load days (last 14 recorded days)
  const themeCounts = new Map<string, number>();
  for (const m of members) {
    for (const d of dates.slice(-14)) {
      const day = m.days.get(d);
      if (day && day.capacity >= T.structuralLine && day.reason) {
        for (const t of themesFor(day.reason)) {
          themeCounts.set(t, (themeCounts.get(t) ?? 0) + 1);
        }
      }
    }
  }
  const themes = [...themeCounts.entries()].sort((a, b) => b[1] - a[1]);

  const heatDates = dates.slice(-15);
  const recentRows = [...data.rows].reverse().slice(0, 40);
  const hasPreEpochRows = recentRows.some((r) => r.check_date < SCALE_EPOCH);
  const aboutHref = searchParams.key ? `/about?key=${encodeURIComponent(searchParams.key)}` : "/about";

  return (
    <main className="viz-root">
      <style>{DASHBOARD_CSS}</style>

      <header>
        <div className="brandrow">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Amplifi" className="logo" />
          <span className="producttag">Capacity Dashboard</span>
        </div>
        <p className="sub">
          Daily team capacity, the signals behind it, and what to do about them —{" "}
          hire, automate, or rebalance. Updated live from Telegram check-ins.{" "}
          <a href={aboutHref} className="navlink">Guide &amp; limitations →</a>
        </p>
      </header>

      <SignalPanel signals={signals} />

      <section className="tiles">
        <Tile
          label="Team load today"
          value={todayRow ? todayRow.avg.toFixed(1) : "—"}
          suffix={todayRow ? "/10" : ""}
          higherIsBad
          delta={
            todayRow && prevRow
              ? { value: todayRow.avg - prevRow.avg, vs: "yesterday" }
              : undefined
          }
        />
        <Tile label="7-day average" value={avg7 != null ? avg7.toFixed(1) : "—"} suffix={avg7 != null ? "/10" : ""} />
        <Tile
          label="Response rate (7d)"
          value={responseRate != null ? `${Math.round(responseRate * 100)}%` : "—"}
        />
        <Tile label={`Strain zone today (≥${T.strainZone})`} value={String(strainedToday)} alert={strainedToday > 0} />
      </section>

      <section className="card">
        <h2>Who&rsquo;s strained, when</h2>
        <p className="cardsub">
          Daily load per person. Orange = swamped, blue = open; the number is the rating they
          gave (10 = drowning, 1 = wide open).
        </p>
        <Heatmap members={members} dates={heatDates} />
        <div className="binlegend">
          <span><i className="sw b5" />1–2 wide open</span>
          <span><i className="sw b4" />3–4 open</span>
          <span><i className="sw b3" />5–6 holding</span>
          <span><i className="sw b2" />7–8 stretched</span>
          <span><i className="sw b1" />9–10 drowning</span>
          <span>🤒 out (sick/leave)</span>
        </div>
      </section>

      <div className="two">
        <section className="card">
          <h2>Team trend</h2>
          <p className="cardsub">Daily team load average. The hairline at {T.structuralLine} is the structural line — sustained time above it is the hire conversation.</p>
          <TrendLine daily={daily} structuralLine={T.structuralLine} />
        </section>

        <section className="card">
          <h2>What&rsquo;s eating capacity</h2>
          <p className="cardsub">
            Themes in the &ldquo;why&rdquo; on high-load days (≥{T.structuralLine}/10, last 14 days). A dominant theme is an
            automate/redesign signal — not a hiring one.
          </p>
          {themes.length === 0 ? (
            <p className="empty">No high-load days recorded yet. Good problem to have.</p>
          ) : (
            <ThemeBars themes={themes} />
          )}
        </section>
      </div>

      <section className="card">
        <h2>The team</h2>
        <div className="memgrid">
          {members.map((m) => (
            <MemberCard
              key={m.name}
              member={m}
              dates={dates}
              today={today}
              clients={clientsByMemberName.get(m.name) ?? []}
            />
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Check-in log</h2>
        {hasPreEpochRows && (
          <p className="cardsub">
            Rows before {SCALE_EPOCH} used the old, ambiguous scale (before the 10 = drowning
            convention) — kept here for the record, but excluded from every chart and signal
            above.
          </p>
        )}
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Member</th><th>Cap</th><th>Clients</th><th>Why</th>
              </tr>
            </thead>
            <tbody>
              {recentRows.map((r, i) => (
                <tr key={i}>
                  <td className="num">{r.check_date}</td>
                  <td>{r.member_name}</td>
                  <td className="num">{r.capacity ?? (r.status === "out" ? "🤒" : "—")}</td>
                  <td className="num">{r.client_count ?? "—"}</td>
                  <td className="why">{r.reason ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer>
        <h3>How the signals are computed</h3>
        <ul>
          <li><b>Hire</b> — team average above {T.structuralLine}/10 on {T.structuralDays}+ of the last 10 working days (needs {T.minHistoryDays} days of history).</li>
          <li><b>Rebalance</b> — a member averaging ≥{T.strainAvg} over recent check-ins while the team sits ≥{T.strainGap} points lower.</li>
          <li><b>Automate / redesign</b> — one theme behind ≥{T.themeShare * 100}% of high-load reports (min {T.themeMinCount}).</li>
          <li><b>Data health</b> — response rate under {T.responseFloor * 100}% means don&rsquo;t trust the averages yet.</li>
        </ul>
        <p>Thresholds are starting points — tune them as the data accumulates.</p>
      </footer>
    </main>
  );
}

// ── Components ──────────────────────────────────────────────────────────────

function SignalPanel({ signals }: { signals: Signal[] }) {
  // No red anywhere in the brand palette — critical escalates via symbol
  // (siren), not a darker red, so it never reintroduces the color.
  const icon = { critical: "🚨", serious: "🟠", warning: "🟡", good: "🟢" } as const;
  const actionLabel = {
    HIRE: "Hire signal",
    REBALANCE: "Rebalance",
    AUTOMATE: "Automate / redesign",
    WATCH: "Watch today",
    DATA: "Data health",
    NONE: "All clear",
  } as const;
  return (
    <section className="signals">
      {signals.map((s, i) => (
        <div key={i} className={`signal sev-${s.severity}`}>
          <div className="sigtop">
            <span className="sigicon" aria-hidden>{icon[s.severity]}</span>
            <span className="sigaction">{actionLabel[s.action]}</span>
          </div>
          <div className="sigtitle">{s.title}</div>
          <div className="sigdetail">{s.detail}</div>
        </div>
      ))}
    </section>
  );
}

function Tile({
  label,
  value,
  suffix = "",
  delta,
  alert = false,
  higherIsBad = false,
}: {
  label: string;
  value: string;
  suffix?: string;
  delta?: { value: number; vs: string };
  alert?: boolean;
  higherIsBad?: boolean;
}) {
  // With load semantics (10 = drowning) a rising number is worse, so the
  // delta color follows meaning, not sign.
  const good = delta ? (higherIsBad ? delta.value < 0 : delta.value > 0) : false;
  return (
    <div className="tile">
      <div className="tilelabel">{label}</div>
      <div className={`tilevalue${alert ? " alertval" : ""}`}>
        {value}
        {suffix && <span className="tilesuffix">{suffix}</span>}
      </div>
      {delta && Math.abs(delta.value) >= 0.05 && (
        <div className={`tiledelta ${good ? "up" : "down"}`}>
          {delta.value > 0 ? "▲" : "▼"} {Math.abs(delta.value).toFixed(1)} vs {delta.vs}
        </div>
      )}
    </div>
  );
}

// Load bins: HIGH = strained (10 = drowning → b1 orange), LOW = open (b5 blue).
function binClass(cap: number): string {
  if (cap >= 9) return "b1";
  if (cap >= 7) return "b2";
  if (cap >= 5) return "b3";
  if (cap >= 3) return "b4";
  return "b5";
}

function shortDate(d: string): string {
  return d.slice(5).replace("-", "/");
}

function Heatmap({ members, dates }: { members: MemberSeries[]; dates: string[] }) {
  if (dates.length === 0) return <p className="empty">No check-ins yet.</p>;
  return (
    <div className="heatwrap">
      <div
        className="heat"
        style={{ gridTemplateColumns: `minmax(90px, 140px) repeat(${dates.length}, minmax(34px, 1fr))` }}
      >
        <div />
        {dates.map((d) => (
          <div key={d} className="heathead">{shortDate(d)}</div>
        ))}
        {members.map((m) => (
          <HeatRow key={m.name} member={m} dates={dates} />
        ))}
      </div>
    </div>
  );
}

function HeatRow({ member, dates }: { member: MemberSeries; dates: string[] }) {
  return (
    <>
      <div className="heatname">{member.name.split(" ")[0]}</div>
      {dates.map((d) => {
        if (member.outDays.has(d)) {
          return (
            <div key={d} className="cell outday" title={`${member.name} · ${d}: out (sick/leave)`}>
              🤒
            </div>
          );
        }
        const day = member.days.get(d);
        if (!day) return <div key={d} className="cell miss" title={`${member.name} · ${d}: no check-in`} />;
        return (
          <div
            key={d}
            className={`cell ${binClass(day.capacity)}`}
            title={`${member.name} · ${d}: ${day.capacity}/10${day.reason ? ` — ${day.reason}` : ""}`}
          >
            {day.capacity}
          </div>
        );
      })}
    </>
  );
}

function TrendLine({
  daily,
  structuralLine,
}: {
  daily: { date: string; avg: number }[];
  structuralLine: number;
}) {
  if (daily.length === 0) return <p className="empty">No data yet.</p>;
  const W = 640, H = 180, PAD_L = 26, PAD_R = 44, PAD_T = 12, PAD_B = 24;
  const n = daily.length;
  const x = (i: number) =>
    n === 1 ? (W - PAD_L - PAD_R) / 2 + PAD_L : PAD_L + (i * (W - PAD_L - PAD_R)) / (n - 1);
  const y = (v: number) => PAD_T + ((10 - v) * (H - PAD_T - PAD_B)) / 9; // scale 1..10
  const pts = daily.map((d, i) => `${x(i)},${y(d.avg)}`).join(" ");
  const last = daily[n - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="trend" role="img" aria-label="Team average capacity by day">
      {[2, 4, 6, 8, 10].map((v) => (
        <g key={v}>
          <line x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} className="grid" />
          <text x={PAD_L - 6} y={y(v) + 3} className="tick" textAnchor="end">{v}</text>
        </g>
      ))}
      <line
        x1={PAD_L} x2={W - PAD_R}
        y1={y(structuralLine)} y2={y(structuralLine)}
        className="threshold"
      />
      {n > 1 && <polyline points={pts} className="line" />}
      {daily.map((d, i) => (
        <circle key={d.date} cx={x(i)} cy={y(d.avg)} r={4.5} className="dot">
          <title>{`${d.date}: ${d.avg.toFixed(1)}/10`}</title>
        </circle>
      ))}
      <text x={x(n - 1) + 10} y={y(last.avg) + 4} className="endlabel">{last.avg.toFixed(1)}</text>
      {daily.map((d, i) =>
        n <= 10 || i % Math.ceil(n / 10) === 0 || i === n - 1 ? (
          <text key={d.date} x={x(i)} y={H - 6} className="tick" textAnchor="middle">
            {shortDate(d.date)}
          </text>
        ) : null
      )}
    </svg>
  );
}

function ThemeBars({ themes }: { themes: [string, number][] }) {
  const max = themes[0][1];
  return (
    <div className="themebars">
      {themes.map(([name, count]) => (
        <div key={name} className="themerow">
          <div className="themelabel">{name}</div>
          <div className="themetrack">
            <div className="themebar" style={{ width: `${(count / max) * 100}%` }} />
            <span className="themecount">{count}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function MemberCard({
  member,
  dates,
  today,
  clients,
}: {
  member: MemberSeries;
  dates: string[];
  today: string;
  clients: ClientRow[];
}) {
  const todayCap = member.days.get(today)?.capacity ?? null;
  const caps = dates
    .map((d) => member.days.get(d)?.capacity)
    .filter((c): c is number => c != null)
    .slice(-12);
  return (
    <div className="mem">
      <div className="memtop">
        <span className="memname">{member.name}</span>
        <span className={`memchip ${todayCap != null ? binClass(todayCap) : "miss"}`}>
          {todayCap != null
            ? `${todayCap}/10`
            : member.outDays.has(today)
              ? "out today 🤒"
              : "no check-in"}
        </span>
      </div>
      <Sparkline caps={caps} />
      {member.latestReason && <p className="memreason">&ldquo;{member.latestReason}&rdquo;</p>}
      {clients.length > 0 && (
        <ul className="memclients">
          {clients.map((c, i) => (
            <li key={i}>
              <b>{c.client_name}</b>
              {c.task_context ? ` — ${c.task_context}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Sparkline({ caps }: { caps: number[] }) {
  if (caps.length < 2) return null;
  const W = 200, H = 36, P = 4;
  const x = (i: number) => P + (i * (W - 2 * P)) / (caps.length - 1);
  const y = (v: number) => P + ((10 - v) * (H - 2 * P)) / 9;
  const pts = caps.map((c, i) => `${x(i)},${y(c)}`).join(" ");
  const li = caps.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="spark" role="img" aria-label="Recent capacity trend">
      <polyline points={pts} className="sparkline" />
      <circle cx={x(li)} cy={y(caps[li])} r={3.5} className="sparkdot" />
    </svg>
  );
}

