import type { CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { SALES_TOOL_APPS, type SalesToolApp } from "../components/salesTools/apps";

/** /sales-tools is an app launcher (tiles); /sales-tools/:appId opens one app.
 *  Tile styles live in index.css (.st-grid / .st-tile*). */
export default function SalesToolsPage() {
  const { appId } = useParams<{ appId?: string }>();
  if (appId) return <SalesToolAppView appId={appId} />;

  const visible = SALES_TOOL_APPS.filter((a) => a.status !== "hidden");

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="ms-page-header">
        <div>
          <h1 className="ms-page-title">Sales Tools</h1>
          <p className="ms-page-subtitle">Calculators and deal tools for the sales team.</p>
        </div>
      </div>

      <ul className="st-grid">
        {visible.map((app) => (
          <li key={app.id}>
            <AppTile app={app} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function isLive(app: SalesToolApp) {
  return app.status === "live" && !!app.component;
}

function AppTile({ app }: { app: SalesToolApp }) {
  const live = isLive(app);
  const accent = { "--st-accent": app.accent } as CSSProperties;
  const body = (
    <>
      <div className="st-tile-icon" aria-hidden="true">{app.icon}</div>
      <div className="st-tile-title">{app.title}</div>
      <div className="st-tile-desc">{app.description}</div>
      {!live && <div className="st-tile-badge">Coming soon</div>}
    </>
  );

  if (!live) {
    // Announced as a disabled link; no href and no tabIndex, so it can't be clicked or focused.
    return (
      <div className="st-tile" style={accent} role="link" aria-disabled="true">
        {body}
      </div>
    );
  }
  return (
    <Link to={`/sales-tools/${app.id}`} className="st-tile" style={accent}>
      {body}
    </Link>
  );
}

function SalesToolAppView({ appId }: { appId: string }) {
  const app = SALES_TOOL_APPS.find((a) => a.id === appId);
  const back = (
    <Link to="/sales-tools" className="ms-btn-ghost" style={{ marginBottom: 16 }}>
      <span aria-hidden="true">←</span> Sales Tools
    </Link>
  );

  if (!app || !isLive(app) || !app.component) {
    return (
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {back}
        <div style={{ padding: "48px 0", textAlign: "center", color: "#64748b", fontSize: 14 }}>This tool isn't available.</div>
      </div>
    );
  }

  const App = app.component;
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {back}
      <div className="ms-page-header">
        <div>
          <h1 className="ms-page-title">{app.title}</h1>
        </div>
      </div>
      <App />
    </div>
  );
}
