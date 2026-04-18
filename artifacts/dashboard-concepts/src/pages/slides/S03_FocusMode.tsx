export default function S03_FocusMode() {
  return (
    <div className="w-screen h-screen overflow-hidden relative flex flex-col"
      style={{ background: "linear-gradient(160deg, #06101e 0%, #0b1a2f 100%)" }}>

      {/* Accent: emerald bottom-left glow */}
      <div className="absolute bottom-[-5vh] left-[-5vw] w-[30vw] h-[30vh] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(52,211,153,0.07) 0%, transparent 70%)" }} />

      {/* Header */}
      <div className="relative z-10 flex items-start justify-between px-[4.5vw] pt-[4vh] pb-[2vh] shrink-0">
        <div>
          <div className="flex items-center gap-[1vw] mb-[0.5vh]">
            <div className="text-[0.85vw] font-body text-muted font-medium" style={{ letterSpacing: "0.1em" }}>CONCEPT 2 OF 5</div>
            <div className="h-px w-[6vw]" style={{ background: "rgba(52,211,153,0.3)" }} />
          </div>
          <h1 className="text-[3.8vw] font-display font-bold tracking-tight leading-none"
            style={{ color: "#a7f3d0" }}>Focus Mode</h1>
          <p className="text-[1.5vw] font-body mt-[0.8vh]" style={{ color: "#5d7fa8" }}>
            Minimal · White · Prioritized action queue
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
          style={{ border: "1px solid rgba(52,211,153,0.15)", boxShadow: "0 0 40px rgba(52,211,153,0.05)" }}>
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
          {/* Dashboard content: Focus Mode */}
          <div className="flex-1 min-h-0 flex flex-col" style={{ background: "#fafafa", overflow: "hidden" }}>
            {/* Top nav */}
            <div style={{ background: "#ffffff", borderBottom: "1px solid #f3f4f6", padding: "1.2% 4%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "2%" }}>
                <div style={{ width: "0.8vw", height: "0.8vw", borderRadius: "3px", background: "#1d4ed8" }} />
                <div style={{ color: "#111827", fontSize: "0.85vw", fontWeight: 700 }}>Trellis</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "3%", fontSize: "0.7vw", color: "#6b7280" }}>
                <div>Jennifer M.</div>
                <div style={{ width: "1.5vw", height: "1.5vw", borderRadius: "50%", background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", color: "#1e40af", fontWeight: 700, fontSize: "0.65vw" }}>JM</div>
              </div>
            </div>
            {/* Hero section */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "3% 10%", overflow: "hidden" }}>
              <div style={{ width: "100%", maxWidth: "600px", display: "flex", flexDirection: "column", alignItems: "center", gap: "2.5%" }}>
                {/* Greeting */}
                <div style={{ textAlign: "center", width: "100%" }}>
                  <div style={{ color: "#9ca3af", fontSize: "0.8vw", marginBottom: "0.5%" }}>Good morning, Jennifer. Here is your district at a glance.</div>
                  <div style={{ color: "#111827", fontSize: "5.5vw", fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em" }}>84%</div>
                  <div style={{ color: "#4b5563", fontSize: "0.9vw", marginTop: "0.5%", fontWeight: 500 }}>District Compliance Rate</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "3%", marginTop: "1.5%", fontSize: "0.7vw" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "1.5%", color: "#6b7280" }}>
                      <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: "#10b981" }} />
                      158 on track
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "1.5%", color: "#6b7280" }}>
                      <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: "#f59e0b" }} />
                      23 at risk
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "1.5%", color: "#6b7280" }}>
                      <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: "#ef4444" }} />
                      7 critical
                    </div>
                  </div>
                </div>
                {/* Divider */}
                <div style={{ width: "30%", height: "1px", background: "#e5e7eb", margin: "0.5% 0" }} />
                {/* Action queue header */}
                <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ color: "#111827", fontSize: "0.85vw", fontWeight: 600 }}>What needs your attention today</div>
                  <div style={{ color: "#3b82f6", fontSize: "0.7vw", fontWeight: 500 }}>ranked by urgency</div>
                </div>
                {/* Action items */}
                <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "1.5%" }}>
                  <div style={{ background: "#ffffff", border: "1px solid #fecaca", borderLeft: "3px solid #ef4444", borderRadius: "6px", padding: "2% 3%" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ color: "#111827", fontSize: "0.85vw", fontWeight: 600 }}>Marcus T. is 41 minutes behind schedule</div>
                        <div style={{ color: "#9ca3af", fontSize: "0.7vw", marginTop: "0.5%" }}>Speech-Language — Lincoln Elementary</div>
                      </div>
                      <div style={{ color: "#ef4444", fontSize: "0.65vw", fontWeight: 600, background: "#fef2f2", padding: "0.5% 1.5%", borderRadius: "4px", whiteSpace: "nowrap" }}>Urgent</div>
                    </div>
                  </div>
                  <div style={{ background: "#ffffff", border: "1px solid #fde68a", borderLeft: "3px solid #f59e0b", borderRadius: "6px", padding: "2% 3%" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ color: "#111827", fontSize: "0.85vw", fontWeight: 600 }}>IEP meeting for Lily K. is on April 18</div>
                        <div style={{ color: "#9ca3af", fontSize: "0.7vw", marginTop: "0.5%" }}>Annual review — 4 days away</div>
                      </div>
                      <div style={{ color: "#92400e", fontSize: "0.65vw", fontWeight: 600, background: "#fffbeb", padding: "0.5% 1.5%", borderRadius: "4px", whiteSpace: "nowrap" }}>Due Soon</div>
                    </div>
                  </div>
                  <div style={{ background: "#ffffff", border: "1px solid #d1fae5", borderLeft: "3px solid #10b981", borderRadius: "6px", padding: "2% 3%" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ color: "#111827", fontSize: "0.85vw", fontWeight: 600 }}>Wilson OT Agency contract expires in 30 days</div>
                        <div style={{ color: "#9ca3af", fontSize: "0.7vw", marginTop: "0.5%" }}>Renew or replace before June 1</div>
                      </div>
                      <div style={{ color: "#065f46", fontSize: "0.65vw", fontWeight: 600, background: "#ecfdf5", padding: "0.5% 1.5%", borderRadius: "4px", whiteSpace: "nowrap" }}>This Month</div>
                    </div>
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
                Zero decision fatigue — one number tells the health story instantly
              </div>
              <div className="text-[1.15vw] font-body leading-snug" style={{ color: "#a8d5c2" }}>
                Prioritized action queue removes the need to manually identify what matters
              </div>
              <div className="text-[1.15vw] font-body leading-snug" style={{ color: "#a8d5c2" }}>
                Perfect for brief daily check-ins — full picture in under 2 minutes
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
                Hides trend data — slow degradation becomes invisible until it is a crisis
              </div>
              <div className="text-[1.15vw] font-body leading-snug" style={{ color: "#d4b06a" }}>
                Power users feel constrained — no exploration, no drilldown without navigating away
              </div>
              <div className="text-[1.15vw] font-body leading-snug" style={{ color: "#d4b06a" }}>
                Not suitable for leadership reporting without a separate view
              </div>
            </div>
          </div>
          <div className="rounded-xl shrink-0"
            style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", padding: "1.5vh 1.5vw" }}>
            <div className="text-[0.9vw] font-body font-semibold mb-[0.4vh]" style={{ color: "#34d399" }}>BEST FOR</div>
            <div className="text-[1.15vw] font-body" style={{ color: "#a7f3d0" }}>
              Daily driver for campus coordinators who trust the system to do the sorting
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
