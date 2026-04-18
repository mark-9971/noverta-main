export default function D5FutureGlass() {
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "linear-gradient(135deg, #0f0524 0%, #0d1b4b 40%, #0c2444 100%)", minHeight: "100vh", color: "#e2e8f0", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -200, left: "30%", width: 600, height: 600, background: "radial-gradient(circle, rgba(139,92,246,0.3) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: 100, right: "10%", width: 400, height: 400, background: "radial-gradient(circle, rgba(59,130,246,0.2) 0%, transparent 70%)", pointerEvents: "none" }} />

      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 64px", background: "rgba(255,255,255,0.04)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.08)", position: "relative", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, background: "linear-gradient(135deg, #8b5cf6, #3b82f6)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontSize: 16, fontWeight: 800 }}>T</span>
          </div>
          <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em", color: "#fff" }}>Trellis</span>
        </div>
        <div style={{ display: "flex", gap: 28, fontSize: 14, color: "rgba(255,255,255,0.5)" }}>
          {["Platform", "Solutions", "Pricing", "Company"].map(l => (
            <span key={l} style={{ cursor: "pointer" }}>{l}</span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ padding: "9px 20px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.8)", fontSize: 14, cursor: "pointer", backdropFilter: "blur(10px)" }}>
            Sign in
          </button>
          <button style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #8b5cf6, #3b82f6)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Get access
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 64px 0", position: "relative", zIndex: 5 }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.35)", borderRadius: 100, padding: "7px 18px", marginBottom: 28, fontSize: 12, color: "#a78bfa", fontWeight: 600, letterSpacing: "0.04em" }}>
            <span style={{ width: 6, height: 6, background: "#a78bfa", borderRadius: "50%", display: "inline-block", boxShadow: "0 0 8px #a78bfa" }} />
            INTRODUCING TRELLIS 2.0 — REAL-TIME SPED INTELLIGENCE
          </div>
          <h1 style={{ fontSize: 76, fontWeight: 900, lineHeight: 0.95, letterSpacing: "-0.05em", color: "#fff", marginBottom: 24 }}>
            Compliance<br />
            <span style={{ background: "linear-gradient(90deg, #a78bfa, #60a5fa, #34d399)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              at the speed of care.
            </span>
          </h1>
          <p style={{ fontSize: 18, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, maxWidth: 500, margin: "0 auto 40px" }}>
            AI-augmented compliance monitoring that catches IEP gaps before they become violations. Built for the future of SPED administration.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button style={{ padding: "15px 32px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #8b5cf6, #3b82f6)", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: "0 8px 32px rgba(139,92,246,0.4)" }}>
              Request early access →
            </button>
            <button style={{ padding: "15px 28px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.8)", fontSize: 16, cursor: "pointer", backdropFilter: "blur(10px)" }}>
              See it live
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: 16 }}>
          <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", borderRadius: 20, border: "1px solid rgba(255,255,255,0.1)", padding: "32px", gridRow: "1 / 3" }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 20 }}>Live Compliance Score</div>
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ position: "relative", display: "inline-block" }}>
                <svg width={160} height={160} style={{ transform: "rotate(-90deg)" }}>
                  <circle cx={80} cy={80} r={68} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={12} />
                  <circle cx={80} cy={80} r={68} fill="none" stroke="url(#grad)" strokeWidth={12} strokeDasharray="427" strokeDashoffset={427 * 0.06} strokeLinecap="round" />
                  <defs>
                    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#8b5cf6" />
                      <stop offset="100%" stopColor="#34d399" />
                    </linearGradient>
                  </defs>
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ fontSize: 42, fontWeight: 900, color: "#fff", letterSpacing: "-0.04em" }}>94</div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>out of 100</div>
                </div>
              </div>
              <div style={{ marginTop: 20, fontSize: 14, color: "rgba(255,255,255,0.5)" }}>MetroWest Collaborative</div>
              <div style={{ display: "inline-block", marginTop: 8, background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 100, padding: "4px 14px", fontSize: 12, color: "#34d399", fontWeight: 600 }}>↑ 3.1 pts this month</div>
            </div>
            <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 10 }}>
              {[["On track", "49 students", "#34d399"], ["Needs review", "2 students", "#f59e0b"], ["At risk", "1 student", "#ef4444"]].map(([l, v, c]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{l}</span>
                  </div>
                  <span style={{ fontSize: 13, color: "#fff", fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: "rgba(139,92,246,0.12)", backdropFilter: "blur(20px)", borderRadius: 20, border: "1px solid rgba(139,92,246,0.25)", padding: "28px" }}>
            <div style={{ fontSize: 12, color: "#a78bfa", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>Active Alerts</div>
            <div style={{ fontSize: 44, fontWeight: 900, color: "#fff", letterSpacing: "-0.04em" }}>3</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>open compliance alerts</div>
            <div style={{ fontSize: 12, color: "#a78bfa", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>View all alerts →</div>
          </div>

          <div style={{ background: "rgba(52,211,153,0.08)", backdropFilter: "blur(20px)", borderRadius: 20, border: "1px solid rgba(52,211,153,0.2)", padding: "28px" }}>
            <div style={{ fontSize: 12, color: "#34d399", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>Exposure Risk</div>
            <div style={{ fontSize: 44, fontWeight: 900, color: "#fff", letterSpacing: "-0.04em" }}>$2.3K</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>vs $8.1K last month</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#34d399" }}>↓ 71%</div>
          </div>

          <div style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(20px)", borderRadius: 20, border: "1px solid rgba(255,255,255,0.08)", padding: "28px" }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>IEP Deadlines</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[["Apr 18", "Sarah K. — Annual"], ["Apr 21", "Marcus L. — Triennial"], ["Apr 28", "Aisha P. — Annual"]].map(([d, n]) => (
                <div key={n} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "#60a5fa", fontWeight: 600 }}>{d}</span>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>{n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
