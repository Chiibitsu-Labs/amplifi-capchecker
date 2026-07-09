import { supabase } from "@/lib/supabase";
import { localDateString } from "@/lib/dates";
import { config } from "@/lib/config";
import {
  buildSeries,
  computeSignals,
  DayRow,
  MemberSeries,
  Signal,
  teamAverageByDate,
  themesFor,
  THRESHOLDS,
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
        .select("check_date, member_name, capacity, reason, client_count")
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
  searchParams: { key?: string };
}) {
  if (config.dashboardPassword && searchParams.key !== config.dashboardPassword) {
    return (
      <main className="viz-root" style={{ maxWidth: 480, margin: "0 auto", padding: "96px 20px" }}>
        <style>{CSS}</style>
        <h1 style={{ fontSize: 20 }}>🔒 Amplifi Capacity Instrument</h1>
        <p className="sub">
          This dashboard is private. Open it with the access link (…/?key=…) shared by your admin.
        </p>
      </main>
    );
  }

  const data = await getData();
  if (!data) {
    return (
      <main className="viz-root" style={{ maxWidth: 640, margin: "0 auto", padding: "64px 20px" }}>
        <style>{CSS}</style>
        <h1 style={{ fontSize: 20 }}>Amplifi Capacity Instrument</h1>
        <p className="sub">Not connected to Supabase yet — check env vars and the migration.</p>
      </main>
    );
  }

  const activeMembers = data.members.filter((m) => m.is_active);
  const { members, dates } = buildSeries(data.rows);
  const daily = teamAverageByDate(members, dates);
  const signals = computeSignals(members, dates, activeMembers.length);

  const today = localDateString();
  const todayRow = daily.find((d) => d.date === today);
  const prevRow = daily.filter((d) => d.date < today).slice(-1)[0];
  const last7 = daily.slice(-7);
  const avg7 = last7.length ? last7.reduce((s, d) => s + d.avg, 0) / last7.length : null;
  const responseRate =
    last7.length && activeMembers.length
      ? last7.reduce((s, d) => s + d.responded, 0) / (last7.length * activeMembers.length)
      : null;
  const redToday = members.filter(
    (m) => (m.days.get(today)?.capacity ?? 99) <= THRESHOLDS.redZone
  ).length;

  const clientsByMemberName = new Map<string, ClientRow[]>();
  for (const c of data.clients) {
    const member = data.members.find((m) => m.id === c.member_id);
    if (!member) continue;
    const list = clientsByMemberName.get(member.name) ?? [];
    list.push(c);
    clientsByMemberName.set(member.name, list);
  }

  // Theme counts on low-capacity days (last 14 recorded days)
  const themeCounts = new Map<string, number>();
  for (const m of members) {
    for (const d of dates.slice(-14)) {
      const day = m.days.get(d);
      if (day && day.capacity <= THRESHOLDS.structuralLine && day.reason) {
        for (const t of themesFor(day.reason)) {
          themeCounts.set(t, (themeCounts.get(t) ?? 0) + 1);
        }
      }
    }
  }
  const themes = [...themeCounts.entries()].sort((a, b) => b[1] - a[1]);

  const heatDates = dates.slice(-15);
  const recentRows = [...data.rows].reverse().slice(0, 40);

  return (
    <main className="viz-root">
      <style>{CSS}</style>

      <header>
        <h1>Amplifi Capacity Instrument</h1>
        <p className="sub">
          Daily team capacity, the signals behind it, and what to do about them —{" "}
          hire, automate, or rebalance. Updated live from Telegram check-ins.
        </p>
      </header>

      <SignalPanel signals={signals} />

      <section className="tiles">
        <Tile
          label="Team capacity today"
          value={todayRow ? todayRow.avg.toFixed(1) : "—"}
          suffix={todayRow ? "/10" : ""}
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
        <Tile label="Red zone today (≤3)" value={String(redToday)} alert={redToday > 0} />
      </section>

      <section className="card">
        <h2>Who's strained, when</h2>
        <p className="cardsub">
          Capacity per person per working day. Red = strained, blue = open; the number is the
          rating they gave.
        </p>
        <Heatmap members={members} dates={heatDates} />
        <div className="binlegend">
          <span><i className="sw b1" />1–2 drowning</span>
          <span><i className="sw b2" />3–4 strained</span>
          <span><i className="sw b3" />5–6 holding</span>
          <span><i className="sw b4" />7–8 open</span>
          <span><i className="sw b5" />9–10 wide open</span>
        </div>
      </section>

      <div className="two">
        <section className="card">
          <h2>Team trend</h2>
          <p className="cardsub">Daily team average. The hairline at {THRESHOLDS.structuralLine} is the structural line — sustained time below it is the hire conversation.</p>
          <TrendLine daily={daily} />
        </section>

        <section className="card">
          <h2>What's eating capacity</h2>
          <p className="cardsub">
            Themes in the "why" on low days (≤{THRESHOLDS.structuralLine}/10, last 14 days). A dominant theme is an
            automate/redesign signal — not a hiring one.
          </p>
          {themes.length === 0 ? (
            <p className="empty">No low-capacity days recorded yet. Good problem to have.</p>
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
                <td className="num">{r.capacity ?? "—"}</td>
                <td className="num">{r.client_count ?? "—"}</td>
                <td className="why">{r.reason ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer>
        <h3>How the signals are computed</h3>
        <ul>
          <li><b>Hire</b> — team average below {THRESHOLDS.structuralLine}/10 on {THRESHOLDS.structuralDays}+ of the last 10 working days (needs {THRESHOLDS.minHistoryDays} days of history).</li>
          <li><b>Rebalance</b> — a member averaging ≤{THRESHOLDS.strainAvg} over recent check-ins while the team sits ≥{THRESHOLDS.strainGap} points higher.</li>
          <li><b>Automate / redesign</b> — one theme behind ≥{THRESHOLDS.themeShare * 100}% of low-capacity reports (min {THRESHOLDS.themeMinCount}).</li>
          <li><b>Data health</b> — response rate under {THRESHOLDS.responseFloor * 100}% means don't trust the averages yet.</li>
        </ul>
        <p>Thresholds are starting points — tune them as the data accumulates.</p>
      </footer>
    </main>
  );
}

// ── Components ──────────────────────────────────────────────────────────────

function SignalPanel({ signals }: { signals: Signal[] }) {
  const icon = { critical: "🔴", serious: "🟠", warning: "🟡", good: "🟢" } as const;
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
}: {
  label: string;
  value: string;
  suffix?: string;
  delta?: { value: number; vs: string };
  alert?: boolean;
}) {
  return (
    <div className="tile">
      <div className="tilelabel">{label}</div>
      <div className={`tilevalue${alert ? " alertval" : ""}`}>
        {value}
        {suffix && <span className="tilesuffix">{suffix}</span>}
      </div>
      {delta && Math.abs(delta.value) >= 0.05 && (
        <div className={`tiledelta ${delta.value > 0 ? "up" : "down"}`}>
          {delta.value > 0 ? "▲" : "▼"} {Math.abs(delta.value).toFixed(1)} vs {delta.vs}
        </div>
      )}
    </div>
  );
}

function binClass(cap: number): string {
  if (cap <= 2) return "b1";
  if (cap <= 4) return "b2";
  if (cap <= 6) return "b3";
  if (cap <= 8) return "b4";
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

function TrendLine({ daily }: { daily: { date: string; avg: number }[] }) {
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
        y1={y(THRESHOLDS.structuralLine)} y2={y(THRESHOLDS.structuralLine)}
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
          {todayCap != null ? `${todayCap}/10` : "no check-in"}
        </span>
      </div>
      <Sparkline caps={caps} />
      {member.latestReason && <p className="memreason">"{member.latestReason}"</p>}
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

// ── Styles (reference dataviz palette; light default + selected dark) ───────

const CSS = `
.viz-root {
  --plane: #f9f9f7; --surface: #fcfcfb;
  --ink: #0b0b0b; --ink2: #52514e; --muted: #898781;
  --grid: #e1e0d9; --baseline: #c3c2b7; --ring: rgba(11,11,11,0.10);
  --accent: #2a78d6;
  --b1: #e34948; --b1-ink: #ffffff;
  --b2: #f0a09f; --b2-ink: #0b0b0b;
  --b3: #f0efec; --b3-ink: #52514e;
  --b4: #9ec5f4; --b4-ink: #0b0b0b;
  --b5: #2a78d6; --b5-ink: #ffffff;
  --good: #0ca30c; --warning: #fab219; --serious: #ec835a; --critical: #d03b3b;
  --good-text: #006300;
}
@media (prefers-color-scheme: dark) {
  .viz-root {
    --plane: #0d0d0d; --surface: #1a1a19;
    --ink: #ffffff; --ink2: #c3c2b7; --muted: #898781;
    --grid: #2c2c2a; --baseline: #383835; --ring: rgba(255,255,255,0.10);
    --accent: #3987e5;
    --b1: #e66767; --b1-ink: #0b0b0b;
    --b2: #7a4544; --b2-ink: #ffffff;
    --b3: #383835; --b3-ink: #c3c2b7;
    --b4: #2f4d75; --b4-ink: #ffffff;
    --b5: #3987e5; --b5-ink: #0b0b0b;
    --good-text: #0ca30c;
  }
}
html, body { background: var(--plane); }
.viz-root {
  max-width: 1040px; margin: 0 auto; padding: 40px 20px 64px;
  background: var(--plane); color: var(--ink);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}
header h1 { font-size: 24px; margin: 0 0 4px; }
.sub { color: var(--ink2); margin: 0 0 24px; max-width: 640px; }

.signals { display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px; }
.signal { background: var(--surface); border: 1px solid var(--ring); border-radius: 10px; padding: 14px 16px; border-left-width: 4px; }
.signal.sev-critical { border-left-color: var(--critical); }
.signal.sev-serious { border-left-color: var(--serious); }
.signal.sev-warning { border-left-color: var(--warning); }
.signal.sev-good { border-left-color: var(--good); }
.sigtop { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.sigaction { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink2); }
.sigtitle { font-weight: 600; }
.sigdetail { color: var(--ink2); font-size: 14px; margin-top: 2px; }

.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 24px; }
.tile { background: var(--surface); border: 1px solid var(--ring); border-radius: 10px; padding: 14px 16px; }
.tilelabel { color: var(--ink2); font-size: 12px; margin-bottom: 4px; }
.tilevalue { font-size: 26px; font-weight: 600; }
.tilevalue.alertval { color: var(--critical); }
.tilesuffix { font-size: 14px; font-weight: 400; color: var(--muted); margin-left: 2px; }
.tiledelta { font-size: 12px; margin-top: 2px; }
.tiledelta.up { color: var(--good-text); }
.tiledelta.down { color: var(--critical); }

.card { background: var(--surface); border: 1px solid var(--ring); border-radius: 10px; padding: 18px 20px; margin-bottom: 20px; }
.card h2 { font-size: 15px; margin: 0 0 2px; }
.cardsub { color: var(--ink2); font-size: 13px; margin: 0 0 14px; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
@media (max-width: 760px) { .two { grid-template-columns: 1fr; } }
.empty { color: var(--muted); font-size: 14px; }

.heatwrap { overflow-x: auto; }
.heat { display: grid; gap: 2px; min-width: 560px; }
.heathead { font-size: 10px; color: var(--muted); text-align: center; align-self: end; padding-bottom: 2px; font-variant-numeric: tabular-nums; }
.heatname { font-size: 13px; color: var(--ink2); align-self: center; padding-right: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cell { height: 30px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; cursor: default; }
.cell.miss { background: transparent; border: 1px solid var(--grid); }
.cell.b1 { background: var(--b1); color: var(--b1-ink); }
.cell.b2 { background: var(--b2); color: var(--b2-ink); }
.cell.b3 { background: var(--b3); color: var(--b3-ink); }
.cell.b4 { background: var(--b4); color: var(--b4-ink); }
.cell.b5 { background: var(--b5); color: var(--b5-ink); }
.binlegend { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 12px; font-size: 12px; color: var(--ink2); }
.binlegend .sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
.sw.b1 { background: var(--b1); } .sw.b2 { background: var(--b2); } .sw.b3 { background: var(--b3); border: 1px solid var(--grid); } .sw.b4 { background: var(--b4); } .sw.b5 { background: var(--b5); }

.trend { width: 100%; height: auto; }
.trend .grid { stroke: var(--grid); stroke-width: 1; }
.trend .threshold { stroke: var(--serious); stroke-width: 1; }
.trend .tick { fill: var(--muted); font-size: 10px; font-variant-numeric: tabular-nums; }
.trend .line { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.trend .dot { fill: var(--accent); stroke: var(--surface); stroke-width: 2; }
.trend .endlabel { fill: var(--ink); font-size: 12px; font-weight: 600; }

.themebars { display: flex; flex-direction: column; gap: 10px; }
.themerow { display: grid; grid-template-columns: 140px 1fr; gap: 10px; align-items: center; }
.themelabel { font-size: 13px; color: var(--ink2); }
.themetrack { display: flex; align-items: center; gap: 8px; }
.themebar { height: 16px; background: var(--accent); border-radius: 0 4px 4px 0; min-width: 3px; }
.themecount { font-size: 12px; color: var(--ink); font-weight: 600; }

.memgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
.mem { border: 1px solid var(--ring); border-radius: 10px; padding: 12px 14px; }
.memtop { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
.memname { font-weight: 600; font-size: 14px; }
.memchip { font-size: 12px; font-weight: 600; border-radius: 999px; padding: 2px 9px; white-space: nowrap; }
.memchip.miss { color: var(--muted); border: 1px solid var(--grid); }
.memchip.b1 { background: var(--b1); color: var(--b1-ink); }
.memchip.b2 { background: var(--b2); color: var(--b2-ink); }
.memchip.b3 { background: var(--b3); color: var(--b3-ink); }
.memchip.b4 { background: var(--b4); color: var(--b4-ink); }
.memchip.b5 { background: var(--b5); color: var(--b5-ink); }
.spark { width: 100%; max-width: 200px; height: 36px; display: block; margin: 4px 0; }
.sparkline { fill: none; stroke: var(--baseline); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.sparkdot { fill: var(--accent); stroke: var(--surface); stroke-width: 2; }
.memreason { color: var(--ink2); font-size: 12px; font-style: italic; margin: 6px 0; }
.memclients { margin: 6px 0 0; padding-left: 16px; font-size: 12px; color: var(--ink2); }
.memclients b { color: var(--ink); font-weight: 600; }

table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { text-align: left; color: var(--muted); font-weight: 500; padding: 6px 10px; }
td { padding: 6px 10px; border-top: 1px solid var(--grid); vertical-align: top; }
td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
td.why { color: var(--ink2); }

footer { color: var(--ink2); font-size: 13px; margin-top: 8px; }
footer h3 { font-size: 13px; color: var(--ink); margin-bottom: 6px; }
footer ul { padding-left: 18px; margin: 0 0 8px; }
footer li { margin-bottom: 3px; }
`;
