// Stylesheet for the readouts, scoped under .o2r and rendered with the report.
// On screen the readout sits in the app shell's content area as a white
// document card. Print rules make the browser's "Print / Save as PDF" the PDF
// path: shell chrome and the readout nav hidden, the shell's scroll container
// un-clipped, cards kept whole across page breaks, colors preserved.
export const REPORT_CSS = `
.o2r-page { max-width: 1100px; margin: 0 auto; }
.o2r-seg { display: inline-flex; border: 1px solid rgba(3,57,95,0.25); border-radius: 6px; overflow: hidden; background: #fff; }
.o2r-seg button { background: none; border: none; color: #475569; padding: 6px 12px; font-size: 13px; font-weight: 600; cursor: pointer; }
.o2r-seg button + button { border-left: 1px solid rgba(3,57,95,0.18); }
.o2r-seg button.on { background: #03395f; color: #fff; }

/* Reports area: side panel (audience + report list) beside the readout. */
.o2r-layout { display: grid; grid-template-columns: 210px minmax(0, 1fr); gap: 20px; align-items: start; }
.o2r-main { min-width: 0; }
.o2r-side { position: sticky; top: 12px; background: #fff; border: 1px solid #dde4ef; border-radius: 10px; padding: 14px; }
.o2r-side-group + .o2r-side-group { margin-top: 18px; }
.o2r-side-label { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #64748b; margin-bottom: 8px; }
.o2r-aud { display: flex; width: 100%; }
.o2r-aud button { flex: 1; }
.o2r-side-hint { font-size: 12px; color: #64748b; margin-top: 6px; line-height: 1.4; }
.o2r-linkbtn { background: none; border: none; padding: 0; color: #03395f; font: inherit; font-weight: 600; cursor: pointer; text-decoration: underline; }
.o2r-rlist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.o2r-ritem { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 8px 10px; border-radius: 6px;
  font-size: 13px; font-weight: 500; color: #334155; text-decoration: none; border-left: 3px solid transparent; }
.o2r-ritem:hover { background: #f1f5f9; color: #0f172a; }
.o2r-ritem.on { background: #e8f0f7; color: #03395f; font-weight: 600; border-left-color: #03395f; }
.o2r-ritem.off { color: #94a3b8; }
span.o2r-ritem.off { cursor: not-allowed; }
span.o2r-ritem.off:hover { background: none; color: #94a3b8; }
.o2r-ritem small { font-size: 11px; font-weight: 500; color: #94a3b8; white-space: nowrap; }
.o2r-note { background: #fff; border: 1px solid #dde4ef; border-radius: 10px; padding: 20px 24px; font-size: 14px; max-width: 560px; }
@media (max-width: 900px) {
  .o2r-layout { grid-template-columns: 1fr; gap: 14px; }
  .o2r-side { position: static; display: flex; flex-direction: column; gap: 12px; }
  .o2r-side-group + .o2r-side-group { margin-top: 0; }
  .o2r-aud { width: auto; display: inline-flex; }
  .o2r-rlist { flex-direction: row; gap: 6px; overflow-x: auto; scrollbar-width: none; }
  .o2r-ritem { white-space: nowrap; border-left: none; border: 1px solid #dde4ef; border-radius: 999px; padding: 6px 14px; }
  .o2r-ritem.on { border-color: #03395f; }
}

.o2r { --o2r-navy: #03395F; --o2r-navy2: #066AAB; --o2r-green: #17C662; --o2r-good: #0F9E4E; --o2r-warning: #E0900A;
  --o2r-serious: #E07A06; --o2r-critical: #D0473A; --o2r-muted: #6B7A86; --o2r-ink: #2B2B2B; --o2r-line: #E7EDF1;
  --o2r-panel: #F3F6F8; --o2r-s1: #066AAB; --o2r-s2: #0F9E4E; --o2r-s3: #E0900A; --o2r-s4: #7A4FD0; --o2r-s5: #D0473A;
  max-width: 960px; margin: 0 auto; background: #fff; color: var(--o2r-ink); border-radius: 10px;
  box-shadow: 0 1px 3px rgba(15,23,42,.08); padding: 36px 40px; font-size: 14px; line-height: 1.55; }
.o2r * { box-sizing: border-box; }
.o2r h1, .o2r h2, .o2r h3, .o2r h4 { color: var(--o2r-navy); margin: 0; line-height: 1.25; }
.o2r p { margin: 0 0 10px; }
.o2r ul, .o2r ol { margin: 6px 0 10px; padding-left: 20px; }
.o2r-muted { color: var(--o2r-muted); }
.o2r-section { margin-top: 30px; break-inside: avoid-page; }
.o2r-section.o2r-flow { break-inside: auto; }
.o2r-shead { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 2px solid var(--o2r-green); break-after: avoid; }
.o2r-shead-ic { color: var(--o2r-navy2); flex-shrink: 0; margin-top: 2px; }
.o2r-shead h2 { font-size: 19px; }
.o2r-shead p { margin: 4px 0 0; color: var(--o2r-muted); font-size: 13px; }
.o2r-card { border: 1px solid var(--o2r-line); border-radius: 8px; padding: 14px 16px; background: #fff; break-inside: avoid; }
.o2r-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
.o2r-grid.two { grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
.o2r-tag { display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
  padding: 1px 7px; border-radius: 4px; background: var(--o2r-panel); color: var(--o2r-navy2); margin-right: 6px; }
.o2r-tag.ok { color: var(--o2r-good); background: #e8f7ee; }
.o2r-pill { display: inline-block; color: #fff; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
.o2r-basis { display: inline-block; font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 999px; border: 1px solid currentColor; white-space: nowrap; }
.o2r-basis.b-Confirmed { color: var(--o2r-good); }
.o2r-basis.b-Observed { color: var(--o2r-navy2); }
.o2r-basis.b-Modeled { color: var(--o2r-s4); }
.o2r-basis.b-Supplied { color: var(--o2r-muted); }
.o2r details summary { cursor: pointer; color: var(--o2r-navy2); font-size: 12px; font-weight: 600; margin-top: 6px; }
.o2r details ol { font-size: 13px; }
.o2r-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.o2r-table th { background: var(--o2r-navy); color: #fff; text-align: left; padding: 7px 9px; font-size: 12px; }
.o2r-table td { border-bottom: 1px solid var(--o2r-line); padding: 7px 9px; vertical-align: top; }
.o2r-table tr { break-inside: avoid; }
.o2r-table .num { text-align: right; white-space: nowrap; }
.o2r-sub { font-size: 12px; color: var(--o2r-muted); }

/* hero / cover */
.o2r-hero { display: flex; gap: 24px; align-items: center; justify-content: space-between; flex-wrap: wrap;
  padding: 26px 28px; border-radius: 10px; background: linear-gradient(135deg, #03395F, #066AAB); color: #fff; break-inside: avoid; }
.o2r-hero h1 { color: #fff; font-size: 28px; margin: 6px 0 4px; }
.o2r-kicker { display: flex; gap: 6px; align-items: center; font-size: 12px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #9fe3bd; }
.o2r-cust { font-size: 18px; font-weight: 700; color: #fff; }
.o2r-metaline { font-size: 12px; color: #c7dbec; margin-top: 6px; }
.o2r-hero-r { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.o2r-gradechip { color: #fff; font-weight: 700; font-size: 13px; padding: 3px 12px; border-radius: 999px; }
.o2r-potential { font-size: 12px; color: #e2f5ea; text-align: center; }
.o2r-potential b { color: #fff; }
.o2r-ometa { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px 20px; margin-top: 16px; width: 100%; }
.o2r-ometa div { display: flex; flex-direction: column; font-size: 13px; }
.o2r-ometa span { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #9fc3dc; }
.o2r-ometa .wide { grid-column: 1 / -1; }

/* at-a-glance */
.o2r-glance { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; margin-top: 16px; break-inside: avoid; }
.o2r-glance > div { border: 1px solid var(--o2r-line); border-radius: 8px; padding: 10px 12px; text-align: center; }
.o2r-glance-v { font-size: 22px; font-weight: 800; }
.o2r-glance-l { font-size: 12px; color: var(--o2r-muted); }

.o2r-prose p { font-size: 14px; }
.o2r-interp { border: 1px solid var(--o2r-line); border-radius: 8px; overflow: hidden; margin-top: 12px; break-inside: avoid; }
.o2r-interp-row { display: flex; gap: 12px; padding: 10px 14px; }
.o2r-interp-row + .o2r-interp-row { border-top: 1px solid var(--o2r-line); }
.o2r-interp-row p { margin: 0; }
.o2r-interp-k { flex: 0 0 140px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; padding-top: 2px; }
.o2r-interp-k.tells { color: var(--o2r-navy2); }
.o2r-interp-k.means { color: var(--o2r-s3); }
.o2r-interp-k.think { color: var(--o2r-good); }
.o2r-howread { font-size: 13px; color: var(--o2r-muted); background: var(--o2r-panel); padding: 10px 12px; border-radius: 6px; }

.o2r-icard h4 { font-size: 14px; margin: 6px 0 4px; }
.o2r-icard p { font-size: 13px; margin: 0; color: #475569; }
.o2r-icard .o2r-ic { color: var(--o2r-navy2); }
.o2r-stake-top { display: flex; gap: 10px; align-items: center; margin-bottom: 6px; }
.o2r-stake-top span.who { display: block; font-size: 12px; color: var(--o2r-muted); }
.o2r-stake ul { font-size: 13px; padding-left: 18px; margin: 0; }
.o2r-value-num { font-size: 24px; font-weight: 800; color: var(--o2r-navy); margin-top: 4px; }
.o2r-value-lbl { font-size: 12px; color: var(--o2r-muted); }
.o2r-value-title { font-weight: 700; margin: 6px 0 2px; color: var(--o2r-navy); }

/* findings */
.o2r-find { border: 1px solid var(--o2r-line); border-left-width: 5px; border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; break-inside: avoid; }
.o2r-find-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 6px; }
.o2r-find-head b { color: var(--o2r-navy); }
.o2r-find p { font-size: 13px; margin: 0 0 6px; }
.o2r-find-foot { display: grid; gap: 4px; font-size: 13px; margin-top: 4px; }

/* roadmap */
.o2r-road-row { display: flex; gap: 12px; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--o2r-line); break-inside: avoid; }
.o2r-road-rank { flex: 0 0 26px; height: 26px; border-radius: 50%; background: var(--o2r-navy); color: #fff; font-weight: 700; font-size: 12px; display: flex; align-items: center; justify-content: center; }
.o2r-road-main { flex: 1; min-width: 0; }
.o2r-road-top { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.o2r-road-top span { font-size: 12px; color: var(--o2r-muted); }
.o2r-track { height: 6px; background: var(--o2r-line); border-radius: 4px; overflow: hidden; margin: 5px 0; }
.o2r-track i { display: block; height: 100%; border-radius: 4px; }
.o2r-road-reco { font-size: 13px; color: #475569; }
.o2r-road-lift { flex: 0 0 auto; color: #fff; font-weight: 800; font-size: 13px; padding: 3px 9px; border-radius: 6px; }

/* layer deep dive */
.o2r-layer { border: 1px solid var(--o2r-line); border-radius: 10px; padding: 16px 18px; margin-top: 14px; break-inside: avoid; }
.o2r-layer-head { display: flex; gap: 12px; align-items: center; margin-bottom: 10px; }
.o2r-layer-head h3 { font-size: 16px; }
.o2r-layer-head .tag { font-size: 12px; color: var(--o2r-muted); }
.o2r-layer-score { margin-left: auto; text-align: right; white-space: nowrap; }
.o2r-layer-num { font-size: 24px; font-weight: 800; }
.o2r-layer-g { font-size: 13px; font-weight: 700; margin-left: 4px; color: var(--o2r-muted); }
.o2r-layer-body { display: grid; grid-template-columns: 3fr 2fr; gap: 16px; }
.o2r-layer-body p { font-size: 13px; }
.o2r-layer-help { background: #eef7f2; border-radius: 6px; padding: 8px 10px; }
.o2r-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; }
.o2r-dot.ok { background: var(--o2r-good); }
.o2r-dot.bad { background: var(--o2r-critical); }

/* config remediation */
.o2r-cfg-row { display: grid; grid-template-columns: 1.2fr 1fr 1.6fr; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--o2r-line); font-size: 13px; break-inside: avoid; }
.o2r-badge { display: inline-block; font-size: 11px; padding: 2px 7px; border-radius: 4px; margin: 1px 0; }
.o2r-badge.warn { background: #fdf2e0; color: #8a5300; }
.o2r-badge.ok { background: #e8f7ee; color: #0b6b36; }

/* outcomes */
.o2r-adopt-v { font-size: 26px; font-weight: 800; }
.o2r-adopt-v.tone-good { color: var(--o2r-good); }
.o2r-adopt-v.tone-bad { color: var(--o2r-critical); }
.o2r-adopt-v.tone-mut { color: var(--o2r-muted); }
.o2r-stand { display: flex; gap: 24px; align-items: center; flex-wrap: wrap; }
.o2r-stand-num { font-size: 44px; font-weight: 800; line-height: 1; }
.o2r-stand-bars { flex: 1; min-width: 280px; }
.o2r-standbar { display: grid; grid-template-columns: 200px 1fr 36px; gap: 10px; align-items: center; font-size: 12px; margin-bottom: 5px; }
.o2r-standbar .o2r-track { margin: 0; height: 8px; }
.o2r-wg { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.o2r-wg h4 { display: flex; gap: 6px; align-items: center; font-size: 14px; margin-bottom: 6px; }
.o2r-wg .good h4 { color: var(--o2r-good); }
.o2r-wg .bad h4 { color: var(--o2r-critical); }
.o2r-wg ul { font-size: 13px; }
.o2r-oq li { margin-bottom: 6px; font-size: 13px; }
.o2r-rec { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--o2r-line); break-inside: avoid; }
.o2r-rec p { font-size: 13px; margin: 4px 0; }
.o2r-gloss { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px 20px; margin: 0; }
.o2r-gloss dt { font-weight: 700; font-size: 13px; color: var(--o2r-navy); }
.o2r-gloss dd { margin: 0; font-size: 12px; color: #475569; }
.o2r-warn { background: #fdf2e0; border: 1px solid #f3cf8f; color: #6b4200; border-radius: 8px; padding: 10px 12px; font-size: 13px; margin-top: 12px; }

/* growth */
.o2r-opp { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--o2r-line); break-inside: avoid; }
.o2r-opp-n { flex: 0 0 30px; height: 30px; border-radius: 50%; background: var(--o2r-green); color: #04263d; font-weight: 800; display: flex; align-items: center; justify-content: center; }
.o2r-opp-ic { flex: 0 0 30px; color: var(--o2r-navy2); padding-top: 2px; }
.o2r-opp-main { flex: 1; min-width: 0; }
.o2r-opp-head { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-bottom: 4px; }
.o2r-opp-head b { color: var(--o2r-navy); margin-right: 4px; }
.o2r-chip { font-size: 11px; padding: 1px 7px; border-radius: 999px; background: var(--o2r-panel); color: var(--o2r-muted); white-space: nowrap; }
.o2r-chip.imp-High { background: #e8f7ee; color: #0b6b36; font-weight: 700; }
.o2r-chip.imp-Med { background: #e6f0f8; color: #04508a; }
.o2r-opp p { font-size: 13px; margin: 0 0 4px; }
.o2r-val { display: inline-block; font-size: 12px; font-weight: 700; color: var(--o2r-navy); background: var(--o2r-panel); padding: 2px 8px; border-radius: 4px; }
.o2r-who { font-size: 11px; color: var(--o2r-muted); margin-top: 4px; }
.o2r-empty { display: flex; gap: 6px; align-items: center; color: var(--o2r-good); font-size: 13px; }

.o2r-foot { margin-top: 36px; padding-top: 12px; border-top: 1px solid var(--o2r-line); font-size: 11px; color: var(--o2r-muted); display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }

@media (max-width: 720px) {
  .o2r { padding: 22px 16px; }
  .o2r-layer-body, .o2r-wg, .o2r-cfg-row { grid-template-columns: 1fr; }
  .o2r-standbar { grid-template-columns: 120px 1fr 30px; }
  .o2r-interp-k { flex-basis: 100px; }
}

@media print {
  @page { size: letter; margin: 0.5in; }
  /* Scoped by html.o2r-readout (set while the readout page is mounted). The shell
     is a 100vh flex row whose body column is overflow:hidden and whose <main> is
     the overflow-y:auto scroller, so printing as-is would clip to one screenful.
     Flatten it to plain block flow so the document is as tall as the readout. */
  html.o2r-readout, html.o2r-readout body, html.o2r-readout #root {
    height: auto !important; min-height: 0 !important; overflow: visible !important; background: #fff !important; }
  html.o2r-readout .staging-banner, html.o2r-readout .app-shell-sidebar, html.o2r-readout .app-shell-drawer,
  html.o2r-readout .app-shell-header, html.o2r-readout .app-shell-impersonation, html.o2r-readout .o2r-chrome {
    display: none !important; }
  html.o2r-readout .staging-offset { padding: 0 !important; }
  html.o2r-readout .app-shell, html.o2r-readout .app-shell-body, html.o2r-readout .app-shell-main {
    display: block !important; height: auto !important; min-height: 0 !important; overflow: visible !important;
    position: static !important; flex: none !important; padding: 0 !important; background: #fff !important; }
  .o2r-page { max-width: none; margin: 0; }
  /* The side panel is .o2r-chrome (hidden above); drop the grid so the readout spans the page. */
  .o2r-layout { display: block; }
  .o2r { max-width: none; margin: 0; padding: 0; box-shadow: none; border-radius: 0; font-size: 12px; }
  .o2r, .o2r * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .o2r details summary { display: none; }
  .o2r-layer-body { grid-template-columns: 3fr 2fr; }
}
`;
