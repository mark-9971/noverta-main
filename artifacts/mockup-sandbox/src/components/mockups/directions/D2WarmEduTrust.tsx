export default function D2WarmEduTrust() {
  return (
    <div style={{ fontFamily: "'Georgia', 'Times New Roman', serif", background: "#faf7f2", minHeight: "100vh", color: "#2d2a25" }}>
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 64px", background: "#fff", borderBottom: "2px solid #e8e0d4" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, background: "#4a7c59", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontSize: 18 }}>🌿</span>
          </div>
          <span style={{ fontWeight: 700, fontSize: 20, color: "#2d2a25", fontFamily: "Georgia, serif" }}>Trellis</span>
        </div>
        <div style={{ display: "flex", gap: 32, fontSize: 15, color: "#6b6560", fontFamily: "system-ui, sans-serif" }}>
          {["For Directors", "For Providers", "For Families", "Pricing"].map(l => (
            <span key={l} style={{ cursor: "pointer" }}>{l}</span>
          ))}
        </div>
        <button style={{ padding: "10px 24px", borderRadius: 100, border: "none", background: "#4a7c59", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "system-ui, sans-serif" }}>
          Talk to us
        </button>
      </nav>

      <div style={{ background: "linear-gradient(180deg, #fff 0%, #faf7f2 100%)", padding: "72px 64px 56px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 80, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "inline-block", background: "#e8f5ec", color: "#4a7c59", fontSize: 13, fontWeight: 600, borderRadius: 6, padding: "6px 14px", marginBottom: 28, fontFamily: "system-ui, sans-serif" }}>
              Built for special educators, by people who understand SPED
            </div>
            <h1 style={{ fontSize: 52, fontWeight: 700, lineHeight: 1.15, margin: "0 0 24px", color: "#1a1714" }}>
              Every child gets<br />
              <em style={{ color: "#4a7c59", fontStyle: "italic" }}>what they're owed.</em>
            </h1>
            <p style={{ fontSize: 17, color: "#5c5750", lineHeight: 1.75, marginBottom: 36, maxWidth: 460, fontFamily: "system-ui, sans-serif" }}>
              Trellis helps SPED coordinators track IEP service delivery, catch compliance gaps early, and build the documentation that protects your district and your students.
            </p>
            <div style={{ display: "flex", gap: 12, marginBottom: 48 }}>
              <button style={{ padding: "14px 28px", borderRadius: 100, border: "none", background: "#4a7c59", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "system-ui, sans-serif" }}>
                See it in action →
              </button>
              <button style={{ padding: "14px 28px", borderRadius: 100, border: "2px solid #c8bfb4", background: "transparent", color: "#5c5750", fontSize: 15, cursor: "pointer", fontFamily: "system-ui, sans-serif" }}>
                Read case study
              </button>
            </div>
            <div style={{ display: "flex", gap: 32, borderTop: "1px solid #e8e0d4", paddingTop: 28 }}>
              {[["52", "Students tracked"], ["94%", "Compliance rate"], ["∅", "Missed IEP deadlines"]].map(([v, l]) => (
                <div key={l}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#4a7c59" }}>{v}</div>
                  <div style={{ fontSize: 13, color: "#8a7f74", marginTop: 2, fontFamily: "system-ui, sans-serif" }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, background: "#fff", borderRadius: 20, border: "2px solid #e8e0d4", overflow: "hidden", boxShadow: "0 16px 64px rgba(0,0,0,0.06)" }}>
            <div style={{ background: "#f0f7f2", padding: "20px 24px", borderBottom: "1px solid #dff0e4", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "system-ui, sans-serif", fontSize: 14, fontWeight: 600, color: "#2d5a3d" }}>MetroWest Collaborative — Week of Apr 14</span>
              <span style={{ fontSize: 12, background: "#4a7c59", color: "#fff", padding: "3px 10px", borderRadius: 100, fontFamily: "system-ui, sans-serif" }}>Live</span>
            </div>
            {[
              { name: "Jordan M.", service: "Speech & Language", pct: 88, status: "On track", color: "#4a7c59" },
              { name: "Priya K.", service: "OT Services", pct: 61, status: "Needs attention", color: "#e67e22" },
              { name: "Ethan B.", service: "Behavioral Support", pct: 95, status: "On track", color: "#4a7c59" },
              { name: "Sofia R.", service: "Reading Support", pct: 40, status: "At risk", color: "#c0392b" },
            ].map(s => (
              <div key={s.name} style={{ padding: "16px 24px", borderBottom: "1px solid #f0ebe4", display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#e8f0ea", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#4a7c59", fontFamily: "system-ui, sans-serif" }}>
                  {s.name[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#2d2a25", fontFamily: "system-ui, sans-serif" }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: "#8a7f74", fontFamily: "system-ui, sans-serif" }}>{s.service}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: s.color, fontFamily: "system-ui, sans-serif" }}>{s.pct}%</div>
                  <div style={{ fontSize: 11, color: s.color, fontFamily: "system-ui, sans-serif" }}>{s.status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: "#fff", padding: "56px 64px", maxWidth: 1200, margin: "0 auto", borderTop: "1px solid #e8e0d4" }}>
        <p style={{ fontSize: 14, color: "#8a7f74", fontFamily: "system-ui, sans-serif", marginBottom: 24, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Trusted by district leaders across Massachusetts</p>
        <div style={{ display: "flex", gap: 48, alignItems: "center" }}>
          {["MetroWest Collaborative", "Framingham SPED", "Westborough Schools", "Shrewsbury District"].map(d => (
            <div key={d} style={{ fontSize: 16, color: "#b0a89e", fontWeight: 600, fontFamily: "system-ui, sans-serif" }}>{d}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
