// Shared styles for every dashboard-family page (/, /about, the login gate).
// Reference dataviz palette rebuilt from Amplifi's real site (amplifihq.com),
// not the earlier hallucinated guide: white-dominant marketing site, NAVY
// BLUE as the real dark color (not black), one warm ORANGE used consistently
// for every CTA and stat callout, GOLD reserved for the logo mark only. No
// red/purple/green appear anywhere on the real site.
// This is a COO daily-scan tool, so we stay dark for scan speed — but the
// dark anchor is Amplifi's own navy, and orange carries the "attention"
// semantic exactly as it does on their site (CTA = act; here, critical
// signal = act). Dark-locked; mobile-first.
export const DASHBOARD_CSS = `
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

.brandrow { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.logo { height: 48px; width: auto; display: block; aspect-ratio: 517.47 / 142.65; }
@media (min-width: 720px) { .logo { height: 64px; } }
.producttag {
  font-size: 14px; font-weight: 600; color: var(--ink2);
  padding-left: 14px; border-left: 1px solid var(--grid);
  letter-spacing: 0.01em;
}
@media (min-width: 720px) { .producttag { font-size: 17px; } }
.sub { color: var(--ink2); margin: 14px 0 22px; max-width: 640px; font-size: 14px; line-height: 1.5; }

.navlink { color: var(--gold); text-decoration: none; font-weight: 600; white-space: nowrap; }
.navlink:hover { text-decoration: underline; }

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
td.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; color: var(--ink2); white-space: nowrap; }

footer { color: var(--ink2); font-size: 13px; margin-top: 8px; padding: 0 2px; }
footer h3 { font-size: 13px; color: var(--ink); margin-bottom: 6px; }
footer ul { padding-left: 18px; margin: 0 0 8px; }
footer li { margin-bottom: 3px; line-height: 1.45; }

.doclist { padding-left: 18px; margin: 0; color: var(--ink2); font-size: 14px; line-height: 1.6; }
.doclist li { margin-bottom: 10px; }
.doclist b { color: var(--ink); }
.doclist code { background: var(--surface-2); padding: 1px 6px; border-radius: 4px; font-size: 12.5px; color: var(--gold); }

.loginbox {
  background: var(--surface); border: 1px solid var(--ring); border-radius: 16px;
  padding: 32px 28px; text-align: center;
}
.loginlogo { height: 40px; width: auto; margin: 0 auto 20px; display: block; aspect-ratio: 517.47 / 142.65; }
.loginbox h1 { font-size: 18px; margin: 0 0 6px; }
.loginbox .sub { margin: 0 0 22px; font-size: 13px; max-width: none; }
.loginform { display: flex; flex-direction: column; gap: 10px; }
.loginfield {
  background: var(--surface-2); border: 1px solid var(--grid); border-radius: 8px;
  padding: 11px 14px; font-size: 15px; color: var(--ink); outline: none;
  font-family: inherit; text-align: left;
}
.loginfield:focus { border-color: var(--gold); }
.loginbtn {
  background: var(--gold); color: #14183a; border: none; border-radius: 8px;
  padding: 11px 14px; font-size: 14px; font-weight: 700; cursor: pointer;
  font-family: inherit;
}
.loginbtn:hover { filter: brightness(1.08); }
.loginerror { color: var(--critical); font-size: 13px; margin: 14px 0 0; }

.banner { border-radius: 8px; padding: 10px 14px; font-size: 13.5px; margin: 0 0 14px; }
.banner.ok { background: rgba(47,174,78,0.12); border: 1px solid var(--good); color: var(--good-text); }
.banner.bad { background: rgba(194,73,15,0.12); border: 1px solid var(--critical); color: #f0a06a; }

.setfield {
  background: var(--surface-2); border: 1px solid var(--grid); border-radius: 6px;
  padding: 7px 10px; font-size: 14px; color: var(--ink); outline: none;
  font-family: inherit; width: 92px; font-variant-numeric: tabular-nums;
}
.setfield:focus { border-color: var(--gold); }
.unithint { color: var(--muted); font-size: 12px; }
.setconfirm { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; align-items: center; }
.setconfirm .loginfield { flex: 1 1 220px; max-width: 320px; }
.setconfirm .loginbtn { flex: 0 0 auto; padding: 11px 22px; }
`;
