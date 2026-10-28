import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import logoUrl from "../assets/white logo transparency.png";
import { api, type User, type SystemStatusResponse } from "../lib/api";
import { SystemStatusBadge } from "../components/ui/SystemStatusBadge";
import { UserChip } from "../components/ui/UserChip";
import { useIsMobile } from "../hooks/useIsMobile";

type Module = {
  num: string;
  tag: string;
  title: string;
  subtitle: string;
  features: string[];
  accent: string;
  glow: string;
  route: string | null;
  icon: React.ReactNode;
  visibleTo?: string[]; // if set, only these roles can see this card
  stagingOnly?: boolean; // demo modules: shown on staging + local dev, never prod
};

// Internal PF roles — excludes client and partner_ae.
const INTERNAL_ROLES = ["admin", "executive", "pm", "pf_ae", "pf_sa", "pf_csm", "pf_engineer"];

const iconStyle = { width: 22, height: 22 };

const MODULES: Module[] = [
  {
    num: "00",
    tag: "Pre-Sales",
    title: "Prospecting",
    subtitle: "AI Sales Intelligence",
    features: ["Apollo.io enrichment", "Decision-maker targeting", "AI Why Now & emails", "Prospect tiering"],
    accent: "#7c3aed",
    glow: "rgba(124,58,237,0.22)",
    route: "/prospecting",
    visibleTo: [], // hidden from everyone
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={iconStyle}>
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6M8 11h6"/>
      </svg>
    ),
  },
  {
    num: "01",
    tag: "Discovery",
    title: "Solutioning",
    subtitle: "Evaluate and Recommend",
    features: ["Stakeholder intake forms", "Requirements matrix", "Gap & risk analysis", "Solution scope docs"],
    accent: "#2563eb",
    glow: "rgba(37,99,235,0.25)",
    route: "/solutions",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={iconStyle}>
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35M11 8v6M8 11h6"/>
      </svg>
    ),
  },
  {
    num: "02",
    tag: "CloudPro",
    title: "Implementation",
    subtitle: "Onboarding & Setup",
    features: ["Onboarding templates", "Milestone tracking", "Client portal setup", "Porting & numbers"],
    accent: "#17c662",
    glow: "rgba(23,198,98,0.25)",
    route: "/dashboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={iconStyle}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
  {
    num: "03",
    tag: "CloudSupport",
    title: "Support",
    subtitle: "Case Management",
    features: ["CRM case tracking", "Attachments & notes", "Priority & status", "Escalation routing"],
    accent: "#0891b2",
    glow: "rgba(8,145,178,0.25)",
    route: "/support/cases",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={iconStyle}>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
  {
    num: "04",
    tag: "Long-Term Value",
    title: "Optimization",
    subtitle: "Continuous Enhancement",
    features: ["QBR scheduling", "Usage analytics", "Expansion tracking", "SLA & KPI monitoring"],
    accent: "#059669",
    glow: "rgba(5,150,105,0.25)",
    route: "/optimize",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={iconStyle}>
        <path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>
      </svg>
    ),
  },
  {
    num: "05",
    tag: "Site Survey",
    title: "Field Audit",
    subtitle: "Site & Device Audit",
    features: ["Floor plans & pins", "Device photos", "Works offline on site", "Live results & totals"],
    accent: "#3860b2",
    glow: "rgba(56,96,178,0.25)",
    route: null,
    visibleTo: INTERNAL_ROLES,
    stagingOnly: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={iconStyle}>
        <path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><rect x="9" y="2" width="6" height="4" rx="1"/>
        <path d="M12 17s-3-2.6-3-5a3 3 0 0 1 6 0c0 2.4-3 5-3 5z"/>
      </svg>
    ),
  },
  {
    num: "06",
    tag: "Client Success",
    title: "Partnership",
    subtitle: "Health & Advocacy",
    features: ["Technology roadmaps", "Renewal tracking", "Satisfaction surveys", "Success plans"],
    accent: "#7c3aed",
    glow: "rgba(124,58,237,0.25)",
    route: "/client-success/preview",
    visibleTo: INTERNAL_ROLES,
    stagingOnly: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={iconStyle}>
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
        <path d="m9 12 2 2 4-4"/>
      </svg>
    ),
  },
];

