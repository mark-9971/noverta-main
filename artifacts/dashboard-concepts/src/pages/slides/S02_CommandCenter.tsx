export default function S02_CommandCenter() {
  return (
    <div className="w-screen h-screen overflow-hidden relative flex flex-col"
      style={{ background: "linear-gradient(160deg, #06101e 0%, #0b1a2f 100%)" }}>

      {/* Accent: top-left indigo glow */}
      <div className="absolute top-[-10vh] left-[-5vw] w-[35vw] h-[35vh] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)" }} />
      <div className="absolute bottom-0 right-0 w-[20vw] h-[20vh] pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(99,102,241,0.05) 0%, transparent 70%)" }} />

      {/* Header */}
      <div className="relative z-10 flex items-start justify-between px-[4.5vw] pt-[4vh] pb-[2vh] shrink-0">
        <div>
          <div className="flex items-center gap-[1vw] mb-[0.5vh]">
            <div className="text-[0.85vw] font-body text-muted font-medium" style={{ letterSpacing: "0.1em" }}>CONCEPT 1 OF 5</div>
            <div className="h-px flex-1 w-[6vw]" style={{ background: "rgba(99,102,241,0.3)" }} />
          </div>
          <h1 className="text-[3.8vw] font-display font-bold tracking-tight leading-none"
            style={{ color: "#c7d2fe" }}>Command Center</h1>
          <p className="text-[1.5vw] font-body mt-[0.8vh]" style={{ color: "#5d7fa8" }}>
            Dark · Dense · Power-user focused
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
          style={{ border: "1px solid rgba(99,102,241,0.2)", boxShadow: "0 0 40px rgba(99,102,241,0.08)" }}>
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
          {/* Dashboard content */}
          <div className="flex-1 min-h-0 flex" style={{ background: "#0f1829", overflow: "hidden" }}>
            {/* Sidebar */}
            <div className="shrink-0 flex flex-col items-center py-[2vh] gap-[1.5vh]"
              style={{ width: "3.5vw", background: "#0d1421", borderRight: "1px solid rgba(255,255,255,0.04)" }}>
              <div className="rounded" style={{ width: "1.8vw", height: "0.3vh", background: "#4e9bf5" }} />
              <div className="rounded" style={{ width: "1.8vw", height: "0.3vh", background: "#1e3252" }} />
              <div className="rounded" style={{ width: "1.8vw", height: "0.3vh", background: "#1e3252" }} />
              <div className="rounded" style={{ width: "1.8vw", height: "0.3vh", background: "#1e3252" }} />
              <div className="rounded" style={{ width: "1.8vw", height: "0.3vh", background: "#1e3252" }} />
            </div>
            {/* Main area */}
            <div className="flex-1 flex flex-col min-w-0" style={{ overflow: "hidden" }}>
              {/* KPI rotating bar */}
              <div className="flex gap-[0.5%] shrink-0" style={{ background: "#0c1524", padding: "1% 1.5%" }}>
                <div className="flex-1 rounded flex-col" style={{ background: "#1e3252", padding: "1.5% 2%" }}>
                  <div style={{ color: "#4a6e94", fontSize: "0.75vw" }}>Compliance Rate</div>
                  <div style={{ color: "#4e9bf5", fontSize: "1.8vw", fontWeight: 700, lineHeight: 1.1 }}>84%</div>
                  <div style={{ color: "#2d5077", fontSize: "0.6vw" }}>district avg — live</div>
                </div>
                <div className="flex-1 rounded" style={{ background: "#1a2535", padding: "1.5% 2%" }}>
                  <div style={{ color: "#4a6e94", fontSize: "0.75vw" }}>Cost Exposure</div>
                  <div style={{ color: "#f59e0b", fontSize: "1.8vw", fontWeight: 700, lineHeight: 1.1 }}>$142K</div>
                  <div style={{ color: "#5a4200", fontSize: "0.6vw" }}>comp-ed at risk</div>
                </div>
                <div className="flex-1 rounded" style={{ background: "#1a2535", padding: "1.5% 2%" }}>
                  <div style={{ color: "#4a6e94", fontSize: "0.75vw" }}>High-Risk Students</div>
                  <div style={{ color: "#ef4444", fontSize: "1.8vw", fontWeight: 700, lineHeight: 1.1 }}>23</div>
                  <div style={{ color: "#5a1a1a", fontSize: "0.6vw" }}>needs intervention</div>
                </div>
                <div className="flex-1 rounded" style={{ background: "#1a2535", padding: "1.5% 2%" }}>
                  <div style={{ color: "#4a6e94", fontSize: "0.75vw" }}>Urgent Actions</div>
                  <div style={{ color: "#fbbf24", fontSize: "1.8vw", fontWeight: 700, lineHeight: 1.1 }}>7</div>
                  <div style={{ color: "#5a3a00", fontSize: "0.6vw" }}>require response today</div>
                </div>
              </div>
              {/* 2×2 Quadrant grid */}
              <div className="flex-1 grid grid-cols-2 min-h-0" style={{ gap: "0.4%", background: "#09131e", padding: "0.4%" }}>
                {/* Q1: Compliance */}
                <div className="rounded flex flex-col" style={{ background: "#111f35", padding: "2.5% 3%", overflow: "hidden" }}>
                  <div style={{ color: "#7a9ab8", fontSize: "0.75vw", fontWeight: 600, marginBottom: "2%" }}>Compliance</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6%", marginBottom: "3%" }}>
                    <svg viewBox="0 0 100 100" style={{ width: "5vw", height: "5vw", flexShrink: 0 }}>
                      <circle cx="50" cy="50" r="38" fill="none" stroke="#1e3a5f" strokeWidth="12" />
                      <circle cx="50" cy="50" r="38" fill="none" stroke="#4e9bf5" strokeWidth="12"
                        strokeDasharray="200.6 238.76" strokeLinecap="round" transform="rotate(-90 50 50)" />
                      <text x="50" y="54" textAnchor="middle" fill="#4e9bf5" fontSize="20" fontWeight="700">84%</text>
                    </svg>
                    <div>
                      <div style={{ color: "#e2eaf5", fontSize: "1.5vw", fontWeight: 700 }}>On Track</div>
                      <div style={{ color: "#4a6e94", fontSize: "0.65vw" }}>158 of 188 students</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2%" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "2%" }}>
                      <div style={{ color: "#5d7fa8", fontSize: "0.6vw", width: "28%" }}>Speech-Lang</div>
                      <div style={{ flex: 1, background: "#1e3a5f", borderRadius: "1px", height: "0.4vh" }}>
                        <div style={{ width: "88%", background: "#4e9bf5", borderRadius: "1px", height: "100%" }} />
                      </div>
                      <div style={{ color: "#7a9ab8", fontSize: "0.6vw" }}>88%</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "2%" }}>
                      <div style={{ color: "#5d7fa8", fontSize: "0.6vw", width: "28%" }}>OT / PT</div>
                      <div style={{ flex: 1, background: "#1e3a5f", borderRadius: "1px", height: "0.4vh" }}>
                        <div style={{ width: "79%", background: "#f59e0b", borderRadius: "1px", height: "100%" }} />
                      </div>
                      <div style={{ color: "#7a9ab8", fontSize: "0.6vw" }}>79%</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "2%" }}>
                      <div style={{ color: "#5d7fa8", fontSize: "0.6vw", width: "28%" }}>Counseling</div>
                      <div style={{ flex: 1, background: "#1e3a5f", borderRadius: "1px", height: "0.4vh" }}>
                        <div style={{ width: "91%", background: "#34d399", borderRadius: "1px", height: "100%" }} />
                      </div>
                      <div style={{ color: "#7a9ab8", fontSize: "0.6vw" }}>91%</div>
                    </div>
                  </div>
                </div>
                {/* Q2: Financial Risk */}
                <div className="rounded flex flex-col" style={{ background: "#111f35", padding: "2.5% 3%", overflow: "hidden" }}>
                  <div style={{ color: "#7a9ab8", fontSize: "0.75vw", fontWeight: 600, marginBottom: "2%" }}>Financial Risk</div>
                  <div style={{ color: "#f59e0b", fontSize: "2.5vw", fontWeight: 700, lineHeight: 1 }}>$142K</div>
                  <div style={{ color: "#5d7fa8", fontSize: "0.65vw", marginBottom: "3%" }}>compensatory exposure YTD</div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: "2%", flex: 1, maxHeight: "5vh" }}>
                    <div style={{ flex: 1, background: "#1e3a5f", borderRadius: "1px 1px 0 0", height: "45%" }} />
                    <div style={{ flex: 1, background: "#1e3a5f", borderRadius: "1px 1px 0 0", height: "65%" }} />
                    <div style={{ flex: 1, background: "#1e3a5f", borderRadius: "1px 1px 0 0", height: "40%" }} />
                    <div style={{ flex: 1, background: "#1e3a5f", borderRadius: "1px 1px 0 0", height: "75%" }} />
                    <div style={{ flex: 1, background: "#f59e0b", borderRadius: "1px 1px 0 0", height: "85%" }} />
                    <div style={{ flex: 1, background: "#ef4444", borderRadius: "1px 1px 0 0", height: "100%" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2%" }}>
                    <div style={{ color: "#3d5a7a", fontSize: "0.5vw" }}>Nov</div>
                    <div style={{ color: "#3d5a7a", fontSize: "0.5vw" }}>Dec</div>
                    <div style={{ color: "#3d5a7a", fontSize: "0.5vw" }}>Jan</div>
                    <div style={{ color: "#3d5a7a", fontSize: "0.5vw" }}>Feb</div>
                    <div style={{ color: "#3d5a7a", fontSize: "0.5vw" }}>Mar</div>
                    <div style={{ color: "#3d5a7a", fontSize: "0.5vw" }}>Apr</div>
                  </div>
                </div>
                {/* Q3: Students */}
                <div className="rounded flex flex-col" style={{ background: "#111f35", padding: "2.5% 3%", overflow: "hidden" }}>
                  <div style={{ color: "#7a9ab8", fontSize: "0.75vw", fontWeight: 600, marginBottom: "2%" }}>At-Risk Students</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2%" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.5% 2%", borderRadius: "3px", background: "#1e3252" }}>
                      <div>
                        <div style={{ color: "#dce8f7", fontSize: "0.75vw", fontWeight: 500 }}>Marcus T.</div>
                        <div style={{ color: "#4a6e94", fontSize: "0.6vw" }}>Speech · Lincoln Elem.</div>
                      </div>
                      <div style={{ color: "#ef4444", fontSize: "0.65vw", fontWeight: 600 }}>41 min</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.5% 2%", borderRadius: "3px", background: "#1a2535" }}>
                      <div>
                        <div style={{ color: "#dce8f7", fontSize: "0.75vw", fontWeight: 500 }}>Lily K.</div>
                        <div style={{ color: "#4a6e94", fontSize: "0.6vw" }}>OT · Washington MS</div>
                      </div>
                      <div style={{ color: "#f59e0b", fontSize: "0.65vw", fontWeight: 600 }}>28 min</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.5% 2%", borderRadius: "3px", background: "#1a2535" }}>
                      <div>
                        <div style={{ color: "#dce8f7", fontSize: "0.75vw", fontWeight: 500 }}>James W.</div>
                        <div style={{ color: "#4a6e94", fontSize: "0.6vw" }}>Speech · Ridge Elem.</div>
                      </div>
                      <div style={{ color: "#f59e0b", fontSize: "0.65vw", fontWeight: 600 }}>19 min</div>
                    </div>
                  </div>
                </div>
                {/* Q4: Operations */}
                <div className="rounded flex flex-col" style={{ background: "#111f35", padding: "2.5% 3%", overflow: "hidden" }}>
                  <div style={{ color: "#7a9ab8", fontSize: "0.75vw", fontWeight: 600, marginBottom: "2%" }}>Operations</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "3%" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ color: "#5d7fa8", fontSize: "0.7vw" }}>Sessions delivered today</div>
                      <div style={{ color: "#34d399", fontSize: "1vw", fontWeight: 700 }}>42</div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ color: "#5d7fa8", fontSize: "0.7vw" }}>Missed this week</div>
                      <div style={{ color: "#ef4444", fontSize: "1vw", fontWeight: 700 }}>8</div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ color: "#5d7fa8", fontSize: "0.7vw" }}>Open alerts</div>
                      <div style={{ color: "#fbbf24", fontSize: "1vw", fontWeight: 700 }}>7</div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ color: "#5d7fa8", fontSize: "0.7vw" }}>IEPs due in 30 days</div>
                      <div style={{ color: "#9cb8d8", fontSize: "1vw", fontWeight: 700 }}>11</div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ color: "#5d7fa8", fontSize: "0.7vw" }}>Contract renewals</div>
                      <div style={{ color: "#9cb8d8", fontSize: "1vw", fontWeight: 700 }}>2</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: argument panel */}
        <div className="flex flex-col gap-[1.5vh] shrink-0" style={{ width: "28vw" }}>
          {/* Why it works */}
          <div className="flex-1 rounded-xl flex flex-col"
            style={{ background: "rgba(5, 40, 25, 0.5)", border: "1px solid rgba(52,211,153,0.2)", padding: "2.5vh 1.5vw" }}>
            <div className="text-[1.3vw] font-display font-bold mb-[1.5vh]" style={{ color: "#34d399" }}>
              Why this works
            </div>
            <div className="flex flex-col gap-[1.2vh] flex-1">
              <div className="text-[1.15vw] font-body leading-snug" style={{ color: "#a8d5c2" }}>
                Maximizes data density — compliance, cost, and risk visible without scrolling
              </div>
              <div className="text-[1.15vw] font-body leading-snug" style={{ color: "#a8d5c2" }}>
                KPI carousel surfaces live numbers, creating urgency for action
              </div>
              <div className="text-[1.15vw] font-body leading-snug" style={{ color: "#a8d5c2" }}>
                Four-quadrant structure matches the way experienced coordinators already think
              </div>
            </div>
          </div>
          {/* Why it may not */}
          <div className="flex-1 rounded-xl flex flex-col"
            style={{ background: "rgba(40, 20, 5, 0.5)", border: "1px solid rgba(245,158,11,0.2)", padding: "2.5vh 1.5vw" }}>
            <div className="text-[1.3vw] font-display font-bold mb-[1.5vh]" style={{ color: "#f59e0b" }}>
              Why it may not
            </div>
            <div className="flex flex-col gap-[1.2vh] flex-1">
              <div className="text-[1.15vw] font-body leading-snug" style={{ color: "#d4b06a" }}>
                High cognitive load — overwhelms new staff and infrequent users
              </div>
              <div className="text-[1.15vw] font-body leading-snug" style={{ color: "#d4b06a" }}>
                Dark theme feels out of place in school administration contexts
              </div>
              <div className="text-[1.15vw] font-body leading-snug" style={{ color: "#d4b06a" }}>
                Critical alerts risk being buried in visual noise across four panels
              </div>
            </div>
          </div>
          {/* Best for */}
          <div className="rounded-xl shrink-0"
            style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", padding: "1.5vh 1.5vw" }}>
            <div className="text-[0.9vw] font-body font-semibold mb-[0.4vh]" style={{ color: "#818cf8" }}>BEST FOR</div>
            <div className="text-[1.15vw] font-body" style={{ color: "#c7d2fe" }}>
              Experienced coordinators monitoring multiple schools simultaneously
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
