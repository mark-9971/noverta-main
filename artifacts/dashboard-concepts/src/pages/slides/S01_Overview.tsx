export default function S01_Overview() {
  return (
    <div className="w-screen h-screen overflow-hidden relative flex flex-col"
      style={{ background: "linear-gradient(160deg, #06101e 0%, #0b1a2f 100%)" }}>

      {/* Background accent — top-right glow */}
      <div className="absolute top-0 right-0 w-[40vw] h-[40vh] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(78,155,245,0.06) 0%, transparent 70%)" }} />

      {/* Header */}
      <div className="px-[5vw] pt-[5vh] pb-[2vh] shrink-0">
        <div className="text-[1.3vw] font-body font-medium text-primary mb-[0.5vh]" style={{ letterSpacing: "0.08em" }}>
          DESIGN EXPLORATION — APRIL 2026
        </div>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-[3.8vw] font-display font-bold text-text tracking-tight leading-none">
              Admin Dashboard
            </h1>
            <p className="text-[1.8vw] font-display text-muted mt-[0.5vh]">
              5 design directions — pick one before implementation begins
            </p>
          </div>
          <div className="text-[1.1vw] font-body text-muted text-right pb-[0.5vh]">
            vs. current PilotAdminHome
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-[5vw] h-px shrink-0" style={{ background: "rgba(78,155,245,0.15)" }} />

      {/* 5 Thumbnail cards */}
      <div className="flex gap-[1.2vw] px-[5vw] pt-[2.5vh] pb-[3vh] flex-1 min-h-0">

        {/* Concept 1 — Command Center */}
        <div className="flex-1 flex flex-col rounded-xl overflow-hidden"
          style={{ border: "1px solid rgba(99,102,241,0.3)", background: "rgba(12,25,41,0.8)" }}>
          <div className="shrink-0 px-[5%] pt-[5%] pb-[3%]">
            <div className="text-[0.95vw] font-body font-semibold mb-[0.5%]"
              style={{ color: "#818cf8" }}>C1 — Command Center</div>
            <div className="text-[0.8vw] font-body text-muted leading-snug">Dark · Dense · Power-user</div>
          </div>
          {/* Mini preview */}
          <div className="flex-1 mx-[5%] mb-[5%] rounded-lg overflow-hidden min-h-0"
            style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
            {/* KPI bar */}
            <div className="flex gap-[1%] p-[2%]" style={{ background: "#0f1829" }}>
              <div className="flex-1 rounded" style={{ background: "#1a2535", padding: "3% 4%" }}>
                <div style={{ color: "#4a6e94", fontSize: "0.55vw" }}>Compliance</div>
                <div style={{ color: "#4e9bf5", fontSize: "1.1vw", fontWeight: 700 }}>84%</div>
              </div>
              <div className="flex-1 rounded" style={{ background: "#1a2535", padding: "3% 4%" }}>
                <div style={{ color: "#4a6e94", fontSize: "0.55vw" }}>Cost</div>
                <div style={{ color: "#f59e0b", fontSize: "1.1vw", fontWeight: 700 }}>$142K</div>
              </div>
              <div className="flex-1 rounded" style={{ background: "#1a2535", padding: "3% 4%" }}>
                <div style={{ color: "#4a6e94", fontSize: "0.55vw" }}>High Risk</div>
                <div style={{ color: "#ef4444", fontSize: "1.1vw", fontWeight: 700 }}>23</div>
              </div>
              <div className="flex-1 rounded" style={{ background: "#1a2535", padding: "3% 4%" }}>
                <div style={{ color: "#4a6e94", fontSize: "0.55vw" }}>Urgent</div>
                <div style={{ color: "#fbbf24", fontSize: "1.1vw", fontWeight: 700 }}>7</div>
              </div>
            </div>
            {/* 2×2 grid */}
            <div className="grid grid-cols-2 gap-[1%] p-[2%]" style={{ background: "#0f1829" }}>
              <div className="rounded" style={{ background: "#1a2535", padding: "4% 5%", minHeight: "6vh" }}>
                <div style={{ color: "#7a9ab8", fontSize: "0.55vw", marginBottom: "6%" }}>Compliance</div>
                <div style={{ display: "flex", alignItems: "center", gap: "8%" }}>
                  <svg viewBox="0 0 36 36" style={{ width: "2.2vw", height: "2.2vw", flexShrink: 0 }}>
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#1e3a5f" strokeWidth="4" />
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#4e9bf5" strokeWidth="4"
                      strokeDasharray="73.9 87.96" strokeLinecap="round" transform="rotate(-90 18 18)" />
                  </svg>
                  <div style={{ color: "#4e9bf5", fontSize: "1.1vw", fontWeight: 700 }}>84%</div>
                </div>
              </div>
              <div className="rounded" style={{ background: "#1a2535", padding: "4% 5%", minHeight: "6vh" }}>
                <div style={{ color: "#7a9ab8", fontSize: "0.55vw", marginBottom: "6%" }}>Financial Risk</div>
                <div style={{ color: "#f59e0b", fontSize: "1vw", fontWeight: 700 }}>$142K</div>
                <div className="flex items-end gap-[3%] mt-[6%]" style={{ height: "2.5vh" }}>
                  <div style={{ flex: 1, background: "#2d4a6e", borderRadius: "1px 1px 0 0", height: "60%" }} />
                  <div style={{ flex: 1, background: "#2d4a6e", borderRadius: "1px 1px 0 0", height: "80%" }} />
                  <div style={{ flex: 1, background: "#2d4a6e", borderRadius: "1px 1px 0 0", height: "50%" }} />
                  <div style={{ flex: 1, background: "#f59e0b", borderRadius: "1px 1px 0 0", height: "100%" }} />
                </div>
              </div>
              <div className="rounded" style={{ background: "#1a2535", padding: "4% 5%", minHeight: "6vh" }}>
                <div style={{ color: "#7a9ab8", fontSize: "0.55vw", marginBottom: "4%" }}>Students</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", background: "#1e3a5f", borderRadius: "2px", padding: "3% 4%" }}>
                    <div style={{ color: "#dce8f7", fontSize: "0.6vw" }}>Marcus T.</div>
                    <div style={{ color: "#ef4444", fontSize: "0.55vw" }}>Critical</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", background: "#1e2e4a", borderRadius: "2px", padding: "3% 4%" }}>
                    <div style={{ color: "#dce8f7", fontSize: "0.6vw" }}>Lily K.</div>
                    <div style={{ color: "#f59e0b", fontSize: "0.55vw" }}>At Risk</div>
                  </div>
                </div>
              </div>
              <div className="rounded" style={{ background: "#1a2535", padding: "4% 5%", minHeight: "6vh" }}>
                <div style={{ color: "#7a9ab8", fontSize: "0.55vw", marginBottom: "4%" }}>Operations</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div style={{ color: "#7a9ab8", fontSize: "0.55vw" }}>Sessions Today</div>
                    <div style={{ color: "#34d399", fontSize: "0.65vw", fontWeight: 700 }}>42</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div style={{ color: "#7a9ab8", fontSize: "0.55vw" }}>Missed This Week</div>
                    <div style={{ color: "#ef4444", fontSize: "0.65vw", fontWeight: 700 }}>8</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div style={{ color: "#7a9ab8", fontSize: "0.55vw" }}>Open Alerts</div>
                    <div style={{ color: "#fbbf24", fontSize: "0.65vw", fontWeight: 700 }}>7</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Concept 2 — Focus Mode */}
        <div className="flex-1 flex flex-col rounded-xl overflow-hidden"
          style={{ border: "1px solid rgba(52,211,153,0.3)", background: "rgba(12,25,41,0.8)" }}>
          <div className="shrink-0 px-[5%] pt-[5%] pb-[3%]">
            <div className="text-[0.95vw] font-body font-semibold mb-[0.5%]"
              style={{ color: "#34d399" }}>C2 — Focus Mode</div>
            <div className="text-[0.8vw] font-body text-muted leading-snug">Minimal · Guided · Daily driver</div>
          </div>
          <div className="flex-1 mx-[5%] mb-[5%] rounded-lg overflow-hidden min-h-0"
            style={{ background: "#fafafa", border: "1px solid #e5e7eb" }}>
            <div style={{ background: "#ffffff", borderBottom: "1px solid #f3f4f6", padding: "3% 5%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: "#374151", fontSize: "0.65vw", fontWeight: 600 }}>Trellis</div>
              <div style={{ color: "#9ca3af", fontSize: "0.55vw" }}>Mon Apr 14</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "6% 8%", gap: "4%" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ color: "#9ca3af", fontSize: "0.6vw" }}>Good morning, Jennifer</div>
                <div style={{ color: "#111827", fontSize: "3.5vw", fontWeight: 700, lineHeight: 1, marginTop: "1%" }}>84%</div>
                <div style={{ color: "#6b7280", fontSize: "0.6vw", marginTop: "1%" }}>District Compliance Rate</div>
              </div>
              <div style={{ width: "50%", height: "1px", background: "#e5e7eb" }} />
              <div style={{ width: "100%", color: "#374151", fontSize: "0.6vw", fontWeight: 600 }}>3 actions need your attention</div>
              <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "3%" }}>
                <div style={{ background: "#ffffff", border: "1px solid #fecaca", borderLeft: "2px solid #ef4444", borderRadius: "4px", padding: "3% 4%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div style={{ color: "#111827", fontSize: "0.6vw", fontWeight: 500 }}>Marcus T. — 41 min behind</div>
                    <div style={{ color: "#ef4444", fontSize: "0.5vw", fontWeight: 600 }}>Urgent</div>
                  </div>
                  <div style={{ color: "#9ca3af", fontSize: "0.5vw", marginTop: "1%" }}>Speech-Language · Lincoln Elementary</div>
                </div>
                <div style={{ background: "#ffffff", border: "1px solid #fde68a", borderLeft: "2px solid #f59e0b", borderRadius: "4px", padding: "3% 4%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div style={{ color: "#111827", fontSize: "0.6vw", fontWeight: 500 }}>Lily K. IEP — Apr 18</div>
                    <div style={{ color: "#d97706", fontSize: "0.5vw", fontWeight: 600 }}>Due Soon</div>
                  </div>
                  <div style={{ color: "#9ca3af", fontSize: "0.5vw", marginTop: "1%" }}>Annual review · 4 days away</div>
                </div>
                <div style={{ background: "#ffffff", border: "1px solid #d1fae5", borderLeft: "2px solid #10b981", borderRadius: "4px", padding: "3% 4%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div style={{ color: "#111827", fontSize: "0.6vw", fontWeight: 500 }}>OT contract — Wilson Agency</div>
                    <div style={{ color: "#059669", fontSize: "0.5vw", fontWeight: 600 }}>This Month</div>
                  </div>
                  <div style={{ color: "#9ca3af", fontSize: "0.5vw", marginTop: "1%" }}>Expires in 30 days</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Concept 3 — Wedge Hub */}
        <div className="flex-1 flex flex-col rounded-xl overflow-hidden"
          style={{ border: "1px solid rgba(59,130,246,0.3)", background: "rgba(12,25,41,0.8)" }}>
          <div className="shrink-0 px-[5%] pt-[5%] pb-[3%]">
            <div className="text-[0.95vw] font-body font-semibold mb-[0.5%]"
              style={{ color: "#60a5fa" }}>C3 — Wedge Hub</div>
            <div className="text-[0.8vw] font-body text-muted leading-snug">Tabbed · Pillar-based · Multi-role</div>
          </div>
          <div className="flex-1 mx-[5%] mb-[5%] rounded-lg overflow-hidden min-h-0"
            style={{ background: "#f5f7fa", border: "1px solid #e5e7eb" }}>
            <div style={{ background: "#ffffff", borderBottom: "1px solid #e5e7eb", display: "flex" }}>
              <div style={{ padding: "2.5% 4%", borderBottom: "2px solid #3b82f6", color: "#1e40af", fontSize: "0.6vw", fontWeight: 600, display: "flex", alignItems: "center", gap: "4%" }}>
                <div style={{ width: "0.35vw", height: "0.35vw", borderRadius: "50%", background: "#ef4444" }} />
                Compliance
              </div>
              <div style={{ padding: "2.5% 4%", borderBottom: "2px solid transparent", color: "#9ca3af", fontSize: "0.6vw", display: "flex", alignItems: "center", gap: "4%" }}>
                <div style={{ width: "0.35vw", height: "0.35vw", borderRadius: "50%", background: "#f59e0b" }} />
                Cost Risk
              </div>
              <div style={{ padding: "2.5% 4%", borderBottom: "2px solid transparent", color: "#9ca3af", fontSize: "0.6vw", display: "flex", alignItems: "center", gap: "4%" }}>
                <div style={{ width: "0.35vw", height: "0.35vw", borderRadius: "50%", background: "#10b981" }} />
                Students
              </div>
              <div style={{ padding: "2.5% 4%", borderBottom: "2px solid transparent", color: "#9ca3af", fontSize: "0.6vw" }}>Ops</div>
              <div style={{ padding: "2.5% 4%", borderBottom: "2px solid transparent", color: "#9ca3af", fontSize: "0.6vw" }}>System</div>
            </div>
            <div style={{ display: "flex", gap: "3%", padding: "3%", flex: 1 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4%", width: "35%" }}>
                <svg viewBox="0 0 100 100" style={{ width: "5vw", height: "5vw" }}>
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="12" />
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#3b82f6" strokeWidth="12"
                    strokeDasharray="211 251.2" strokeLinecap="round" transform="rotate(-90 50 50)" />
                </svg>
                <div style={{ color: "#1e40af", fontSize: "1.3vw", fontWeight: 700, marginTop: "-5%" }}>84%</div>
                <div style={{ color: "#6b7280", fontSize: "0.5vw" }}>District Compliance</div>
                <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "3%" }}>
                  <div style={{ background: "#ffffff", borderRadius: "4px", padding: "4% 5%", display: "flex", justifyContent: "space-between" }}>
                    <div style={{ color: "#6b7280", fontSize: "0.55vw" }}>On Track</div>
                    <div style={{ color: "#10b981", fontSize: "0.65vw", fontWeight: 700 }}>158</div>
                  </div>
                  <div style={{ background: "#ffffff", borderRadius: "4px", padding: "4% 5%", display: "flex", justifyContent: "space-between" }}>
                    <div style={{ color: "#6b7280", fontSize: "0.55vw" }}>At Risk</div>
                    <div style={{ color: "#f59e0b", fontSize: "0.65vw", fontWeight: 700 }}>23</div>
                  </div>
                  <div style={{ background: "#ffffff", borderRadius: "4px", padding: "4% 5%", display: "flex", justifyContent: "space-between" }}>
                    <div style={{ color: "#6b7280", fontSize: "0.55vw" }}>Out of Compliance</div>
                    <div style={{ color: "#ef4444", fontSize: "0.65vw", fontWeight: 700 }}>7</div>
                  </div>
                </div>
              </div>
              <div style={{ flex: 1, background: "#ffffff", borderRadius: "6px", padding: "3%", overflow: "hidden" }}>
                <div style={{ color: "#374151", fontSize: "0.6vw", fontWeight: 600, marginBottom: "3%", paddingBottom: "2%", borderBottom: "1px solid #f3f4f6" }}>At-Risk Students</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "3%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.55vw" }}>
                    <div style={{ color: "#374151" }}>Marcus T.</div>
                    <div style={{ color: "#ef4444", fontWeight: 600 }}>Critical</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.55vw" }}>
                    <div style={{ color: "#374151" }}>Lily K.</div>
                    <div style={{ color: "#f59e0b", fontWeight: 600 }}>At Risk</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.55vw" }}>
                    <div style={{ color: "#374151" }}>James W.</div>
                    <div style={{ color: "#f59e0b", fontWeight: 600 }}>At Risk</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.55vw" }}>
                    <div style={{ color: "#374151" }}>Sophia R.</div>
                    <div style={{ color: "#d97706", fontWeight: 600 }}>Watch</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Concept 4 — Narrative Scroll */}
        <div className="flex-1 flex flex-col rounded-xl overflow-hidden"
          style={{ border: "1px solid rgba(245,158,11,0.3)", background: "rgba(12,25,41,0.8)" }}>
          <div className="shrink-0 px-[5%] pt-[5%] pb-[3%]">
            <div className="text-[0.95vw] font-body font-semibold mb-[0.5%]"
              style={{ color: "#f59e0b" }}>C4 — Narrative Scroll</div>
            <div className="text-[0.8vw] font-body text-muted leading-snug">Story-driven · Full picture · Review</div>
          </div>
          <div className="flex-1 mx-[5%] mb-[5%] rounded-lg overflow-hidden min-h-0"
            style={{ background: "#fdfdfb", border: "1px solid #e8e5df", display: "flex" }}>
            <div style={{ width: "18%", background: "#ffffff", borderRight: "1px solid #e5e7eb", padding: "4% 3%", display: "flex", flexDirection: "column", gap: "6%" }}>
              <div style={{ color: "#1d4ed8", fontSize: "0.55vw", fontWeight: 600 }}>Jump to</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12%" }}>
                  <div style={{ width: "0.35vw", height: "0.35vw", borderRadius: "50%", background: "#3b82f6" }} />
                  <div style={{ color: "#1d4ed8", fontSize: "0.5vw", fontWeight: 500 }}>Health</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12%" }}>
                  <div style={{ width: "0.35vw", height: "0.35vw", borderRadius: "50%", background: "#d1d5db" }} />
                  <div style={{ color: "#9ca3af", fontSize: "0.5vw" }}>Risk</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12%" }}>
                  <div style={{ width: "0.35vw", height: "0.35vw", borderRadius: "50%", background: "#d1d5db" }} />
                  <div style={{ color: "#9ca3af", fontSize: "0.5vw" }}>Students</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12%" }}>
                  <div style={{ width: "0.35vw", height: "0.35vw", borderRadius: "50%", background: "#d1d5db" }} />
                  <div style={{ color: "#9ca3af", fontSize: "0.5vw" }}>Cost</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12%" }}>
                  <div style={{ width: "0.35vw", height: "0.35vw", borderRadius: "50%", background: "#d1d5db" }} />
                  <div style={{ color: "#9ca3af", fontSize: "0.5vw" }}>Actions</div>
                </div>
              </div>
            </div>
            <div style={{ flex: 1, padding: "3%", display: "flex", flexDirection: "column", gap: "3%", overflow: "hidden" }}>
              <div style={{ background: "linear-gradient(135deg, #1e3a5f, #1d4ed8)", borderRadius: "5px", padding: "4%" }}>
                <div style={{ color: "#bfdbfe", fontSize: "0.5vw" }}>District Health — Apr 14</div>
                <div style={{ color: "#ffffff", fontSize: "0.9vw", fontWeight: 700, marginTop: "2%" }}>84% compliance</div>
                <div style={{ color: "#93c5fd", fontSize: "0.5vw", marginTop: "1%" }}>158 students meeting requirements</div>
              </div>
              <div style={{ background: "#ffffff", borderRadius: "5px", padding: "3%", border: "1px solid #f3f4f6" }}>
                <div style={{ color: "#374151", fontSize: "0.55vw", fontWeight: 600, marginBottom: "3%" }}>Risk Breakdown</div>
                <div style={{ display: "flex", gap: "3%" }}>
                  <div style={{ flex: 1, background: "#fef2f2", borderRadius: "3px", padding: "3%", textAlign: "center" }}>
                    <div style={{ color: "#ef4444", fontSize: "0.9vw", fontWeight: 700 }}>7</div>
                    <div style={{ color: "#dc2626", fontSize: "0.45vw" }}>Out</div>
                  </div>
                  <div style={{ flex: 1, background: "#fffbeb", borderRadius: "3px", padding: "3%", textAlign: "center" }}>
                    <div style={{ color: "#f59e0b", fontSize: "0.9vw", fontWeight: 700 }}>23</div>
                    <div style={{ color: "#d97706", fontSize: "0.45vw" }}>Risk</div>
                  </div>
                  <div style={{ flex: 1, background: "#f0fdf4", borderRadius: "3px", padding: "3%", textAlign: "center" }}>
                    <div style={{ color: "#10b981", fontSize: "0.9vw", fontWeight: 700 }}>158</div>
                    <div style={{ color: "#059669", fontSize: "0.45vw" }}>Track</div>
                  </div>
                </div>
              </div>
              <div style={{ background: "#ffffff", borderRadius: "5px", padding: "3%", border: "1px solid #f3f4f6" }}>
                <div style={{ color: "#374151", fontSize: "0.55vw", fontWeight: 600, marginBottom: "3%" }}>Top At-Risk Students</div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2% 3%", background: "#fef2f2", borderRadius: "3px", marginBottom: "2%" }}>
                  <div style={{ color: "#374151", fontSize: "0.5vw" }}>Marcus T. — Speech</div>
                  <div style={{ color: "#ef4444", fontSize: "0.5vw", fontWeight: 600 }}>41 min</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2% 3%", background: "#fffbeb", borderRadius: "3px" }}>
                  <div style={{ color: "#374151", fontSize: "0.5vw" }}>Lily K. — OT</div>
                  <div style={{ color: "#d97706", fontSize: "0.5vw", fontWeight: 600 }}>28 min</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Concept 5 — Kanban */}
        <div className="flex-1 flex flex-col rounded-xl overflow-hidden"
          style={{ border: "1px solid rgba(239,68,68,0.3)", background: "rgba(12,25,41,0.8)" }}>
          <div className="shrink-0 px-[5%] pt-[5%] pb-[3%]">
            <div className="text-[0.95vw] font-body font-semibold mb-[0.5%]"
              style={{ color: "#f87171" }}>C5 — Kanban Board</div>
            <div className="text-[0.8vw] font-body text-muted leading-snug">Action-first · Triage · Ops-focused</div>
          </div>
          <div className="flex-1 mx-[5%] mb-[5%] rounded-lg overflow-hidden min-h-0"
            style={{ background: "#f4f5f7", border: "1px solid #e2e4e9" }}>
            <div style={{ background: "#ffffff", borderBottom: "1px solid #e5e7eb", padding: "2% 4%", display: "flex", alignItems: "center", gap: "4%", fontSize: "0.6vw" }}>
              <div style={{ color: "#374151", fontWeight: 600 }}>Action Board</div>
              <div style={{ color: "#ef4444", fontWeight: 700 }}>7 urgent</div>
              <div style={{ color: "#f59e0b", fontWeight: 700 }}>12 this week</div>
            </div>
            <div style={{ display: "flex", gap: "2%", padding: "3%", height: "calc(100% - 6vh)" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "3%" }}>
                <div style={{ background: "#ef4444", borderRadius: "4px 4px 0 0", padding: "3% 4%", display: "flex", justifyContent: "space-between" }}>
                  <div style={{ color: "#ffffff", fontSize: "0.6vw", fontWeight: 600 }}>Urgent</div>
                  <div style={{ background: "rgba(255,255,255,0.3)", color: "#fff", borderRadius: "99px", padding: "1% 4%", fontSize: "0.55vw", fontWeight: 700 }}>7</div>
                </div>
                <div style={{ background: "#ffffff", borderRadius: "3px", padding: "3% 4%", borderLeft: "2px solid #ef4444" }}>
                  <div style={{ color: "#111827", fontSize: "0.55vw", fontWeight: 500 }}>Marcus T. — 41 min behind</div>
                  <div style={{ color: "#9ca3af", fontSize: "0.45vw", marginTop: "2%" }}>Speech-Language</div>
                </div>
                <div style={{ background: "#ffffff", borderRadius: "3px", padding: "3% 4%", borderLeft: "2px solid #ef4444" }}>
                  <div style={{ color: "#111827", fontSize: "0.55vw", fontWeight: 500 }}>IEP overdue — Emma L.</div>
                  <div style={{ color: "#9ca3af", fontSize: "0.45vw", marginTop: "2%" }}>Annual review</div>
                </div>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "3%" }}>
                <div style={{ background: "#f59e0b", borderRadius: "4px 4px 0 0", padding: "3% 4%", display: "flex", justifyContent: "space-between" }}>
                  <div style={{ color: "#ffffff", fontSize: "0.6vw", fontWeight: 600 }}>This Week</div>
                  <div style={{ background: "rgba(255,255,255,0.3)", color: "#fff", borderRadius: "99px", padding: "1% 4%", fontSize: "0.55vw", fontWeight: 700 }}>12</div>
                </div>
                <div style={{ background: "#ffffff", borderRadius: "3px", padding: "3% 4%", borderLeft: "2px solid #f59e0b" }}>
                  <div style={{ color: "#111827", fontSize: "0.55vw", fontWeight: 500 }}>Lily K. IEP — Apr 18</div>
                  <div style={{ color: "#9ca3af", fontSize: "0.45vw", marginTop: "2%" }}>4 days away</div>
                </div>
                <div style={{ background: "#ffffff", borderRadius: "3px", padding: "3% 4%", borderLeft: "2px solid #f59e0b" }}>
                  <div style={{ color: "#111827", fontSize: "0.55vw", fontWeight: 500 }}>James W. — 19 min</div>
                  <div style={{ color: "#9ca3af", fontSize: "0.45vw", marginTop: "2%" }}>OT — approaching</div>
                </div>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "3%" }}>
                <div style={{ background: "#9ca3af", borderRadius: "4px 4px 0 0", padding: "3% 4%", display: "flex", justifyContent: "space-between" }}>
                  <div style={{ color: "#ffffff", fontSize: "0.6vw", fontWeight: 600 }}>Watch</div>
                  <div style={{ background: "rgba(255,255,255,0.3)", color: "#fff", borderRadius: "99px", padding: "1% 4%", fontSize: "0.55vw", fontWeight: 700 }}>18</div>
                </div>
                <div style={{ background: "#ffffff", borderRadius: "3px", padding: "3% 4%", borderLeft: "2px solid #9ca3af" }}>
                  <div style={{ color: "#111827", fontSize: "0.55vw", fontWeight: 500 }}>Sophia R. — slightly behind</div>
                  <div style={{ color: "#9ca3af", fontSize: "0.45vw", marginTop: "2%" }}>PT — monitor pacing</div>
                </div>
                <div style={{ background: "#ffffff", borderRadius: "3px", padding: "3% 4%", borderLeft: "2px solid #10b981", opacity: 0.7 }}>
                  <div style={{ color: "#374151", fontSize: "0.55vw", fontWeight: 500 }}>Alex M. back on track</div>
                  <div style={{ color: "#9ca3af", fontSize: "0.45vw", marginTop: "2%" }}>Resolved</div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
