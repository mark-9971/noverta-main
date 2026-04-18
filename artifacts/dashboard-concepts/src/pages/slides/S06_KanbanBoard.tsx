export default function S06_KanbanBoard() {
  return (
    <div className="w-screen h-screen overflow-hidden relative flex flex-col"
      style={{ background: "linear-gradient(160deg, #06101e 0%, #0b1a2f 100%)" }}>

      {/* Accent: red top-right glow */}
      <div className="absolute top-0 right-0 w-[25vw] h-[25vh] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(239,68,68,0.07) 0%, transparent 70%)" }} />

      {/* Header */}
      <div className="relative z-10 flex items-start justify-between px-[4.5vw] pt-[4vh] pb-[2vh] shrink-0">
        <div>
          <div className="flex items-center gap-[1vw] mb-[0.5vh]">
            <div className="text-[0.85vw] font-body text-muted font-medium" style={{ letterSpacing: "0.1em" }}>CONCEPT 5 OF 5</div>
            <div className="h-px w-[6vw]" style={{ background: "rgba(239,68,68,0.3)" }} />
          </div>
          <h1 className="text-[3.8vw] font-display font-bold tracking-tight leading-none"
            style={{ color: "#fecaca" }}>Kanban Board</h1>
          <p className="text-[1.5vw] font-body mt-[0.8vh]" style={{ color: "#5d7fa8" }}>
            Action-first · Swimlane triage · Ops-focused
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
          style={{ border: "1px solid rgba(239,68,68,0.15)", boxShadow: "0 0 40px rgba(239,68,68,0.05)" }}>
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
          {/* Dashboard content: Kanban */}
          <div className="flex-1 min-h-0 flex flex-col" style={{ background: "#f4f5f7", overflow: "hidden" }}>
            {/* Top bar */}
            <div style={{ background: "#ffffff", borderBottom: "1px solid #e5e7eb", padding: "1.5% 3%", display: "flex", alignItems: "center", gap: "3%", flexShrink: 0 }}>
              <div style={{ color: "#111827", fontSize: "0.85vw", fontWeight: 700 }}>Action Board</div>
              <div style={{ width: "1px", height: "2.5vh", background: "#e5e7eb" }} />
              <div style={{ display: "flex", gap: "3%", fontSize: "0.75vw" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "1.5%" }}>
                  <div style={{ color: "#ef4444", fontWeight: 700 }}>7</div>
                  <div style={{ color: "#6b7280" }}>urgent</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "1.5%" }}>
                  <div style={{ color: "#f59e0b", fontWeight: 700 }}>12</div>
                  <div style={{ color: "#6b7280" }}>this week</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "1.5%" }}>
                  <div style={{ color: "#6b7280", fontWeight: 700 }}>18</div>
                  <div style={{ color: "#6b7280" }}>watching</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "1.5%" }}>
                  <div style={{ color: "#10b981", fontWeight: 700 }}>42</div>
                  <div style={{ color: "#6b7280" }}>resolved</div>
                </div>
              </div>
              <div style={{ marginLeft: "auto", color: "#9ca3af", fontSize: "0.7vw" }}>Week of Apr 14</div>
            </div>
            {/* Kanban columns */}
            <div style={{ flex: 1, display: "flex", gap: "1.5%", padding: "2%", overflow: "hidden" }}>
              {/* Urgent */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ background: "#ef4444", borderRadius: "6px 6px 0 0", padding: "2.5% 3.5%", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                  <div style={{ color: "#ffffff", fontSize: "0.8vw", fontWeight: 700 }}>Urgent</div>
                  <div style={{ background: "rgba(255,255,255,0.25)", color: "#fff", borderRadius: "99px", padding: "0.5% 4%", fontSize: "0.75vw", fontWeight: 800 }}>7</div>
                </div>
                <div style={{ flex: 1, background: "#fef2f2", borderRadius: "0 0 6px 6px", padding: "2.5%", display: "flex", flexDirection: "column", gap: "2%", overflow: "hidden" }}>
                  <div style={{ background: "#ffffff", borderRadius: "5px", padding: "3% 4%", borderLeft: "3px solid #ef4444" }}>
                    <div style={{ color: "#111827", fontSize: "0.75vw", fontWeight: 600 }}>Marcus T. — 41 min behind</div>
                    <div style={{ color: "#6b7280", fontSize: "0.65vw", marginTop: "1.5%" }}>Speech-Language · Lincoln Elem.</div>
                  </div>
                  <div style={{ background: "#ffffff", borderRadius: "5px", padding: "3% 4%", borderLeft: "3px solid #ef4444" }}>
                    <div style={{ color: "#111827", fontSize: "0.75vw", fontWeight: 600 }}>IEP overdue — Emma L.</div>
                    <div style={{ color: "#6b7280", fontSize: "0.65vw", marginTop: "1.5%" }}>Annual review · due Mar 28</div>
                  </div>
                  <div style={{ background: "#ffffff", borderRadius: "5px", padding: "3% 4%", borderLeft: "3px solid #ef4444" }}>
                    <div style={{ color: "#111827", fontSize: "0.75vw", fontWeight: 600 }}>Agency contract expiring</div>
                    <div style={{ color: "#6b7280", fontSize: "0.65vw", marginTop: "1.5%" }}>Wilson OT Agency · 7 days</div>
                  </div>
                </div>
              </div>
              {/* This Week */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ background: "#f59e0b", borderRadius: "6px 6px 0 0", padding: "2.5% 3.5%", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                  <div style={{ color: "#ffffff", fontSize: "0.8vw", fontWeight: 700 }}>This Week</div>
                  <div style={{ background: "rgba(255,255,255,0.25)", color: "#fff", borderRadius: "99px", padding: "0.5% 4%", fontSize: "0.75vw", fontWeight: 800 }}>12</div>
                </div>
                <div style={{ flex: 1, background: "#fffbeb", borderRadius: "0 0 6px 6px", padding: "2.5%", display: "flex", flexDirection: "column", gap: "2%", overflow: "hidden" }}>
                  <div style={{ background: "#ffffff", borderRadius: "5px", padding: "3% 4%", borderLeft: "3px solid #f59e0b" }}>
                    <div style={{ color: "#111827", fontSize: "0.75vw", fontWeight: 600 }}>Lily K. IEP — Apr 18</div>
                    <div style={{ color: "#6b7280", fontSize: "0.65vw", marginTop: "1.5%" }}>Annual review · 4 days away</div>
                  </div>
                  <div style={{ background: "#ffffff", borderRadius: "5px", padding: "3% 4%", borderLeft: "3px solid #f59e0b" }}>
                    <div style={{ color: "#111827", fontSize: "0.75vw", fontWeight: 600 }}>James W. — 19 min behind</div>
                    <div style={{ color: "#6b7280", fontSize: "0.65vw", marginTop: "1.5%" }}>OT · approaching threshold</div>
                  </div>
                  <div style={{ background: "#ffffff", borderRadius: "5px", padding: "3% 4%", borderLeft: "3px solid #f59e0b" }}>
                    <div style={{ color: "#111827", fontSize: "0.75vw", fontWeight: 600 }}>Sophia R. — 12 min behind</div>
                    <div style={{ color: "#6b7280", fontSize: "0.65vw", marginTop: "1.5%" }}>PT · need makeup session</div>
                  </div>
                </div>
              </div>
              {/* Watch */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ background: "#6b7280", borderRadius: "6px 6px 0 0", padding: "2.5% 3.5%", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                  <div style={{ color: "#ffffff", fontSize: "0.8vw", fontWeight: 700 }}>Watch</div>
                  <div style={{ background: "rgba(255,255,255,0.25)", color: "#fff", borderRadius: "99px", padding: "0.5% 4%", fontSize: "0.75vw", fontWeight: 800 }}>18</div>
                </div>
                <div style={{ flex: 1, background: "#f9fafb", borderRadius: "0 0 6px 6px", padding: "2.5%", display: "flex", flexDirection: "column", gap: "2%", overflow: "hidden" }}>
                  <div style={{ background: "#ffffff", borderRadius: "5px", padding: "3% 4%", borderLeft: "3px solid #9ca3af" }}>
                    <div style={{ color: "#111827", fontSize: "0.75vw", fontWeight: 600 }}>Noah P. — slightly behind</div>
                    <div style={{ color: "#6b7280", fontSize: "0.65vw", marginTop: "1.5%" }}>Counseling · monitor pacing</div>
                  </div>
                  <div style={{ background: "#ffffff", borderRadius: "5px", padding: "3% 4%", borderLeft: "3px solid #9ca3af" }}>
                    <div style={{ color: "#111827", fontSize: "0.75vw", fontWeight: 600 }}>5 IEPs in 3 weeks</div>
                    <div style={{ color: "#6b7280", fontSize: "0.65vw", marginTop: "1.5%" }}>May review cycle · prep now</div>
                  </div>
                  <div style={{ background: "#ffffff", borderRadius: "5px", padding: "3% 4%", borderLeft: "3px solid #9ca3af" }}>
                    <div style={{ color: "#111827", fontSize: "0.75vw", fontWeight: 600 }}>Provider A out Apr 22–25</div>
                    <div style={{ color: "#6b7280", fontSize: "0.65vw", marginTop: "1.5%" }}>Coverage needed · 3 students</div>
                  </div>
                </div>
              </div>
              {/* Resolved */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ background: "#10b981", borderRadius: "6px 6px 0 0", padding: "2.5% 3.5%", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                  <div style={{ color: "#ffffff", fontSize: "0.8vw", fontWeight: 700 }}>Resolved</div>
                  <div style={{ background: "rgba(255,255,255,0.25)", color: "#fff", borderRadius: "99px", padding: "0.5% 4%", fontSize: "0.75vw", fontWeight: 800 }}>42</div>
                </div>
                <div style={{ flex: 1, background: "#ecfdf5", borderRadius: "0 0 6px 6px", padding: "2.5%", display: "flex", flexDirection: "column", gap: "2%", overflow: "hidden" }}>
                  <div style={{ background: "#ffffff", borderRadius: "5px", padding: "3% 4%", borderLeft: "3px solid #10b981", opacity: 0.85 }}>
                    <div style={{ color: "#374151", fontSize: "0.75vw", fontWeight: 600 }}>Alex M. back on track</div>
                    <div style={{ color: "#9ca3af", fontSize: "0.65vw", marginTop: "1.5%" }}>Makeup session logged Apr 12</div>
                  </div>
                  <div style={{ background: "#ffffff", borderRadius: "5px", padding: "3% 4%", borderLeft: "3px solid #10b981", opacity: 0.85 }}>
                    <div style={{ color: "#374151", fontSize: "0.75vw", fontWeight: 600 }}>North St. IEP complete</div>
                    <div style={{ color: "#9ca3af", fontSize: "0.65vw", marginTop: "1.5%" }}>Signed and filed Apr 11</div>
                  </div>
                  <div style={{ background: "#ffffff", borderRadius: "5px", padding: "3% 4%", borderLeft: "3px solid #10b981", opacity: 0.85 }}>
                    <div style={{ color: "#374151", fontSize: "0.75vw", fontWeight: 600 }}>Coverage confirmed · Ben T.</div>
                    <div style={{ color: "#9ca3af", fontSize: "0.65vw", marginTop: "1.5%" }}>Sub provider arranged Apr 8</div>
                  </div>
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
                Triage and close items directly from the board — no context switching
              </div>
              <div className="text-[1.15vw] font-body leading-snug" style={{ color: "#a8d5c2" }}>
                Column badges give the macro picture at a glance without a separate stats section
              </div>
              <div className="text-[1.15vw] font-body leading-snug" style={{ color: "#a8d5c2" }}>
                Mirrors workflows teams already know — Trello, Jira, Asana — no retraining
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
                Buries compliance rate and cost exposure in badge counts — not suitable for reporting
              </div>
              <div className="text-[1.15vw] font-body leading-snug" style={{ color: "#d4b06a" }}>
                Card proliferation becomes unmanageable beyond 200 students
              </div>
              <div className="text-[1.15vw] font-body leading-snug" style={{ color: "#d4b06a" }}>
                Not appropriate for presenting district-level data to leadership or board
              </div>
            </div>
          </div>
          <div className="rounded-xl shrink-0"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", padding: "1.5vh 1.5vw" }}>
            <div className="text-[0.9vw] font-body font-semibold mb-[0.4vh]" style={{ color: "#f87171" }}>BEST FOR</div>
            <div className="text-[1.15vw] font-body" style={{ color: "#fecaca" }}>
              Operations-focused admins who need to delegate, track, and close items daily
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
