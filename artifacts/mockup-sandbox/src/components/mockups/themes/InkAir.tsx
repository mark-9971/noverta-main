export function InkAir() {
  const nav = ["Dashboard", "Students", "IEP Builder", "Compliance", "Reports"];
  const stats = [
    { label: "Active IEPs", value: "248", delta: "+3 this week" },
    { label: "Compliance Rate", value: "94%", delta: "On track" },
    { label: "Due This Month", value: "17", delta: "Meetings" },
  ];
  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui, sans-serif", background: "#fff" }}>
      {/* Sidebar */}
      <div style={{ width: 160, background: "#f9fafb", borderRight: "1px solid #e5e7eb", padding: "24px 0", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ padding: "0 16px 20px", borderBottom: "1px solid #e5e7eb", marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", letterSpacing: "-0.01em" }}>Trellis</div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>Built to support.</div>
        </div>
        {nav.map((item, i) => (
          <div key={item} style={{
            margin: "0 8px", padding: "8px 10px", borderRadius: 6, fontSize: 12, fontWeight: i === 0 ? 600 : 400,
            color: i === 0 ? "#059669" : "#6b7280", background: i === 0 ? "#ecfdf5" : "transparent", cursor: "pointer",
          }}>{item}</div>
        ))}
        <div style={{ marginTop: "auto", padding: "16px 16px 0", borderTop: "1px solid #e5e7eb" }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#d1fae5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#059669" }}>JD</div>
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 6 }}>Admin</div>
        </div>
      </div>
      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ padding: "14px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Dashboard</div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>April 14, 2026</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ fontSize: 11, padding: "5px 12px", borderRadius: 6, border: "1px solid #e5e7eb", color: "#374151", cursor: "pointer" }}>Export</div>
            <div style={{ fontSize: 11, padding: "5px 12px", borderRadius: 6, background: "#059669", color: "#fff", cursor: "pointer", fontWeight: 600 }}>+ New IEP</div>
          </div>
        </div>
        {/* Content */}
        <div style={{ flex: 1, padding: 24, background: "#f9fafb", overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
            {stats.map(s => (
              <div key={s.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 18px" }}>
                <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#111827" }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "#059669", marginTop: 4, fontWeight: 500 }}>{s.delta}</div>
              </div>
            ))}
          </div>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", marginBottom: 12 }}>Recent Students</div>
            {["Amara Wilson", "Devon Park", "Sofia Chen"].map((name, i) => (
              <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: i < 2 ? "1px solid #f3f4f6" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#d1fae5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#059669" }}>{name[0]}</div>
                  <div style={{ fontSize: 12, color: "#374151" }}>{name}</div>
                </div>
                <div style={{ fontSize: 10, color: "#9ca3af", padding: "2px 8px", borderRadius: 12, background: "#f3f4f6" }}>Active</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
