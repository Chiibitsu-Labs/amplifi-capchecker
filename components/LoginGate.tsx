import { authenticateDashboard } from "@/app/actions";
import { DASHBOARD_CSS } from "@/lib/theme";

/**
 * Password gate shown on any protected page (/, /about) when the visitor
 * isn't authenticated. A plain server-action form — no client JS required —
 * so it works even with scripting disabled, and degrades identically to the
 * old ?key=-only scheme if submitted via a bookmarked GET link.
 */
export function LoginGate({
  error,
  redirectTo,
  title = "Capacity Dashboard",
}: {
  error?: boolean;
  redirectTo: string;
  title?: string;
}) {
  return (
    <main className="viz-root" style={{ maxWidth: 420, margin: "0 auto", padding: "88px 20px" }}>
      <style>{DASHBOARD_CSS}</style>
      <div className="loginbox">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="Amplifi" className="loginlogo" />
        <h1>{title}</h1>
        <p className="sub">This dashboard is private. Enter the password to continue.</p>
        <form action={authenticateDashboard} className="loginform">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <input
            type="password"
            name="key"
            placeholder="Password"
            autoFocus
            autoComplete="current-password"
            className="loginfield"
          />
          <button type="submit" className="loginbtn">
            View dashboard
          </button>
        </form>
        {error && <p className="loginerror">Incorrect password — try again.</p>}
      </div>
    </main>
  );
}
