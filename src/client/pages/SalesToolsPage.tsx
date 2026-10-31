import { Suspense, useEffect, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { SALES_TOOL_APPS, type SalesToolApp } from "../components/salesTools/apps";
import { api, IMPERSONATE_KEY } from "../lib/api";

/** /sales-tools is an app launcher (tiles); /sales-tools/:appId opens one app.
 *  Tile styles live in index.css (.st-grid / .st-tile*). */
export default function SalesToolsPage() {
  const { appId } = useParams<{ appId?: string }>();
  if (appId) return <SalesToolAppView appId={appId} />;
  return <Launcher />;
}

function Launcher() {
  const visible = SALES_TOOL_APPS.filter((a) => a.status !== "hidden");
  const canPreview = useCanPreview(visible.some(isPreviewable)) === true;

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
            <AppTile app={app} preview={canPreview && isPreviewable(app)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function isLive(app: SalesToolApp) {
  return app.status === "live" && !!app.component;
}

/** A built app not yet released: admins can open it, everyone else sees "Coming soon". */
function isPreviewable(app: SalesToolApp) {
  return app.status === "coming_soon" && !!app.component;
}

function AppTile({ app, preview }: { app: SalesToolApp; preview: boolean }) {
  const live = isLive(app);
  const accent = { "--st-accent": app.accent } as CSSProperties;
  const body = (
    <>
      <div className="st-tile-icon" aria-hidden="true">{app.icon}</div>
      <div className="st-tile-title">{app.title}</div>
      <div className="st-tile-desc">{app.description}</div>
      {!live && <div className="st-tile-badge">{preview ? "Coming soon · Admin preview" : "Coming soon"}</div>}
    </>
  );

  if (!live && !preview) {
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

/**
 * Admins may open coming-soon apps to preview them (their tile opens the app;
 * for everyone else it stays disabled). Impersonating counts as not-admin,
 * matching AppShell. null while the role is loading.
 */
function useCanPreview(needed: boolean): boolean | null {
  const [canPreview, setCanPreview] = useState<boolean | null>(null);
  useEffect(() => {
    if (!needed) return;
    let live = true;
    const impersonating = !!localStorage.getItem(IMPERSONATE_KEY);
    api.me()
      .then((r) => live && setCanPreview(r.role === "admin" && !impersonating))
      .catch(() => live && setCanPreview(false));
    return () => {
      live = false;
    };
  }, [needed]);
  return needed ? canPreview : false;
}

const muted: CSSProperties = { padding: "48px 0", textAlign: "center", color: "#64748b", fontSize: 14 };

function SalesToolAppView({ appId }: { appId: string }) {
  const app = SALES_TOOL_APPS.find((a) => a.id === appId);
  const preview = !!app && isPreviewable(app);
  const canPreview = useCanPreview(preview);
  const width = app?.wide ? 1320 : 1100;
  const back = (
    <Link to="/sales-tools" className="ms-btn-ghost" style={{ marginBottom: 16 }}>
      <span aria-hidden="true">←</span> Sales Tools
    </Link>
  );

  if (preview && canPreview === null) {
    return (
      <div style={{ maxWidth: width, margin: "0 auto" }}>
        {back}
        <div style={muted}>Loading…</div>
      </div>
    );
  }

  if (!app || !app.component || !(isLive(app) || (preview && canPreview))) {
    return (
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {back}
        <div style={muted}>This tool isn't available.</div>
      </div>
    );
  }

  const App = app.component;
  return (
    <div style={{ maxWidth: width, margin: "0 auto" }}>
      {back}
      <div className="ms-page-header">
        <div>
          <h1 className="ms-page-title">{app.title}</h1>
          {preview && (
            <p className="ms-page-subtitle">Admin preview. This tool isn't live yet; other users see it as coming soon.</p>
          )}
        </div>
      </div>
      <Suspense fallback={<div style={muted}>Loading…</div>}>
        <App />
      </Suspense>
    </div>
  );
}
