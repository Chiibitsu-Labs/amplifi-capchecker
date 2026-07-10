import { isDashboardAuthed } from "@/lib/dashboardAuth";
import { LoginGate } from "@/components/LoginGate";
import { DASHBOARD_CSS } from "@/lib/theme";
import { SCALE_EPOCH, THRESHOLD_DOCS } from "@/lib/analytics";
import { getThresholds } from "@/lib/settings";
import { updateThresholds } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function About({
  searchParams,
}: {
  searchParams: { key?: string; error?: string; saved?: string; terror?: string; field?: string };
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
  const { thresholds: T, overrides } = await getThresholds();

  const fieldLabel =
    searchParams.field &&
    THRESHOLD_DOCS.find((d) => d.key === searchParams.field)?.label;

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
          Each person&rsquo;s self-reported load (1–10), daily, plus why, and their live client
          list. <b>10 = drowning (fully loaded), 1 = wide open</b> — higher means busier.
          Self-reported is the point — it&rsquo;s the early-warning system. People feel strain
          weeks before deliveries slip.
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
            {T.minHistoryDays} working days of history. The thresholds below are a first pass —
            v1 sets baselines, reality sharpens them.
          </li>
          <li>
            <b>History starts {SCALE_EPOCH}.</b> Earlier check-ins used an older, ambiguous scale
            and are excluded from every chart and signal (they&rsquo;re still visible in the raw
            check-in log for the record) — so the 10-day calibration clock only counts days on
            the current scale.
          </li>
          <li>
            <b>It&rsquo;s only as good as the response rate.</b> Below{" "}
            {Math.round(T.responseFloor * 100)}%, a Data Health warning fires and the averages
            shouldn&rsquo;t be trusted.
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
            <b>Hire</b> — team average above {T.structuralLine}/10 on {T.structuralDays}+ of the
            last 10 working days (needs {T.minHistoryDays} days of history).
          </li>
          <li>
            <b>Rebalance</b> — a member averaging ≥{T.strainAvg} over recent check-ins while the
            team sits ≥{T.strainGap} points lower (less busy).
          </li>
          <li>
            <b>Automate / redesign</b> — one theme behind ≥{Math.round(T.themeShare * 100)}% of
            high-load reports (min {T.themeMinCount}).
          </li>
          <li>
            <b>Watch</b> — 2+ people in the strain zone (≥{T.strainZone}/10) on the same day.
          </li>
          <li>
            <b>Data health</b> — response rate under {Math.round(T.responseFloor * 100)}% means
            don&rsquo;t trust the averages yet.
          </li>
        </ul>
      </section>

      <section className="card" id="thresholds">
        <h2>Change the thresholds</h2>
        <p className="cardsub">
          Edit any value and save — changes apply immediately, for everyone, no redeploy. Leave a
          field <b>blank to reset it to its default</b>. Because this changes how the signals are
          computed, saving asks for the dashboard password again, even though you&rsquo;re already
          logged in.
        </p>

        {searchParams.saved === "1" && (
          <p className="banner ok">✓ Thresholds saved — the dashboard is already using them.</p>
        )}
        {searchParams.terror === "badpass" && (
          <p className="banner bad">Incorrect password — nothing was changed.</p>
        )}
        {searchParams.terror === "range" && (
          <p className="banner bad">
            {fieldLabel ? `"${fieldLabel}" is out of its allowed range` : "A value is out of range"} — nothing was changed.
          </p>
        )}
        {searchParams.terror === "save" && (
          <p className="banner bad">Couldn&rsquo;t save — database error. Try again.</p>
        )}

        <form action={updateThresholds} className="setform">
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Signal input</th>
                  <th>Value</th>
                  <th>Default</th>
                </tr>
              </thead>
              <tbody>
                {THRESHOLD_DOCS.map((t) => (
                  <tr key={t.key}>
                    <td>
                      {t.label}
                      {t.unit ? <span className="unithint"> ({t.unit})</span> : null}
                    </td>
                    <td>
                      <input
                        type="number"
                        name={t.key}
                        defaultValue={overrides[t.key] ?? ""}
                        placeholder={String(T[t.key])}
                        min={t.min}
                        max={t.max}
                        step={t.step}
                        className="setfield"
                        inputMode="decimal"
                      />
                    </td>
                    <td className="num">{t.default}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="setconfirm">
            <input
              type="password"
              name="confirmPassword"
              placeholder="Dashboard password (to confirm)"
              autoComplete="current-password"
              required
              className="loginfield"
            />
            <button type="submit" className="loginbtn">Save thresholds</button>
          </div>
        </form>
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
