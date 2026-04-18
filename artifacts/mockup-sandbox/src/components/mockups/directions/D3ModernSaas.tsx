export default function D3ModernSaas() {
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#ffffff", minHeight: "100vh", color: "#111827" }}>
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 48px", borderBottom: "1px solid #f3f4f6", position: "sticky", top: 0, background: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, background: "#059669", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>T</span>
          </div>
          <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.02em" }}>Trellis</span>
          <span style={{ fontSize: 11, background: "#f0fdf4", color: "#059669", border: "1px solid #bbf7d0", borderRadius: 4, padding: "2px 8px", fontWeight: 600, marginLeft: 4 }}>SPED</span>
        </div>
        <div style={{ display: "flex", gap: 28, fontSize: 14, color: "#6b7280" }}>
          {["Product", "Solutions", "Pricing", "Changelog"].map(l => (
            <span key={l} style={{ cursor: "pointer" }}>{l}</span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 14, color: "#6b7280", cursor: "pointer" }}>Log in</span>
          <button style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Get started
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "72px 48px 0" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 100, padding: "6px 14px", marginBottom: 24, fontSize: 13, color: "#059669", fontWeight: 600 }}>
            <span>✦</span> New: Real-time compensatory exposure tracking
          </div>
          <h1 style={{ fontSize: 72, fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 1.0, margin: "0 0 20px", maxWidth: 760, marginLeft: "auto", marginRight: "auto" }}>
            SPED compliance<br />
            <span style={{ background: "linear-gradient(135deg, #059669, #0d9488)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              finally makes sense.
            </span>
          </h1>
          <p style={{ fontSize: 18, color: "#6b7280", lineHeight: 1.65, maxWidth: 520, margin: "0 auto 36px" }}>
            Stop chasing spreadsheets. Trellis surfaces every compliance gap, missed session, and IEP deadline the moment it happens.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button style={{ padding: "14px 28px", borderRadius: 10, border: "none", background: "#059669", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
              Start free trial
            </button>
            <button style={{ padding: "14px 28px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", color: "#374151", fontSize: 16, cursor: "pointer" }}>
              Watch demo ▶
            </button>
          </div>
          <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 16 }}>No credit card required · Set up in 15 minutes</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gridTemplateRows: "auto auto", gap: 16 }}>
          <div style={{ gridColumn: "1 / 3", background: "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)", borderRadius: 16, border: "1px solid #d1fae5", padding: "32px 36px", display: "flex", alignItems: "center", gap: 40 }}>
            <div>
              <div style={{ fontSize: 48, fontWeight: 800, color: "#059669", letterSpacing: "-0.04em" }}>94.2%</div>
              <div style={{ fontSize: 14, color: "#047857", fontWeight: 600, marginBottom: 6 }}>District compliance rate</div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>↑ 3.1 pts vs last 30 days · 52 students tracked</div>
            </div>
            <div style={{ flex: 1, height: 80, display: "flex", alignItems: "flex-end", gap: 4 }}>
              {[55, 62, 58, 70, 78, 82, 79, 86, 90, 88, 91, 94].map((h, i) => (
                <div key={i} style={{ flex: 1, background: i === 11 ? "#059669" : "#a7f3d0", borderRadius: "3px 3px 0 0", height: `${h}%` }} />
              ))}
            </div>
          </div>

          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6", padding: "28px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 16 }}>Open Alerts</div>
            {[
              { label: "IEP expiring in 15 days", badge: "urgent", color: "#ef4444" },
              { label: "Jordan M. — 3 missed sessions", badge: "risk", color: "#f59e0b" },
              { label: "Progress report overdue", badge: "pending", color: "#6b7280" },
            ].map(a => (
              <div key={a.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f9fafb" }}>
                <span style={{ fontSize: 13, color: "#374151" }}>{a.label}</span>
                <span style={{ fontSize: 11, color: a.color, background: a.color + "15", padding: "3px 8px", borderRadius: 4, fontWeight: 600 }}>{a.badge}</span>
              </div>
            ))}
          </div>

          <div style={{ background: "#111827", borderRadius: 16, padding: "28px", color: "#fff" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 20 }}>Cost Exposure</div>
            <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.04em", color: "#10b981" }}>$2,340</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>Compensatory obligations open</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>DOWN from <span style={{ color: "#f59e0b" }}>$8,100</span> 30 days ago</div>
          </div>

          <div style={{ background: "#f8fafc", borderRadius: 16, border: "1px solid #f1f5f9", padding: "28px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 20 }}>Services This Week</div>
            {[["Speech", "87%"], ["OT", "72%"], ["Behavioral", "95%"]].map(([name, pct]) => (
              <div key={name} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: "#374151", fontWeight: 500 }}>{name}</span>
                  <span style={{ color: "#059669", fontWeight: 700 }}>{pct}</span>
                </div>
                <div style={{ height: 6, background: "#e5e7eb", borderRadius: 3 }}>
                  <div style={{ height: "100%", width: pct, background: "linear-gradient(90deg, #059669, #0d9488)", borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ gridColumn: "2 / 4", background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6", padding: "28px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 16 }}>IEP Deadlines — Next 30 Days</div>
            <div style={{ display: "flex", gap: 10 }}>
              {[7, 12, 15, 21, 28].map(day => (
                <div key={day} style={{ flex: 1, background: day <= 15 ? "#fef2f2" : "#f0fdf4", border: `1px solid ${day <= 15 ? "#fecaca" : "#bbf7d0"}`, borderRadius: 10, padding: "16px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: day <= 15 ? "#ef4444" : "#059669" }}>Apr {day}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>Annual review</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
