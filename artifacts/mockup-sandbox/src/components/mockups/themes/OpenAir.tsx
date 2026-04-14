export function OpenAir() {
  const nav = ["Dashboard", "Students", "IEP Builder", "Compliance", "Reports"];
  const stats = [
    { label: "Active IEPs", value: "248", delta: "+3 this week", color: "#10b981" },
    { label: "Compliance Rate", value: "94%", delta: "On track", color: "#10b981" },
    { label: "Due This Month", value: "17", delta: "Meetings", color: "#6b7280" },
  ];
  const students = [
    { name: "Amara Wilson", grade: "Grade 4", status: "On Track", dot: "#10b981" },
    { name: "Devon Park", grade: "Grade 7", status: "At Risk", dot: "#f59e0b" },
    { name: "Sofia Chen", grade: "Grade 2", status: "On Track", dot: "#10b981" },
  ];

  return (
    <div style={{
      display: "flex", height: "100vh",
      fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
      background: "#ffffff",
      color: "#111827",
    }}>
      {/* Sidebar — no background, just space */}
      <div style={{
        width: 148, flexShrink: 0,
        padding: "28px 0",
        display: "flex", flexDirection: "column", gap: 0,
      }}>
        {/* Logo */}
        <div style={{ padding: "0 20px 28px" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#111827", letterSpacing: "-0.02em" }}>Trellis</div>
          <div style={{ fontSize: 9.5, color: "#d1d5db", marginTop: 2, letterSpacing: "0.02em" }}>Built to support.</div>
        </div>

        {/* Nav */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {nav.map((item, i) => (
            <div key={item} style={{
              padding: "7px 20px",
              fontSize: 11.5,
              fontWeight: i === 0 ? 600 : 400,
              color: i === 0 ? "#111827" : "#9ca3af",
              letterSpacing: i === 0 ? "-0.01em" : "0",
              cursor: "pointer",
              position: "relative",
            }}>
              {i === 0 && (
                <div style={{
                  position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
                  width: 2, height: 14, background: "#10b981", borderRadius: 1,
                }} />
              )}
              {item}
            </div>
          ))}
        </div>

        {/* Avatar at bottom */}
        <div style={{ marginTop: "auto", padding: "0 20px" }}>
          <div style={{
            width: 26, height: 26, borderRadius: "50%",
            background: "#ecfdf5",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, fontWeight: 700, color: "#10b981",
          }}>JD</div>
          <div style={{ fontSize: 9, color: "#d1d5db", marginTop: 5 }}>Admin</div>
        </div>
      </div>

      {/* Thin divider line */}
      <div style={{ width: 1, background: "#f3f4f6", flexShrink: 0 }} />

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header — no border, just breathing room */}
        <div style={{
          padding: "24px 32px 20px",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 11, color: "#d1d5db", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>April 14, 2026</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#111827", letterSpacing: "-0.03em", lineHeight: 1 }}>Dashboard</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 4 }}>
            <div style={{ fontSize: 10.5, color: "#9ca3af", cursor: "pointer", letterSpacing: "0.01em" }}>Export</div>
            <div style={{
              fontSize: 10.5, padding: "6px 14px", borderRadius: 6,
              background: "#111827", color: "#fff", cursor: "pointer",
              fontWeight: 600, letterSpacing: "-0.01em",
            }}>+ New IEP</div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: "0 32px 24px", overflowY: "auto" }}>

          {/* Stats — no cards, just floating numbers */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0, marginBottom: 40 }}>
            {stats.map((s, i) => (
              <div key={s.label} style={{
                paddingRight: 24,
                borderRight: i < 2 ? "1px solid #f3f4f6" : "none",
                paddingLeft: i > 0 ? 24 : 0,
              }}>
                <div style={{ fontSize: 9.5, color: "#d1d5db", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{s.label}</div>
                <div style={{ fontSize: 34, fontWeight: 800, color: "#111827", letterSpacing: "-0.04em", lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 10, color: s.color, marginTop: 6, fontWeight: 500 }}>{s.delta}</div>
              </div>
            ))}
          </div>

          {/* Section header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: "#111827", letterSpacing: "-0.01em" }}>Recent Students</div>
            <div style={{ fontSize: 10, color: "#9ca3af", cursor: "pointer" }}>View all →</div>
          </div>

          {/* Student list — no card, just rows */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {students.map((s, i) => (
              <div key={s.name} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 0",
                borderBottom: i < students.length - 1 ? "1px solid #f9fafb" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: s.dot, flexShrink: 0,
                  }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#111827", letterSpacing: "-0.01em" }}>{s.name}</div>
                    <div style={{ fontSize: 10, color: "#d1d5db", marginTop: 1 }}>{s.grade}</div>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: "#9ca3af" }}>{s.status}</div>
              </div>
            ))}
          </div>

          {/* Compliance block — floats as inline data, no card */}
          <div style={{ marginTop: 32 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: "#111827", marginBottom: 14, letterSpacing: "-0.01em" }}>Compliance Overview</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "IEP Annual Reviews", pct: 88 },
                { label: "Progress Monitoring", pct: 95 },
                { label: "Transition Plans", pct: 72 },
              ].map(item => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 10, color: "#9ca3af", width: 130, flexShrink: 0 }}>{item.label}</div>
                  <div style={{ flex: 1, height: 2, background: "#f3f4f6", borderRadius: 1 }}>
                    <div style={{ height: "100%", width: `${item.pct}%`, background: item.pct >= 90 ? "#10b981" : item.pct >= 80 ? "#f59e0b" : "#ef4444", borderRadius: 1 }} />
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#111827", width: 28, textAlign: "right" }}>{item.pct}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
