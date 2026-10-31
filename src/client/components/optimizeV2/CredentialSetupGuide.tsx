// "How to set up credentials" panel on a V2 connection card. Written for Packet
// Fusion engineers working as admins in the customer's tenant (the usual path),
// with a short variant for when the customer has to create the app themselves.
// Box styling follows V1's OptimizeCredentialsSetup instructions block.
import { useState } from "react";
import type { Platform } from "../../lib/optimizeV2Api";
import { SCOPE_GROUPS, SCOPE_LIST, ZOOM_CLASSIC_SCOPES, ZOOM_SCOPE_SEARCHES, type ScopeGroup } from "./credentialGuide";

const box: React.CSSProperties = {
  background: "rgba(0,0,0,0.02)", borderRadius: 6, padding: "10px 14px", marginBottom: 12,
  fontSize: 12, color: "#475569", lineHeight: 1.6, border: "1px solid rgba(0,0,0,0.07)",
};
const chip: React.CSSProperties = {
  fontFamily: "ui-monospace, monospace", fontSize: 11, background: "#f1f5f9", padding: "1px 4px", borderRadius: 3, color: "#1e293b",
};
const h: React.CSSProperties = { fontWeight: 700, color: "#1e293b", margin: "12px 0 4px" };
const list: React.CSSProperties = { margin: "4px 0 0", paddingLeft: 18 };

export default function CredentialSetupGuide({ platform }: { platform: Platform }) {
  return (
    <details style={box}>
      <summary style={{ cursor: "pointer", fontWeight: 600, color: "#0b9aad" }}>How to set up credentials</summary>
      {platform === "zoom" ? <ZoomSteps /> : <RingCentralSteps />}
      <ScopeTable groups={SCOPE_GROUPS[platform]} />
      {platform === "zoom" && <ZoomExtras />}
      <CopyScopes platform={platform} />
    </details>
  );
}

function ZoomSteps() {
  return (
    <>
      <div style={h}>Packet Fusion admin in the customer's Zoom account (usual)</div>
      <ol style={list}>
        <li>Sign in to the customer's Zoom account with Packet Fusion's admin login (usually <code style={chip}>zm-&#123;customer&#125;@packetfusion.com</code>). Its role needs the Server-to-Server OAuth app permission.</li>
        <li>Open <strong>marketplace.zoom.us</strong> → <strong>Develop</strong> → <strong>Build App</strong> → <strong>Server-to-Server OAuth App</strong>. Name it "Packet Fusion Optimization (read-only)".</li>
        <li>On <strong>Information</strong>, fill in the company and developer contact (required before it can be activated).</li>
        <li>On <strong>Scopes</strong> → <strong>Add Scopes</strong>, add the scopes below for the products the customer owns. Search by product, then pick the View scopes listed. Skip products they don't have: those KPIs show as gaps, not errors.</li>
        <li><strong>Activate</strong> the app, then copy the <strong>Account ID</strong>, <strong>Client ID</strong> and <strong>Client secret</strong> from App Credentials into the form here. Saving checks them against Zoom and reports how many scopes were granted.</li>
      </ol>
      <div style={h}>If the customer must create it</div>
      <div>Send them steps 2–5 and the copied scope list. A Zoom admin whose role allows Server-to-Server OAuth apps creates it and shares the three values through a secure channel, never plain email.</div>
      <div style={h}>Replacing credentials</div>
      <div>Regenerating the client secret on an existing app revokes the old secret at once. If you create a new app instead, deactivate the old one.</div>
    </>
  );
}

function RingCentralSteps() {
  return (
    <>
      <div style={h}>Packet Fusion admin in the customer's RingCentral account (usual)</div>
      <ol style={list}>
        <li>Sign in to <strong>developers.ringcentral.com</strong> as Packet Fusion's admin user in the customer's account. The JWT acts as this user, so it must be a super admin there (and have RingCX admin rights if the customer has RingCX).</li>
        <li><strong>My Apps</strong> → <strong>Create App</strong> → <strong>REST API App</strong>, auth <strong>JWT auth flow</strong>, private to this account. Name it "Packet Fusion Optimization (read-only)".</li>
        <li>Under <strong>Application Scopes</strong>, add the scopes below. No write scopes are needed: the assessment only reads.</li>
        <li>Profile menu → <strong>Credentials</strong> → <strong>JWT</strong> → create a JWT for this app (production). It's shown once. Prefer an expiry date: V2 warns 30 days before it lapses, while a non-expiring JWT stays valid until someone revokes it.</li>
        <li>Paste the app's <strong>Client ID</strong> and <strong>Client secret</strong> and the <strong>JWT</strong> here. All three must come from the same app.</li>
      </ol>
      <div style={h}>If the customer must create it</div>
      <div>Their super admin follows steps 2–5 while signed in as themselves and shares the client ID, client secret and JWT through a secure channel. For AI insights, their role also needs "AI Conversation Expert - Access Insights".</div>
      <div style={h}>Notes</div>
      <ul style={list}>
        <li>A scope change doesn't need a new JWT, but can take a minute to apply.</li>
        <li>Replacing credentials: revoke the old JWT in Credentials, and rotate the app's client secret if it was shared.</li>
        <li>RingCentral's sandbox is retired; create the app in production.</li>
      </ul>
    </>
  );
}

function ScopeTable({ groups }: { groups: ScopeGroup[] }) {
  return (
    <>
      <div style={h}>Scopes (all read-only)</div>
      <div style={{ overflowX: "auto" }}>
        <table className="ms-table" style={{ fontSize: 12, background: "#fff" }}>
          <thead><tr><th>Area</th><th>Scopes</th><th>Needs</th></tr></thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.area}>
                <td style={{ minWidth: 140, verticalAlign: "top" }}>
                  <div style={{ fontWeight: 600, color: "#1e293b" }}>{g.area}</div>
                  <div style={{ color: "#64748b" }}>{g.unlocks}</div>
                </td>
                <td style={{ verticalAlign: "top" }}>
                  {g.scopes.map((s) => (
                    <div key={s.scope} title={s.endpoint} style={{ whiteSpace: "nowrap" }}><code style={chip}>{s.scope}</code></div>
                  ))}
                </td>
                <td style={{ verticalAlign: "top", color: "#64748b" }}>{g.requires ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ZoomExtras() {
  return (
    <>
      <div style={h}>Also add (search the Scopes tab)</div>
      <ul style={list}>
        {ZOOM_SCOPE_SEARCHES.map((s) => (
          <li key={s.area}>
            <strong>{s.area}</strong>{s.requires ? ` (${s.requires})` : ""}: {s.search}. Classic name <code style={chip}>{s.classic}</code>.
          </li>
        ))}
      </ul>
      <div style={h}>Older apps with classic scopes</div>
      <div>
        An app created before Zoom's granular scopes lists classic ones. The equivalents are{" "}
        {ZOOM_CLASSIC_SCOPES.map((s, i) => <span key={s}>{i > 0 && ", "}<code style={chip}>{s}</code></span>)},
        plus the Virtual Agent report scopes above.
      </div>
    </>
  );
}

function CopyScopes({ platform }: { platform: Platform }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const scopes = SCOPE_LIST[platform];

  async function copy() {
    try {
      await navigator.clipboard.writeText(scopes.join("\n"));
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
      <button type="button" className="ms-btn-secondary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={copy}>
        Copy scope list ({scopes.length})
      </button>
      {state === "copied" && <span style={{ color: "#166534" }}>Copied</span>}
      {state === "failed" && <span style={{ color: "#b91c1c" }}>Couldn't copy. Select the scopes in the table instead.</span>}
    </div>
  );
}
