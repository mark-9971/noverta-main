export function MidnightMoss() {
  const nav = ["Dashboard", "Students", "IEP Builder", "Compliance", "Reports"];
  const stats = [
    { label: "Active IEPs", value: "248", delta: "+3 this week" },
    { label: "Compliance Rate", value: "94%", delta: "On track" },
    { label: "Due This Month", value: "17", delta: "Meetings" },
  ];
  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui, sans-serif", background: "#0d1b0f" }}>
      {/* Sidebar */}
      <div style={{ width: 160, background: "#0a1509", borderRight: "1px solid #1a2e1c", padding: "24px 0", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ padding: "0 16px 20px", borderBottom: "1px solid #1a2e1c", marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f0fdf4", letterSpacing: "-0.01em" }}>Trellis</div>
          <div style={{ fontSize: 11, color: "#4ade80", marginTop: 2, opacity: 0.6 }}>Built to support.</div>
        </div>
        {nav.map((item, i) => (
          <div key={item} style={{
            margin: "0 8px", padding: "8px 10px", borderRadius: 6, fontSize: 12, fontWeight: i === 0 ? 600 : 400,
            color: i === 0 ? "#4ade80" : "#6b7280", background: i === 0 ? "rgba(74,222,128,0.1)" : "transparent", cursor: "pointer",
          }}>{item}</div>
        ))}
        <div style={{ marginTop: "auto", padding: "16px 16px 0", borderTop: "1px solid #1a2e1c" }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(74,222,128,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#4ade80" }}>JD</div>
          <div style={{ fontSize: 10, color: "#4b5563", marginTop: 6 }}>Admin</div>
        </div>
      </div>
      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 24px", borderBottom: "1px solid #1a2e1c", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0d1b0f" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f0fdf4" }}>Dashboard</div>
            <div style={{ fontSize: 11, color: "#4b5563" }}>April 14, 2026</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ fontSize: 11, padding: "5px 12px", borderRadius: 6, border: "1px solid #1a2e1c", color: "#9ca3af", cursor: "pointer" }}>Export</div>
            <div style={{ fontSize: 11, padding: "5px 12px", borderRadius: 6, background: "#4ade80", color: "#0a1509", cursor: "pointer", fontWeight: 700 }}>+ New IEP</div>
          </div>
        </div>
        <div style={{ flex: 1, padding: 24, background: "#0d1b0f", overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
            {stats.map(s => (
              <div key={s.label} style={{ background: "#111f13", border: "1px solid #1a2e1c", borderRadius: 10, padding: "16px 18px" }}>
                <div style={{ fontSize: 10, color: "#4b5563", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#f0fdf4" }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "#4ade80", marginTop: 4, fontWeight: 600 }}>{s.delta}</div>
              </div>
            ))}
          </div>
          <div style={{ background: "#111f13", border: "1px solid #1a2e1c", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#f0fdf4", marginBottom: 12 }}>Recent Students</div>
            {["Amara Wilson", "Devon Park", "Sofia Chen"].map((name, i) => (
              <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: i < 2 ? "1px solid #1a2e1c" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(74,222,128,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#4ade80" }}>{name[0]}</div>
                  <div style={{ fontSize: 12, color: "#d1d5db" }}>{name}</div>
                </div>
                <div style={{ fontSize: 10, color: "#4ade80", padding: "2px 8px", borderRadius: 12, background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.2)" }}>Active</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
