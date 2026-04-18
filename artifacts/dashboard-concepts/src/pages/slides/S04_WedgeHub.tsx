export default function S04_WedgeHub() {
  return (
    <div className="w-screen h-screen overflow-hidden relative flex flex-col"
      style={{ background: "linear-gradient(160deg, #06101e 0%, #0b1a2f 100%)" }}>

      {/* Accent: blue center glow */}
      <div className="absolute top-[20vh] left-[25vw] w-[40vw] h-[30vh] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(59,130,246,0.05) 0%, transparent 70%)" }} />

      {/* Header */}
      <div className="relative z-10 flex items-start justify-between px-[4.5vw] pt-[4vh] pb-[2vh] shrink-0">
        <div>
          <div className="flex items-center gap-[1vw] mb-[0.5vh]">
            <div className="text-[0.85vw] font-body text-muted font-medium" style={{ letterSpacing: "0.1em" }}>CONCEPT 3 OF 5</div>
            <div className="h-px w-[6vw]" style={{ background: "rgba(59,130,246,0.3)" }} />
          </div>
          <h1 className="text-[3.8vw] font-display font-bold tracking-tight leading-none"
            style={{ color: "#bfdbfe" }}>Wedge Hub</h1>
          <p className="text-[1.5vw] font-body mt-[0.8vh]" style={{ color: "#5d7fa8" }}>
            Tabbed pillars · Status dots · Role-based bookmarking
          </p>
        </div>
        <div className="text-[0.9vw] font-body text-right mt-[0.5vh]" style={{ color: "#3d5a7a" }}>
          Data: 188 students · $142K exposure
        </div>
      </div>

      {/* Main two-panel content */}
      <div className="relative z-10 flex gap-[2vw] px-[4.5vw] pb-[4vh] flex-1 min-h-0">

        {/* Left: browser mockup */}
        <div className="flex-1 flex flex-col rounded-xl overflow-hidden min-h-0"
          style={{ border: "1px solid rgba(59,130,246,0.15)", boxShadow: "0 0 40px rgba(59,130,246,0.05)" }}>
          {/* Browser chrome */}
          <div className="flex items-center gap-[0.6vw] px-[1vw] py-[1vh] shrink-0"
            style={{ background: "#1a2030", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <div className="flex gap-[0.4vw]">
              <div className="rounded-full" style={{ width: "0.65vw", height: "0.65vw", background: "#ff5f56" }} />
              <div className="rounded-full" style={{ width: "0.65vw", height: "0.65vw", background: "#febc2e" }} />
              <div className="rounded-full" style={{ width: "0.65vw", height: "0.65vw", background: "#28c840" }} />
            </div>
            <div className="flex-1 rounded text-[0.75vw] px-[1vw] py-[0.4vh]"
              style={{ background: "#0d1421", color: "#3d5a7a" }}>
              trellis.app/dashboard
            </div>
          </div>
          {/* Dashboard content: Wedge Hub */}
          <div className="flex-1 min-h-0 flex flex-col" style={{ background: "#f5f7fa", overflow: "hidden" }}>
            {/* Top nav */}
            <div style={{ background: "#ffffff", borderBottom: "1px solid #e5e7eb", padding: "0 3%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex" }}>
                {/* Active tab */}
                <div style={{ padding: "2.5% 3%", borderBottom: "2.5px solid #3b82f6", color: "#1e40af", fontSize: "0.8vw", fontWeight: 600, display: "flex", alignItems: "center", gap: "4%" }}>
                  <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: "#ef4444" }} />
                  Compliance
                </div>
                <div style={{ padding: "2.5% 3%", borderBottom: "2px solid transparent", color: "#9ca3af", fontSize: "0.8vw", display: "flex", alignItems: "center", gap: "4%" }}>
                  <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: "#f59e0b" }} />
                  Cost Risk
                </div>
                <div style={{ padding: "2.5% 3%", borderBottom: "2px solid transparent", color: "#9ca3af", fontSize: "0.8vw", display: "flex", alignItems: "center", gap: "4%" }}>
                  <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: "#10b981" }} />
                  Students
                </div>
                <div style={{ padding: "2.5% 3%", borderBottom: "2px solid transparent", color: "#9ca3af", fontSize: "0.8vw", display: "flex", alignItems: "center", gap: "4%" }}>
                  <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: "#10b981" }} />
                  Operations
                </div>
                <div style={{ padding: "2.5% 3%", borderBottom: "2px solid transparent", color: "#9ca3af", fontSize: "0.8vw", display: "flex", alignItems: "center", gap: "4%" }}>
                  <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: "#10b981" }} />
                  System
                </div>
              </div>
              <div style={{ paddingRight: "2%", color: "#9ca3af", fontSize: "0.7vw" }}>Compliance tab active</div>
            </div>
            {/* Tab content */}
            <div style={{ flex: 1, display: "flex", gap: "1.5%", padding: "2%", overflow: "hidden" }}>
              {/* Left column: ring + stats */}
              <div style={{ width: "30%", display: "flex", flexDirection: "column", gap: "2%" }}>
                {/* Ring */}
                <div style={{ background: "#ffffff", borderRadius: "8px", padding: "5% 6%", display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <svg viewBox="0 0 100 100" style={{ width: "8vw", height: "8vw" }}>
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="12" />
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#3b82f6" strokeWidth="12"
                      strokeDasharray="211 251.2" strokeLinecap="round" transform="rotate(-90 50 50)" />
                    <text x="50" y="54" textAnchor="middle" fill="#1e40af" fontSize="18" fontWeight="800">84%</text>
                  </svg>
                  <div style={{ color: "#6b7280", fontSize: "0.7vw", marginTop: "2%", textAlign: "center" }}>District Compliance Rate</div>
                </div>
                {/* 3 stat tiles */}
                <div style={{ background: "#ffffff", borderRadius: "6px", padding: "4% 5%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ color: "#6b7280", fontSize: "0.7vw" }}>On Track</div>
                  <div style={{ color: "#10b981", fontSize: "1.1vw", fontWeight: 700 }}>158</div>
                </div>
                <div style={{ background: "#ffffff", borderRadius: "6px", padding: "4% 5%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ color: "#6b7280", fontSize: "0.7vw" }}>At Risk</div>
                  <div style={{ color: "#f59e0b", fontSize: "1.1vw", fontWeight: 700 }}>23</div>
                </div>
                <div style={{ background: "#ffffff", borderRadius: "6px", padding: "4% 5%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ color: "#6b7280", fontSize: "0.7vw" }}>Out of Compliance</div>
                  <div style={{ color: "#ef4444", fontSize: "1.1vw", fontWeight: 700 }}>7</div>
                </div>
                <div style={{ background: "#ffffff", borderRadius: "6px", padding: "4% 5%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ color: "#6b7280", fontSize: "0.7vw" }}>Cost Exposure</div>
                  <div style={{ color: "#f59e0b", fontSize: "1.1vw", fontWeight: 700 }}>$142K</div>
                </div>
              </div>
              {/* Right column: at-risk table */}
              <div style={{ flex: 1, background: "#ffffff", borderRadius: "8px", padding: "3% 4%", overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3%", paddingBottom: "2%", borderBottom: "1px solid #f3f4f6" }}>
                  <div style={{ color: "#111827", fontSize: "0.85vw", fontWeight: 600 }}>At-Risk Students — Compliance View</div>
                  <div style={{ color: "#3b82f6", fontSize: "0.7vw" }}>23 students</div>
                </div>
                {/* Table header */}
                <div style={{ display: "flex", gap: "2%", paddingBottom: "1.5%", borderBottom: "1px solid #e5e7eb", color: "#9ca3af", fontSize: "0.7vw" }}>
                  <div style={{ flex: 2 }}>Student</div>
                  <div style={{ flex: 2 }}>School</div>
                  <div style={{ flex: 1.5 }}>Service</div>
                  <div style={{ flex: 1.5 }}>Shortfall</div>
                  <div style={{ flex: 1 }}>Status</div>
                </div>
                {/* Rows */}
                <div style={{ display: "flex", gap: "2%", padding: "1.5% 0", borderBottom: "1px solid #f9fafb", fontSize: "0.75vw", alignItems: "center" }}>
                  <div style={{ flex: 2, color: "#111827", fontWeight: 500 }}>Marcus T.</div>
                  <div style={{ flex: 2, color: "#6b7280" }}>Lincoln Elementary</div>
                  <div style={{ flex: 1.5, color: "#6b7280" }}>Speech-Language</div>
                  <div style={{ flex: 1.5, color: "#374151" }}>41 min</div>
                  <div style={{ flex: 1, color: "#ef4444", fontWeight: 600 }}>Critical</div>
                </div>
                <div style={{ display: "flex", gap: "2%", padding: "1.5% 0", borderBottom: "1px solid #f9fafb", fontSize: "0.75vw", alignItems: "center" }}>
                  <div style={{ flex: 2, color: "#111827", fontWeight: 500 }}>Lily K.</div>
                  <div style={{ flex: 2, color: "#6b7280" }}>Washington MS</div>
                  <div style={{ flex: 1.5, color: "#6b7280" }}>OT</div>
                  <div style={{ flex: 1.5, color: "#374151" }}>28 min</div>
                  <div style={{ flex: 1, color: "#f59e0b", fontWeight: 600 }}>At Risk</div>
                </div>
                <div style={{ display: "flex", gap: "2%", padding: "1.5% 0", borderBottom: "1px solid #f9fafb", fontSize: "0.75vw", alignItems: "center" }}>
                  <div style={{ flex: 2, color: "#111827", fontWeight: 500 }}>James W.</div>
                  <div style={{ flex: 2, color: "#6b7280" }}>Ridge Elementary</div>
                  <div style={{ flex: 1.5, color: "#6b7280" }}>Speech-Language</div>
                  <div style={{ flex: 1.5, color: "#374151" }}>19 min</div>
                  <div style={{ flex: 1, color: "#f59e0b", fontWeight: 600 }}>At Risk</div>
                </div>
                <div style={{ display: "flex", gap: "2%", padding: "1.5% 0", borderBottom: "1px solid #f9fafb", fontSize: "0.75vw", alignItems: "center" }}>
                  <div style={{ flex: 2, color: "#111827", fontWeight: 500 }}>Sophia R.</div>
                  <div style={{ flex: 2, color: "#6b7280" }}>Maple Street</div>
                  <div style={{ flex: 1.5, color: "#6b7280" }}>PT</div>
                  <div style={{ flex: 1.5, color: "#374151" }}>12 min</div>
                  <div style={{ flex: 1, color: "#d97706", fontWeight: 600 }}>Watch</div>
                </div>
                <div style={{ display: "flex", gap: "2%", padding: "1.5% 0", borderBottom: "1px solid #f9fafb", fontSize: "0.75vw", alignItems: "center" }}>
                  <div style={{ flex: 2, color: "#111827", fontWeight: 500 }}>Noah P.</div>
                  <div style={{ flex: 2, color: "#6b7280" }}>Lincoln Elementary</div>
                  <div style={{ flex: 1.5, color: "#6b7280" }}>Counseling</div>
                  <div style={{ flex: 1.5, color: "#374151" }}>9 min</div>
                  <div style={{ flex: 1, color: "#d97706", fontWeight: 600 }}>Watch</div>
                </div>
                <div style={{ marginTop: "2%", padding: "2% 3%", background: "#f9fafb", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ color: "#6b7280", fontSize: "0.7vw" }}>Showing 5 of 23 at-risk students</div>
                  <div style={{ color: "#3b82f6", fontSize: "0.7vw", fontWeight: 500 }}>View all in Students tab</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: argument panel */}
        <div className="flex flex-col gap-[1.5vh] shrink-0" style={{ width: "28vw" }}>
          <div className="flex-1 rounded-xl flex flex-col"
            style={{ background: "rgba(5, 40, 25, 0.5)", border: "1px solid rgba(52,211,153,0.2)", padding: "2.5vh 1.5vw" }}>
            <div className="text-[1.3vw] font-display font-bold mb-[1.5vh]" style={{ color: "#34d399" }}>
              Why this works
            </div>
            <div className="flex flex-col gap-[1.2vh] flex-1">
              <div className="text-[1.15vw] font-body leading-snug" style={{ color: "#a8d5c2" }}>
                Status dots expose cross-pillar issues without requiring attention to every tab
              </div>
              <div className="text-[1.15vw] font-body leading-snug" style={{ color: "#a8d5c2" }}>
                Matches the five-wedge mental model already embedded in Trellis
              </div>
              <div className="text-[1.15vw] font-body leading-snug" style={{ color: "#a8d5c2" }}>
                Each stakeholder bookmarks their pillar — finance, compliance, or ops
              </div>
            </div>
          </div>
          <div className="flex-1 rounded-xl flex flex-col"
            style={{ background: "rgba(40, 20, 5, 0.5)", border: "1px solid rgba(245,158,11,0.2)", padding: "2.5vh 1.5vw" }}>
            <div className="text-[1.3vw] font-display font-bold mb-[1.5vh]" style={{ color: "#f59e0b" }}>
              Why it may not
            </div>
            <div className="flex flex-col gap-[1.2vh] flex-1">
              <div className="text-[1.15vw] font-body leading-snug" style={{ color: "#d4b06a" }}>
                Cross-pillar alerts may be missed if an admin stays in one tab too long
              </div>
              <div className="text-[1.15vw] font-body leading-snug" style={{ color: "#d4b06a" }}>
                Requires more clicks to get a full-district picture in one view
              </div>
              <div className="text-[1.15vw] font-body leading-snug" style={{ color: "#d4b06a" }}>
                Five mini-dashboards increases design and maintenance complexity
              </div>
            </div>
          </div>
          <div className="rounded-xl shrink-0"
            style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", padding: "1.5vh 1.5vw" }}>
            <div className="text-[0.9vw] font-body font-semibold mb-[0.4vh]" style={{ color: "#60a5fa" }}>BEST FOR</div>
            <div className="text-[1.15vw] font-body" style={{ color: "#bfdbfe" }}>
              Multi-stakeholder teams where compliance, finance, and ops have distinct owners
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