export default function ModuleSelectPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sysStatus, setSysStatus] = useState<SystemStatusResponse | null>(null);

  useEffect(() => {
    api.me().then((r) => setUser(r.user)).catch(() => {});
  }, []);

  useEffect(() => {
    function fetchStatus() {
      api.systemStatus().then(setSysStatus).catch(() => {});
    }
    fetchStatus();
    const id = setInterval(fetchStatus, 300_000);
    return () => clearInterval(id);
  }, []);

  const isClient = user?.role === "client";
  const userRole = user?.role ?? "";
  const host = window.location.hostname;
  const showStagingModules = host.includes("staging") || host === "localhost";

  const visibleModules = isClient
    ? MODULES.filter((m) => m.route === "/dashboard" || m.route === "/solutions" || m.route === "/support/cases").map((m) =>
        m.route === "/dashboard" ? { ...m, route: "/projects" } : m
      )
    : MODULES
        .filter((m) => !m.visibleTo || m.visibleTo.includes(userRole))
        .filter((m) => !m.stagingOnly || showStagingModules)
        .map((m) => m.route === "/support/cases" ? { ...m, route: "/support/dashboard" } : m);

  function handleCardClick(mod: Module) {
    if (mod.route) {
      navigate(mod.route);
    } else {
      setToast(`${mod.title} — Coming Soon`);
      setTimeout(() => setToast(null), 2500);
    }
  }

  const isMobile = useIsMobile();
  // Up to four cards sit in one row; five or more wrap three to a row.
  const columns = visibleModules.length <= 4 ? visibleModules.length : 3;

  return (
    <div style={{ minHeight: "100vh", background: "#ffffff", color: "#1e293b", fontFamily: "'avenir-lt-pro', sans-serif", overflowX: "hidden", position: "relative" }}>

      {/* Header — dark navy */}
      <header style={{ position: "relative", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 48px", height: 64, background: "#021e34" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <SystemStatusBadge status={sysStatus} />
          {user && <UserChip user={user} popout="down" />}
        </div>
      </header>

      {/* Hero — PF blue band */}
      <section style={{ position: "relative", zIndex: 5, textAlign: "center", padding: isMobile ? "32px 24px 26px" : "48px 48px 36px", background: "#021e34" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: isMobile ? 10 : 14, marginBottom: isMobile ? 2 : 4 }}>
          <img src={logoUrl} alt="Packet Fusion" style={{ height: isMobile ? 34 : 52, width: "auto", display: "block" }} />
          <div style={{ fontFamily: "'avenir-lt-pro', sans-serif", fontSize: isMobile ? 34 : "clamp(44px, 5vw, 72px)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1, color: "#ffffff", whiteSpace: "nowrap" }}>
            Cloud<span style={{ color: "#22c55e" }}>Connect</span>
          </div>
        </div>
        <h1 style={{ fontFamily: "'avenir-lt-pro', sans-serif", fontSize: isMobile ? "26px" : "clamp(28px, 3.5vw, 44px)", fontWeight: 700, lineHeight: 1.1, letterSpacing: "0.01em", marginBottom: 14, color: "#ffffff" }}>
          Connecting the Dots in the Cloud
        </h1>
      </section>

      {/* Modules — white section */}
      <section style={{ position: "relative", zIndex: 5, padding: isMobile ? "28px 16px 48px" : "40px 48px 72px", background: "#ffffff" }}>
        <p style={{ textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#64748b", marginBottom: 24 }}>
          Choose your module
        </p>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : `repeat(${columns}, minmax(0, 340px))`, gap: 16, maxWidth: 1440, margin: "0 auto", justifyContent: "center" }}>
          {visibleModules.map((mod, i) => {
            const isHovered = hovered === i;
            const isActive = mod.route !== null;
            return (
              <div
                key={mod.num}
                onClick={() => handleCardClick(mod)}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  background: "#ffffff",
                  border: `1px solid ${isHovered && isActive ? mod.accent : "#03395f"}`,
                  borderRadius: 16,
                  padding: isMobile ? "20px 20px 16px" : "22px 22px 18px",
                  cursor: isActive ? "pointer" : "default",
                  overflow: "hidden",
                  transition: "transform 0.35s cubic-bezier(0.22,1,0.36,1), border-color 0.3s, box-shadow 0.35s",
                  transform: isHovered && isActive ? "translateY(-6px)" : "none",
                  boxShadow: isHovered && isActive ? `0 20px 60px ${mod.glow}, 0 0 0 1px ${mod.accent}` : "0 2px 8px rgba(3,57,95,0.06)",
                  opacity: !isActive && isHovered ? 0.85 : 1,
                }}
              >
                {/* Glow overlay */}
                <div style={{ position: "absolute", inset: 0, borderRadius: 20, background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${mod.glow}, transparent 70%)`, opacity: isHovered ? 1 : 0, transition: "opacity 0.4s", pointerEvents: "none" }} />

                {/* Icon + tag + step */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: `${mod.accent}22`, border: `1px solid ${mod.accent}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: mod.accent, transition: "transform 0.35s cubic-bezier(0.22,1,0.36,1)", transform: isHovered && isActive ? "scale(1.08)" : "none" }}>
                    {mod.icon}
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: mod.accent, background: `${mod.accent}1e`, border: `1px solid ${mod.accent}40`, borderRadius: 4, padding: "3px 8px" }}>
                    {mod.tag}
                  </span>
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                    {!isActive && (
                      <span style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", background: "rgba(0,0,0,0.06)", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 4, padding: "2px 7px", color: "#64748b" }}>
                        Soon
                      </span>
                    )}
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#64748b" }}>{mod.num}</span>
                  </div>
                </div>

                {/* Title */}
                <div style={{ fontFamily: "'avenir-lt-pro', sans-serif", fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
                  {mod.title}
                  <span style={{ display: "block", color: "#64748b", fontWeight: 400, fontSize: 14, marginTop: 3 }}>{mod.subtitle}</span>
                </div>

                {/* Features */}
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
                  {mod.features.map((f) => (
                    <li key={f} style={{ display: "flex", alignItems: "baseline", gap: 7, fontSize: 12, lineHeight: 1.35, color: "#475569" }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: mod.accent, flexShrink: 0, display: "inline-block", transform: "translateY(-2px)" }} />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 12, borderTop: "1px solid #e2e8f0" }}>
                  <span style={{ fontFamily: "'avenir-lt-pro', sans-serif", fontSize: 13, fontWeight: 700, color: isActive ? mod.accent : "#64748b", letterSpacing: "0.02em", display: "flex", alignItems: "center", gap: 6 }}>
                    {isActive ? "Enter Module" : "Coming Soon"}
                    {isActive && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width: 13, height: 13 }}><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <div style={{ position: "relative", zIndex: 5, textAlign: "center", padding: "20px 24px 28px", borderTop: "1px solid #e2e8f0", background: "#ffffff", fontSize: 12, color: "#64748b" }}>
        © 2026 Packet Fusion
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", background: "rgba(2,26,46,0.95)", backdropFilter: "blur(12px)", border: "1px solid rgba(99,193,234,0.4)", borderRadius: 12, padding: "14px 24px", fontFamily: "'avenir-lt-pro', sans-serif", fontSize: 14, fontWeight: 600, color: "#63c1ea", zIndex: 100, whiteSpace: "nowrap", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
          ↗ {toast}
        </div>
      )}
    </div>
  );
}
