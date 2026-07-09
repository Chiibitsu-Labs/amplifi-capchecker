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
      ? last7.reduce((s, d) => s + d.responded + d.out, 0) /
        (last7.length * activeMembers.length)
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
        <div className="brandrow">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Amplifi" className="logo" />
          <span className="producttag">Capacity Instrument</span>
        </div>
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
          <span>🤒 out (sick/leave)</span>
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
          {todayCap != null
            ? `${todayCap}/10`
            : member.outDays.has(today)
              ? "out today 🤒"
              : "no check-in"}
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
/* Amplifi brand, verified against the live site (amplifihq.com), not the
   earlier hallucinated guide: white-dominant marketing site, NAVY BLUE as
   the real dark color (not black), one warm ORANGE used consistently for
   every CTA and stat callout, GOLD reserved for the logo mark only. No red/
   purple/green appear anywhere on the real site.
   This is a COO daily-scan tool, so we stay dark for scan speed — but the
   dark anchor is Amplifi's own navy, and orange carries the "attention"
   semantic exactly as it does on their site (CTA = act; here, critical
   signal = act). That's what makes it feel like an Amplifi tool, not a
   generic dark dashboard. Dark-locked; mobile-first. */
.viz-root {
  color-scheme: dark;
  --plane: #0a0e24; --surface: #11163a; --surface-2: #161c46;
  --ink: #ffffff; --ink2: #b7bad0; --muted: #7d81a3;
  --grid: #232a52; --baseline: #333a66; --ring: rgba(255,255,255,0.09);
  --gold: #eaa93c;
  --accent: #5c86e6;
  /* Diverging strain→open scale, built from Amplifi's real orange (warm
     pole, "attention" on their site) ↔ navy (cool pole, their brand dark).
     CVD-validated: worst adjacent ΔE 18.8 on this surface. */
  --b1: #d9691b; --b1-ink: #ffffff;   /* 1–2 drowning */
  --b2: #7a4a26; --b2-ink: #ffffff;   /* 3–4 strained */
  --b3: #262b4a; --b3-ink: #d6d8ea;   /* 5–6 holding (neutral) */
  --b4: #2e3e7a; --b4-ink: #ffffff;   /* 7–8 open */
  --b5: #4f6bc4; --b5-ink: #ffffff;   /* 9–10 wide open */
  --good: #2fae4e; --warning: #eaa93c; --serious: #dd7e1b; --critical: #c2490f;
  --good-text: #3fc463;

  margin: 0 auto; max-width: 1080px;
  padding: 20px 14px 56px;
  background: var(--plane); color: var(--ink);
  font-family: var(--font-inter), system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
@media (min-width: 720px) { .viz-root { padding: 36px 24px 64px; } }

.brandrow { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.logo { height: 26px; width: auto; display: block; }
@media (min-width: 720px) { .logo { height: 32px; } }
.producttag {
  font-size: 13px; font-weight: 600; color: var(--ink2);
  padding-left: 12px; border-left: 1px solid var(--grid);
  letter-spacing: 0.01em;
}
@media (min-width: 720px) { .producttag { font-size: 15px; } }
.sub { color: var(--ink2); margin: 14px 0 22px; max-width: 640px; font-size: 14px; line-height: 1.5; }

.signals { display: flex; flex-direction: column; gap: 10px; margin-bottom: 22px; }
.signal { background: var(--surface); border: 1px solid var(--ring); border-radius: 12px; padding: 14px 16px; border-left-width: 3px; }
.signal.sev-critical { border-left-color: var(--critical); }
.signal.sev-serious { border-left-color: var(--serious); }
.signal.sev-warning { border-left-color: var(--warning); }
.signal.sev-good { border-left-color: var(--good); }
.sigtop { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.sigaction { font-size: 11px; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); }
.sigtitle { font-weight: 600; line-height: 1.35; }
.sigdetail { color: var(--ink2); font-size: 13.5px; margin-top: 3px; line-height: 1.45; }

.tiles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 22px; }
@media (min-width: 560px) { .tiles { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); } }
.tile { background: var(--surface); border: 1px solid var(--ring); border-radius: 12px; padding: 13px 15px; }
.tilelabel { color: var(--ink2); font-size: 12px; margin-bottom: 4px; }
.tilevalue { font-size: 26px; font-weight: 700; letter-spacing: -0.01em; }
.tilevalue.alertval { color: var(--critical); }
.tilesuffix { font-size: 14px; font-weight: 400; color: var(--muted); margin-left: 2px; }
.tiledelta { font-size: 12px; margin-top: 2px; }
.tiledelta.up { color: var(--good-text); }
.tiledelta.down { color: var(--critical); }

