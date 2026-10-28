import { useEffect, useState } from "react";
import mockupHtml from "../assets/clientSuccessMockup.html?raw";
import { api } from "../lib/api";

// Clickable Client Success mockup (sample data only) for CSM feedback.
// Deliberately unlinked: no module tile or nav entry — shared by URL.
// Full page like ModuleSelectPage because the mockup draws its own sidebar.
// api.me() redirects to /login on 401, so only signed-in users reach it.
const HIDDEN_FROM = ["client", "partner_ae"];

export default function ClientSuccessPreviewPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const isStaging = window.location.hostname.includes("staging");

  useEffect(() => {
    api.me()
      .then((res) => setAllowed(!HIDDEN_FROM.includes(res.role)))
      .catch(() => setAllowed(false));
  }, []);

  if (allowed === null) return null;
  if (!allowed) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center", color: "#64748b" }}>
        This page isn't available for your account.
      </div>
    );
  }

  return (
    <iframe
      title="Client Success mockup"
      srcDoc={mockupHtml}
      sandbox="allow-scripts allow-forms"
      style={{ display: "block", width: "100%", height: isStaging ? "calc(100vh - 24px)" : "100vh", border: 0 }}
    />
  );
}
