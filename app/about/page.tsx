import { isDashboardAuthed } from "@/lib/dashboardAuth";
import { LoginGate } from "@/components/LoginGate";
import { DASHBOARD_CSS } from "@/lib/theme";
import { THRESHOLDS, THRESHOLD_DOCS } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export default async function About({
  searchParams,
}: {
  searchParams: { key?: string; error?: string };
}) {
  if (!isDashboardAuthed(searchParams.key)) {
    return (
      <LoginGate
        error={searchParams.error === "1"}
        redirectTo="/about"
        title="Capacity Dashboard — Guide"
      />
    );
  }

  const backHref = searchParams.key ? `/?key=${encodeURIComponent(searchParams.key)}` : "/";

  return (
    <main className="viz-root">
      <style>{DASHBOARD_CSS}</style>

      <header>
        <div className="brandrow">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Amplifi" className="logo" />
          <span className="producttag">Guide &amp; limitations</span>
        </div>
        <p className="sub">
          What this instrument measures, what it can&rsquo;t see yet, and how to tune it.{" "}
          <a href={backHref} className="navlink">← Back to dashboard</a>
        </p>
      </header>

      <section className="card">
        <h2>What this measures</h2>
        <p className="cardsub">
          Each person&rsquo;s self-reported capacity (1–10), daily, plus why, and their live
          client load. Self-reported is the point — it&rsquo;s the early-warning system. People
          feel strain weeks before deliveries slip.
        </p>
      </section>

      <section className="card">
        <h2>Honest limitations</h2>
        <ul className="doclist">
          <li>
            <b>It&rsquo;s self-reported.</b> Two people can rate the same day differently —
            that&rsquo;s fine, each person is tracked against their own baseline, not against each
            other. It can be wrong in both directions, which is why an objective delivery-metrics
            layer (on-time rate, rework, cycle time) is the planned phase-2 cross-check.
          </li>
          <li>
            <b>It&rsquo;s calibrating.</b> Structural signals (the Hire line) unlock at{" "}
            {THRESHOLDS.minHistoryDays} working days of history. The thresholds below are a first
            pass — v1 sets baselines, reality sharpens them.
          </li>
          <li>
            <b>It&rsquo;s only as good as the response rate.</b> Below{" "}
            {Math.round(THRESHOLDS.responseFloor * 100)}%, a Data Health warning fires and the
            averages shouldn&rsquo;t be trusted.
          </li>
          <li>
            <b>Ground rule:</b> these ratings are for resourcing decisions, never individual
            performance evaluation. The moment the team feels judged on their answers, they stop
            being honest and the instrument goes blind. If a number worries you, the move is a
            supportive check-in, not a callout.
          </li>
          <li>
            <b>Delivery timing:</b> the daily summary lands between 10:00–11:00am — a Vercel
            Hobby-plan cron limitation (jobs fire within the hour, not on the minute).
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>How the signals are computed</h2>
        <ul className="doclist">
          <li>
            <b>Hire</b> — team average below {THRESHOLDS.structuralLine}/10 on{" "}
            {THRESHOLDS.structuralDays}+ of the last 10 working days (needs{" "}
            {THRESHOLDS.minHistoryDays} days of history).
          </li>
          <li>
            <b>Rebalance</b> — a member averaging ≤{THRESHOLDS.strainAvg} over recent check-ins
            while the team sits ≥{THRESHOLDS.strainGap} points higher.
          </li>
          <li>
            <b>Automate / redesign</b> — one theme behind ≥{THRESHOLDS.themeShare * 100}% of
            low-capacity reports (min {THRESHOLDS.themeMinCount}).
          </li>
          <li>
            <b>Watch</b> — 2+ people in the strain zone (≤{THRESHOLDS.strainZone}/10) on the same
            day.
          </li>
          <li>
            <b>Data health</b> — response rate under {Math.round(THRESHOLDS.responseFloor * 100)}%
            means don&rsquo;t trust the averages yet.
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>How to change a threshold</h2>
        <p className="cardsub">
          Every number above is a Vercel environment variable, not hard-coded — change it without
          touching code: <b>Vercel → this project → Settings → Environment Variables</b> → set the
          variable → <b>redeploy</b>. The new value takes effect immediately for everyone.
        </p>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Signal input</th>
                <th>Env var</th>
                <th>Current</th>
                <th>Default</th>
              </tr>
            </thead>
            <tbody>
              {THRESHOLD_DOCS.map((t) => (
                <tr key={t.envVar}>
                  <td>{t.label}</td>
                  <td className="mono">{t.envVar}</td>
                  <td className="num">
                    {THRESHOLDS[t.key]}
                    {t.unit ? ` (${t.unit})` : ""}
                  </td>
                  <td className="num">{t.default}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="cardsub" style={{ marginTop: 12 }}>
          Don&rsquo;t have Vercel access, or want an in-app control instead of env vars? Ask
          Chii — it&rsquo;s a small follow-up to wire a settings panel here.
        </p>
      </section>

      <section className="card">
        <h2>Bot commands (Telegram)</h2>
        <ul className="doclist">
          <li><code>/capacity</code> — do today&rsquo;s check-in on demand</li>
          <li><code>/clients</code> — update your client roster</li>
          <li><code>/pause</code> — stop your own daily check-ins (leave, etc.) — <code>/start</code> resumes</li>
          <li><code>/team</code> — (admins) pause/resume team members</li>
          <li><code>/help</code> — how it works, from the bot itself</li>
        </ul>
      </section>
    </main>
  );
}
