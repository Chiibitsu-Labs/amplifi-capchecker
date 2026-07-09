import { supabase } from "@/lib/supabase";
import { localDateString } from "@/lib/dates";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

type DailyRow = {
  check_date: string;
  member_name: string;
  capacity: number | null;
  reason: string | null;
  client_count: number | null;
};

async function getRecent(): Promise<DailyRow[] | null> {
  try {
    const { data, error } = await supabase()
      .from("capchecker_daily_view")
      .select("check_date, member_name, capacity, reason, client_count")
      .order("check_date", { ascending: false })
      .order("capacity", { ascending: true })
      .limit(100);
    if (error) throw error;
    return (data as DailyRow[]) ?? [];
  } catch {
    return null;
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  // Team capacity data is sensitive (names, workloads, reasons). When
  // DASHBOARD_PASSWORD is set, require ?key=<password> to view.
  if (config.dashboardPassword && searchParams.key !== config.dashboardPassword) {
    return (
      <main style={{ maxWidth: 480, margin: "0 auto", padding: "96px 20px" }}>
        <h1 style={{ fontSize: 20 }}>🔒 Amplifi Capacity Checker</h1>
        <p style={{ color: "#8b98a5" }}>
          This dashboard is private. Open it with the access link
          (…/?key=…) shared by your admin.
        </p>
      </main>
    );
  }

  const rows = await getRecent();
  const today = localDateString();
  const todays = (rows ?? []).filter((r) => r.check_date === today && r.capacity != null);
  const avg =
    todays.length > 0
      ? (todays.reduce((s, r) => s + (r.capacity ?? 0), 0) / todays.length).toFixed(1)
      : "—";

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "48px 20px" }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Amplifi Capacity Checker</h1>
      <p style={{ color: "#8b98a5", marginTop: 0 }}>
        Daily team capacity — read-only snapshot. Full analytics dashboard to come.
      </p>

      <div style={{ display: "flex", gap: 16, margin: "24px 0" }}>
        <Stat label="Today's average" value={`${avg}${avg === "—" ? "" : " / 10"}`} />
        <Stat label="Responded today" value={String(todays.length)} />
      </div>

      {rows === null ? (
        <p style={{ color: "#f0883e" }}>
          Not connected to Supabase yet — set SUPABASE_URL and
          SUPABASE_SERVICE_ROLE_KEY, and run the migration.
        </p>
      ) : rows.length === 0 ? (
        <p style={{ color: "#8b98a5" }}>No check-ins recorded yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#8b98a5" }}>
              <th style={th}>Date</th>
              <th style={th}>Member</th>
              <th style={th}>Cap</th>
              <th style={th}>Clients</th>
              <th style={th}>Why</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: "1px solid #1c2430" }}>
                <td style={td}>{r.check_date}</td>
                <td style={td}>{r.member_name}</td>
                <td style={{ ...td, color: capColor(r.capacity) }}>
                  {r.capacity ?? "—"}
                </td>
                <td style={td}>{r.client_count ?? "—"}</td>
                <td style={{ ...td, color: "#b9c4d0" }}>{r.reason ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#111823",
        border: "1px solid #1c2430",
        borderRadius: 10,
        padding: "14px 18px",
        minWidth: 140,
      }}
    >
      <div style={{ color: "#8b98a5", fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function capColor(c: number | null): string {
  if (c == null) return "#8b98a5";
  if (c <= 3) return "#f85149";
  if (c <= 6) return "#d29922";
  return "#3fb950";
}

const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 500 };
const td: React.CSSProperties = { padding: "8px 10px", verticalAlign: "top" };
