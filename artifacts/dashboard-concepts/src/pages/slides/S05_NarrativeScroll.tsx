export default function S05_NarrativeScroll() {
  return (
    <div className="w-screen h-screen overflow-hidden relative flex flex-col"
      style={{ background: "linear-gradient(160deg, #06101e 0%, #0b1a2f 100%)" }}>

      {/* Accent: amber right glow */}
      <div className="absolute top-[10vh] right-[-5vw] w-[30vw] h-[40vh] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(245,158,11,0.07) 0%, transparent 70%)" }} />

      {/* Header */}
      <div className="relative z-10 flex items-start justify-between px-[4.5vw] pt-[4vh] pb-[2vh] shrink-0">
        <div>
          <div className="flex items-center gap-[1vw] mb-[0.5vh]">
            <div className="text-[0.85vw] font-body text-muted font-medium" style={{ letterSpacing: "0.1em" }}>CONCEPT 4 OF 5</div>
            <div className="h-px w-[6vw]" style={{ background: "rgba(245,158,11,0.3)" }} />
          </div>
          <h1 className="text-[3.8vw] font-display font-bold tracking-tight leading-none"
            style={{ color: "#fde68a" }}>Narrative Scroll</h1>
          <p className="text-[1.5vw] font-body mt-[0.8vh]" style={{ color: "#5d7fa8" }}>
            Story-driven · Full picture · Sticky section anchors
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
          style={{ border: "1px solid rgba(245,158,11,0.15)", boxShadow: "0 0 40px rgba(245,158,11,0.05)" }}>
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
          {/* Dashboard content: Narrative Scroll */}
          <div className="flex-1 min-h-0 flex" style={{ background: "#fdfdfb", overflow: "hidden" }}>
            {/* Sticky left rail */}
            <div style={{ width: "15%", background: "#ffffff", borderRight: "1px solid #e5e7eb", padding: "3% 3%", display: "flex", flexDirection: "column", gap: "1%" }}>
              <div style={{ color: "#374151", fontSize: "0.7vw", fontWeight: 600, marginBottom: "4%" }}>This Report</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "5%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10%" }}>
                  <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", background: "#3b82f6", flexShrink: 0 }} />
                  <div style={{ color: "#1d4ed8", fontSize: "0.65vw", fontWeight: 500 }}>District Health</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10%" }}>
                  <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", background: "#d1d5db", flexShrink: 0 }} />
                  <div style={{ color: "#9ca3af", fontSize: "0.65vw" }}>Risk Breakdown</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10%" }}>
                  <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", background: "#d1d5db", flexShrink: 0 }} />
                  <div style={{ color: "#9ca3af", fontSize: "0.65vw" }}>At-Risk Students</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10%" }}>
                  <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", background: "#d1d5db", flexShrink: 0 }} />
                  <div style={{ color: "#9ca3af", fontSize: "0.65vw" }}>Cost Exposure</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10%" }}>
                  <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", background: "#d1d5db", flexShrink: 0 }} />
                  <div style={{ color: "#9ca3af", fontSize: "0.65vw" }}>Actions Needed</div>
                </div>
              </div>
              <div style={{ marginTop: "auto", paddingTop: "4%", borderTop: "1px solid #f3f4f6" }}>
                <div style={{ color: "#9ca3af", fontSize: "0.55vw" }}>Week of Apr 14</div>
                <div style={{ color: "#9ca3af", fontSize: "0.55vw", marginTop: "2%" }}>MetroWest Collab.</div>
              </div>
            </div>
            {/* Scrollable main content */}
            <div style={{ flex: 1, padding: "2.5% 3.5%", display: "flex", flexDirection: "column", gap: "2%", overflow: "hidden" }}>
              {/* Section 1: District Health Banner */}
              <div style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)", borderRadius: "8px", padding: "4% 5%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ color: "#93c5fd", fontSize: "0.65vw", marginBottom: "1.5%" }}>District Health — Week of April 14</div>
                    <div style={{ color: "#ffffff", fontSize: "1.6vw", fontWeight: 800, lineHeight: 1.1 }}>84% compliance district-wide</div>
                    <div style={{ color: "#bfdbfe", fontSize: "0.7vw", marginTop: "1.5%" }}>158 of 188 students meeting mandated service requirements this period</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ color: "#fbbf24", fontSize: "0.65vw" }}>COMP-ED EXPOSURE</div>
                    <div style={{ color: "#fde68a", fontSize: "2.5vw", fontWeight: 800, lineHeight: 1 }}>$142K</div>
                  </div>
                </div>
                {/* Progress bar */}
                <div style={{ marginTop: "3%", background: "rgba(255,255,255,0.15)", borderRadius: "2px", height: "0.5vh" }}>
                  <div style={{ width: "84%", background: "#60a5fa", borderRadius: "2px", height: "100%" }} />
                </div>
              </div>
              {/* Section 2: Risk Breakdown */}
              <div style={{ background: "#ffffff", borderRadius: "8px", padding: "3% 4%", border: "1px solid #f3f4f6" }}>
                <div style={{ color: "#374151", fontSize: "0.8vw", fontWeight: 600, marginBottom: "3%", paddingBottom: "2%", borderBottom: "1px solid #f9fafb" }}>Risk Breakdown</div>
                <div style={{ display: "flex", gap: "2%" }}>
                  <div style={{ flex: 1, background: "#fef2f2", borderRadius: "6px", padding: "3%", textAlign: "center" }}>
                    <div style={{ color: "#ef4444", fontSize: "1.8vw", fontWeight: 800 }}>7</div>
                    <div style={{ color: "#dc2626", fontSize: "0.65vw", fontWeight: 500 }}>Out of Compliance</div>
                  </div>
                  <div style={{ flex: 1, background: "#fffbeb", borderRadius: "6px", padding: "3%", textAlign: "center" }}>
                    <div style={{ color: "#f59e0b", fontSize: "1.8vw", fontWeight: 800 }}>23</div>
                    <div style={{ color: "#d97706", fontSize: "0.65vw", fontWeight: 500 }}>At Risk</div>
                  </div>
                  <div style={{ flex: 1, background: "#f0fdf4", borderRadius: "6px", padding: "3%", textAlign: "center" }}>
                    <div style={{ color: "#10b981", fontSize: "1.8vw", fontWeight: 800 }}>158</div>
                    <div style={{ color: "#059669", fontSize: "0.65vw", fontWeight: 500 }}>On Track</div>
                  </div>
                </div>
              </div>
              {/* Section 3: Top At-Risk */}
              <div style={{ background: "#ffffff", borderRadius: "8px", padding: "3% 4%", border: "1px solid #f3f4f6" }}>
                <div style={{ color: "#374151", fontSize: "0.8vw", fontWeight: 600, marginBottom: "3%", paddingBottom: "2%", borderBottom: "1px solid #f9fafb" }}>Top 3 At-Risk Students</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "2%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2% 3%", background: "#fef2f2", borderRadius: "5px" }}>
                    <div style={{ color: "#374151", fontSize: "0.75vw", fontWeight: 500 }}>Marcus T. — Speech-Language, Lincoln Elementary</div>
                    <div style={{ color: "#ef4444", fontSize: "0.7vw", fontWeight: 600 }}>41 min behind</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2% 3%", background: "#fffbeb", borderRadius: "5px" }}>
                    <div style={{ color: "#374151", fontSize: "0.75vw", fontWeight: 500 }}>Lily K. — Occupational Therapy, Washington MS</div>
                    <div style={{ color: "#d97706", fontSize: "0.7vw", fontWeight: 600 }}>28 min behind</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2% 3%", background: "#fffbeb", borderRadius: "5px" }}>
                    <div style={{ color: "#374151", fontSize: "0.75vw", fontWeight: 500 }}>James W. — Speech-Language, Ridge Elementary</div>
                    <div style={{ color: "#d97706", fontSize: "0.7vw", fontWeight: 600 }}>19 min behind</div>
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
                Nothing is hidden — every data point lives on one scrollable page
              </div>
              <div className="text-[1.15vw] font-body leading-snug" style={{ color: "#a8d5c2" }}>
                Section anchors make weekly leadership reviews fast to navigate
              </div>
              <div className="text-[1.15vw] font-body leading-snug" style={{ color: "#a8d5c2" }}>
                Feels like a live report — ideal for presenting to a school board
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
                Too long for quick daily check-ins — not built for monitoring cadence
              </div>
              <div className="text-[1.15vw] font-body leading-snug" style={{ color: "#d4b06a" }}>
                Scroll depth creates fatigue on routine daily or twice-weekly visits
              </div>
              <div className="text-[1.15vw] font-body leading-snug" style={{ color: "#d4b06a" }}>
                Mobile and tablet hostile by design — desktop only
              </div>
            </div>
          </div>
          <div className="rounded-xl shrink-0"
            style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", padding: "1.5vh 1.5vw" }}>
            <div className="text-[0.9vw] font-body font-semibold mb-[0.4vh]" style={{ color: "#f59e0b" }}>BEST FOR</div>
            <div className="text-[1.15vw] font-body" style={{ color: "#fde68a" }}>
              Weekly district review meetings and leadership presentations to the board
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
