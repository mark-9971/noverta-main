export default function D1PrecisionCommand() {
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#0a0f1e", minHeight: "100vh", color: "#e2e8f0" }}>
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 64px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, background: "linear-gradient(135deg, #06b6d4, #3b82f6)", borderRadius: 8 }} />
          <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em", color: "#fff" }}>Trellis</span>
        </div>
        <div style={{ display: "flex", gap: 32, fontSize: 14, color: "#94a3b8" }}>
          {["Platform", "Compliance", "Districts", "Pricing"].map(l => (
            <span key={l} style={{ cursor: "pointer" }}>{l}</span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#e2e8f0", fontSize: 14, cursor: "pointer" }}>Sign in</button>
          <button style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #06b6d4, #3b82f6)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Request demo</button>
        </div>
      </nav>

      <div style={{ padding: "80px 64px 0", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.25)", borderRadius: 100, padding: "6px 16px", marginBottom: 32, fontSize: 12, color: "#06b6d4", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
          <span style={{ width: 6, height: 6, background: "#06b6d4", borderRadius: "50%", display: "inline-block" }} />
          FERPA-compliant · MA DESE-aligned
        </div>

        <h1 style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.04em", maxWidth: 740, margin: "0 0 24px", color: "#fff" }}>
          Every mandated minute.<br />
          <span style={{ background: "linear-gradient(90deg, #06b6d4, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Accounted for.
          </span>
        </h1>
        <p style={{ fontSize: 18, color: "#94a3b8", maxWidth: 540, lineHeight: 1.65, marginBottom: 40 }}>
          Trellis is the compliance command center for SPED directors — real-time service delivery tracking, IEP deadline management, and compensatory exposure alerts in one system.
        </p>

        <div style={{ display: "flex", gap: 14, marginBottom: 80 }}>
          <button style={{ padding: "14px 32px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #06b6d4, #3b82f6)", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
            See a live district →
          </button>
          <button style={{ padding: "14px 28px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "#e2e8f0", fontSize: 16, cursor: "pointer" }}>
            View compliance demo
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2, background: "rgba(255,255,255,0.04)", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
          {[
            { label: "Overall Compliance", value: "94.2%", sub: "↑ 3.1% vs last month", color: "#06b6d4" },
            { label: "Students On Track", value: "49 / 52", sub: "3 need attention", color: "#22c55e" },
            { label: "Exposure Risk", value: "$2,340", sub: "Down from $8,100", color: "#f59e0b" },
          ].map(stat => (
            <div key={stat.label} style={{ padding: "32px", background: "rgba(255,255,255,0.02)" }}>
              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>{stat.label}</div>
              <div style={{ fontSize: 40, fontWeight: 800, color: stat.color, letterSpacing: "-0.03em", marginBottom: 6 }}>{stat.value}</div>
              <div style={{ fontSize: 13, color: "#475569" }}>{stat.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 64, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16 }}>
          {[
            { icon: "⚡", label: "Live tracking", desc: "Session delivery logged in real time against IEP minutes" },
            { icon: "🛡️", label: "Alert engine", desc: "Proactive flags before students fall out of compliance" },
            { icon: "📊", label: "Board reports", desc: "One-click exports formatted for district leadership" },
            { icon: "🔗", label: "SIS sync", desc: "PowerSchool, Infinite Campus, and Skyward integrations" },
          ].map(f => (
            <div key={f.label} style={{ padding: "24px", background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>{f.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#e2e8f0", marginBottom: 6 }}>{f.label}</div>
              <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.55 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