.card { background: var(--surface); border: 1px solid var(--ring); border-radius: 14px; padding: 16px; margin-bottom: 16px; }
@media (min-width: 720px) { .card { padding: 20px 22px; margin-bottom: 20px; } }
.card h2 { font-size: 15px; margin: 0 0 2px; }
.cardsub { color: var(--ink2); font-size: 13px; margin: 0 0 14px; line-height: 1.45; }
.two { display: grid; grid-template-columns: 1fr; gap: 16px; }
@media (min-width: 760px) { .two { grid-template-columns: 1fr 1fr; gap: 20px; } }
.empty { color: var(--muted); font-size: 14px; }

.heatwrap { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 0 -2px; }
.heat { display: grid; gap: 2px; min-width: 520px; }
.heathead { font-size: 10px; color: var(--muted); text-align: center; align-self: end; padding-bottom: 3px; font-variant-numeric: tabular-nums; }
/* Sticky name column so labels stay visible while the grid scrolls on mobile. */
.heat > div:first-child, .heatname { position: sticky; left: 0; background: var(--surface); z-index: 1; }
.heatname { font-size: 13px; color: var(--ink2); align-self: center; padding-right: 10px; white-space: nowrap; }
.cell { height: 30px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; cursor: default; }
.cell.miss { background: transparent; border: 1px solid var(--grid); }
.cell.outday { background: transparent; border: 1px solid var(--grid); font-size: 13px; }
.cell.b1 { background: var(--b1); color: var(--b1-ink); }
.cell.b2 { background: var(--b2); color: var(--b2-ink); }
.cell.b3 { background: var(--b3); color: var(--b3-ink); }
.cell.b4 { background: var(--b4); color: var(--b4-ink); }
.cell.b5 { background: var(--b5); color: var(--b5-ink); }
.binlegend { display: flex; flex-wrap: wrap; gap: 10px 14px; margin-top: 12px; font-size: 12px; color: var(--ink2); }
.binlegend .sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
.sw.b1 { background: var(--b1); } .sw.b2 { background: var(--b2); } .sw.b3 { background: var(--b3); border: 1px solid var(--grid); } .sw.b4 { background: var(--b4); } .sw.b5 { background: var(--b5); }

.trend { width: 100%; height: auto; }
.trend .grid { stroke: var(--grid); stroke-width: 1; }
.trend .threshold { stroke: var(--gold); stroke-width: 1; }
.trend .tick { fill: var(--muted); font-size: 10px; font-variant-numeric: tabular-nums; }
.trend .line { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.trend .dot { fill: var(--accent); stroke: var(--surface); stroke-width: 2; }
.trend .endlabel { fill: var(--ink); font-size: 12px; font-weight: 600; }

.themebars { display: flex; flex-direction: column; gap: 10px; }
.themerow { display: grid; grid-template-columns: 96px 1fr; gap: 10px; align-items: center; }
@media (min-width: 400px) { .themerow { grid-template-columns: 130px 1fr; } }
.themelabel { font-size: 13px; color: var(--ink2); }
.themetrack { display: flex; align-items: center; gap: 8px; }
.themebar { height: 16px; background: var(--accent); border-radius: 0 4px 4px 0; min-width: 3px; }
.themecount { font-size: 12px; color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }

.memgrid { display: grid; grid-template-columns: 1fr; gap: 12px; }
@media (min-width: 560px) { .memgrid { grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px; } }
.mem { border: 1px solid var(--ring); border-radius: 12px; padding: 12px 14px; background: var(--surface-2); }
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
.sparkdot { fill: var(--accent); stroke: var(--surface-2); stroke-width: 2; }
.memreason { color: var(--ink2); font-size: 12px; font-style: italic; margin: 6px 0; line-height: 1.4; }
.memclients { margin: 6px 0 0; padding-left: 16px; font-size: 12px; color: var(--ink2); }
.memclients b { color: var(--ink); font-weight: 600; }

.tablewrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 480px; }
th { text-align: left; color: var(--muted); font-weight: 500; padding: 6px 10px; }
td { padding: 7px 10px; border-top: 1px solid var(--grid); vertical-align: top; }
td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
td.why { color: var(--ink2); min-width: 200px; }

footer { color: var(--ink2); font-size: 13px; margin-top: 8px; padding: 0 2px; }
footer h3 { font-size: 13px; color: var(--ink); margin-bottom: 6px; }
footer ul { padding-left: 18px; margin: 0 0 8px; }
footer li { margin-bottom: 3px; line-height: 1.45; }
`;
