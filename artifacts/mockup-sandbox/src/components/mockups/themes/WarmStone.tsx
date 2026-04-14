export function WarmStone() {
  const nav = ["Dashboard", "Students", "IEP Builder", "Compliance", "Reports"];
  const stats = [
    { label: "Active IEPs", value: "248", delta: "+3 this week" },
    { label: "Compliance Rate", value: "94%", delta: "On track" },
    { label: "Due This Month", value: "17", delta: "Meetings" },
  ];
  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Georgia', serif", background: "#faf8f5" }}>
      {/* Sidebar */}
      <div style={{ width: 160, background: "#f5f2ee", borderRight: "1px solid #e8e2da", padding: "24px 0", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ padding: "0 16px 20px", borderBottom: "1px solid #e8e2da", marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#292524", letterSpacing: "0.02em" }}>Trellis</div>
          <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 2, fontStyle: "italic" }}>Built to support.</div>
        </div>
        {nav.map((item, i) => (
          <div key={item} style={{
            margin: "0 8px", padding: "8px 10px", borderRadius: 6, fontSize: 12, fontWeight: i === 0 ? 600 : 400,
            color: i === 0 ? "#15803d" : "#78716c", background: i === 0 ? "#f0fdf4" : "transparent", cursor: "pointer",
          }}>{item}</div>
        ))}
        <div style={{ marginTop: "auto", padding: "16px 16px 0", borderTop: "1px solid #e8e2da" }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#15803d" }}>JD</div>
          <div style={{ fontSize: 10, color: "#a8a29e", marginTop: 6 }}>Admin</div>
        </div>
      </div>
      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 24px", borderBottom: "1px solid #e8e2da", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#faf8f5" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#292524" }}>Dashboard</div>
            <div style={{ fontSize: 11, color: "#a8a29e", fontStyle: "italic" }}>April 14, 2026</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ fontSize: 11, padding: "5px 12px", borderRadius: 6, border: "1px solid #e8e2da", color: "#57534e", cursor: "pointer" }}>Export</div>
            <div style={{ fontSize: 11, padding: "5px 12px", borderRadius: 6, background: "#15803d", color: "#fff", cursor: "pointer", fontWeight: 600 }}>+ New IEP</div>
          </div>
        </div>
        <div style={{ flex: 1, padding: 24, background: "#faf8f5", overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
            {stats.map(s => (
              <div key={s.label} style={{ background: "#fff", border: "1px solid #e8e2da", borderRadius: 10, padding: "16px 18px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                <div style={{ fontSize: 10, color: "#a8a29e", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#292524" }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "#15803d", marginTop: 4, fontWeight: 500 }}>{s.delta}</div>
              </div>
            ))}
          </div>
          <div style={{ background: "#fff", border: "1px solid #e8e2da", borderRadius: 10, padding: "16px 18px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#292524", marginBottom: 12 }}>Recent Students</div>
            {["Amara Wilson", "Devon Park", "Sofia Chen"].map((name, i) => (
              <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: i < 2 ? "1px solid #f5f2ee" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#15803d" }}>{name[0]}</div>
                  <div style={{ fontSize: 12, color: "#57534e" }}>{name}</div>
                </div>
                <div style={{ fontSize: 10, color: "#a8a29e", padding: "2px 8px", borderRadius: 12, background: "#f5f2ee" }}>Active</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
