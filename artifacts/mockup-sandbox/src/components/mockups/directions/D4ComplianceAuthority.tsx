export default function D4ComplianceAuthority() {
  return (
    <div style={{ fontFamily: "'Georgia', 'Times New Roman', serif", background: "#f8f9fc", minHeight: "100vh", color: "#1a2340" }}>
      <div style={{ background: "#1a2340", padding: "10px 64px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, color: "#8899bb", fontFamily: "system-ui, sans-serif" }}>Trellis SPED Compliance Platform · Massachusetts Aligned · FERPA Compliant</span>
        <div style={{ display: "flex", gap: 20, fontSize: 12, color: "#8899bb", fontFamily: "system-ui, sans-serif" }}>
          <span>📞 Support</span>
          <span>📘 Documentation</span>
          <span>🔐 Admin Login</span>
        </div>
      </div>

      <nav style={{ background: "#fff", borderBottom: "3px solid #c5a84a", padding: "16px 64px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 48, height: 48, background: "#1a2340", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 2 }}>
            <div style={{ width: 24, height: 3, background: "#c5a84a", borderRadius: 2 }} />
            <div style={{ width: 18, height: 3, background: "#c5a84a", borderRadius: 2 }} />
            <div style={{ width: 22, height: 3, background: "#c5a84a", borderRadius: 2 }} />
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", color: "#1a2340" }}>TRELLIS</div>
            <div style={{ fontSize: 11, color: "#8899bb", fontFamily: "system-ui, sans-serif", letterSpacing: "0.1em", textTransform: "uppercase" }}>Special Education Compliance</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 28, fontSize: 15, color: "#2d3f66", fontFamily: "system-ui, sans-serif", fontWeight: 500 }}>
          {["Platform Overview", "For Districts", "Resources", "About"].map(l => (
            <span key={l} style={{ cursor: "pointer", borderBottom: "2px solid transparent" }}>{l}</span>
          ))}
        </div>
        <button style={{ padding: "12px 28px", borderRadius: 4, border: "2px solid #1a2340", background: "#1a2340", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "system-ui, sans-serif", letterSpacing: "0.03em" }}>
          REQUEST A DEMONSTRATION
        </button>
      </nav>

      <div style={{ background: "linear-gradient(135deg, #1a2340 0%, #243160 100%)", padding: "80px 64px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, right: 0, width: 400, height: "100%", background: "repeating-linear-gradient(45deg, rgba(197,168,74,0.04), rgba(197,168,74,0.04) 1px, transparent 1px, transparent 20px)", pointerEvents: "none" }} />
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", gap: 16, marginBottom: 32 }}>
            {["MA DESE Aligned", "FERPA Compliant", "SOC 2 Type II"].map(b => (
              <div key={b} style={{ background: "rgba(197,168,74,0.15)", border: "1px solid #c5a84a", borderRadius: 4, padding: "6px 14px", fontSize: 12, color: "#c5a84a", fontFamily: "system-ui, sans-serif", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                ✓ {b}
              </div>
            ))}
          </div>
          <h1 style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em", color: "#fff", marginBottom: 24, maxWidth: 660 }}>
            The compliance system Massachusetts SPED directors trust.
          </h1>
          <p style={{ fontSize: 17, color: "#8899bb", lineHeight: 1.75, marginBottom: 40, maxWidth: 520, fontFamily: "system-ui, sans-serif" }}>
            Trellis provides the documentation rigor, deadline tracking, and audit-ready reporting that SPED programs require — without the spreadsheet burden.
          </p>
          <div style={{ display: "flex", gap: 14 }}>
            <button style={{ padding: "14px 32px", border: "none", background: "#c5a84a", color: "#1a2340", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "system-ui, sans-serif", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Schedule a Consultation
            </button>
            <button style={{ padding: "14px 28px", border: "2px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff", fontSize: 15, cursor: "pointer", fontFamily: "system-ui, sans-serif" }}>
              Download Compliance Brief →
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "64px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, background: "#dde3ef", border: "1px solid #dde3ef" }}>
          {[
            { head: "IEP Service Tracking", body: "Real-time delivery logging against mandated minutes, with automatic shortfall detection and compensatory obligation triggers." },
            { head: "Deadline Management", body: "Annual review, triennial evaluation, and progress report calendars with 30/60/90-day advance notifications to responsible parties." },
            { head: "Audit Documentation", body: "Timestamped session logs, provider sign-offs, and automated compliance reports formatted for DESE submissions and OCR inquiries." },
            { head: "District Administration", body: "Multi-school visibility, enrollment management, and role-based access controls designed for collaborative and consortium models." },
          ].map(f => (
            <div key={f.head} style={{ background: "#fff", padding: "36px", borderLeft: "4px solid #1a2340" }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#1a2340", marginBottom: 12 }}>{f.head}</div>
              <div style={{ fontSize: 14, color: "#5a6580", lineHeight: 1.7, fontFamily: "system-ui, sans-serif" }}>{f.body}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 48, background: "#1a2340", borderRadius: 8, padding: "40px 48px", display: "flex", gap: 48, alignItems: "center" }}>
          {[["94.2%", "Compliance rate", "MetroWest pilot"], ["0", "Missed IEP deadlines", "Since implementation"], ["$5,760", "Exposure reduced", "First 30 days"]].map(([v, l, sub]) => (
            <div key={l} style={{ flex: 1, textAlign: "center", borderRight: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize: 48, fontWeight: 700, color: "#c5a84a", letterSpacing: "-0.03em" }}>{v}</div>
              <div style={{ fontSize: 15, color: "#fff", fontWeight: 600, marginTop: 4 }}>{l}</div>
              <div style={{ fontSize: 13, color: "#8899bb", marginTop: 4, fontFamily: "system-ui, sans-serif" }}>{sub}</div>
            </div>
          ))}
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 48, fontWeight: 700, color: "#c5a84a", letterSpacing: "-0.03em" }}>52</div>
            <div style={{ fontSize: 15, color: "#fff", fontWeight: 600, marginTop: 4 }}>Students protected</div>
            <div style={{ fontSize: 13, color: "#8899bb", marginTop: 4, fontFamily: "system-ui, sans-serif" }}>Across 3 schools</div>
          </div>
        </div>
      </div>
    </div>
  );
}
