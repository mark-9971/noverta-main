export default function S07_NextSteps() {
  return (
    <div className="w-screen h-screen overflow-hidden relative flex flex-col"
      style={{ background: "linear-gradient(160deg, #06101e 0%, #0b1a2f 100%)" }}>

      {/* Accent: subtle blue center radial */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[60vw] h-[60vh] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(78,155,245,0.04) 0%, transparent 70%)" }} />
      </div>

      {/* Header */}
      <div className="relative z-10 px-[5vw] pt-[5vh] pb-[3vh] shrink-0">
        <div className="text-[1.2vw] font-body font-medium text-primary mb-[0.5vh]" style={{ letterSpacing: "0.08em" }}>
          DECISION RUBRIC
        </div>
        <h1 className="text-[4vw] font-display font-bold text-text tracking-tight leading-none">
          Which direction fits your team?
        </h1>
        <p className="text-[1.6vw] font-body text-muted mt-[0.8vh]">
          Each concept solves a real problem. Pick based on your team's primary use case.
        </p>
      </div>

      {/* Divider */}
      <div className="mx-[5vw] h-px shrink-0" style={{ background: "rgba(78,155,245,0.12)" }} />

      {/* Comparison table */}
      <div className="relative z-10 px-[5vw] pt-[2.5vh] flex flex-col gap-0 flex-1 min-h-0">

        {/* Table header row */}
        <div className="flex gap-[1vw] pb-[1.5vh] shrink-0"
          style={{ borderBottom: "1px solid rgba(78,155,245,0.15)" }}>
          <div className="text-[1.1vw] font-body font-semibold text-muted" style={{ width: "22vw" }}>Concept</div>
          <div className="text-[1.1vw] font-body font-semibold text-muted flex-1">Core Strength</div>
          <div className="text-[1.1vw] font-body font-semibold text-muted flex-1">Best For</div>
          <div className="text-[1.1vw] font-body font-semibold text-muted flex-1">Watch Out</div>
          <div className="text-[1.1vw] font-body font-semibold text-muted" style={{ width: "10vw", textAlign: "center" }}>Daily Driver</div>
        </div>

        {/* Row 1: Command Center */}
        <div className="flex gap-[1vw] items-center py-[1.8vh] shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ width: "22vw" }} className="flex items-center gap-[1vw]">
            <div className="w-[0.4vw] h-[4vh] rounded-full shrink-0" style={{ background: "#818cf8" }} />
            <div>
              <div className="text-[1.25vw] font-display font-bold" style={{ color: "#c7d2fe" }}>Command Center</div>
              <div className="text-[1vw] font-body" style={{ color: "#4e6d8c" }}>Dark · Dense</div>
            </div>
          </div>
          <div className="flex-1 text-[1.1vw] font-body" style={{ color: "#9cb8d8" }}>
            Maximum data density — every metric visible at once
          </div>
          <div className="flex-1 text-[1.1vw] font-body" style={{ color: "#9cb8d8" }}>
            Experienced multi-school coordinators
          </div>
          <div className="flex-1 text-[1.1vw] font-body" style={{ color: "#9cb8d8" }}>
            High cognitive load for new staff
          </div>
          <div style={{ width: "10vw", textAlign: "center" }}>
            <div className="text-[1.1vw] font-body font-semibold" style={{ color: "#34d399" }}>High</div>
          </div>
        </div>

        {/* Row 2: Focus Mode */}
        <div className="flex gap-[1vw] items-center py-[1.8vh] shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ width: "22vw" }} className="flex items-center gap-[1vw]">
            <div className="w-[0.4vw] h-[4vh] rounded-full shrink-0" style={{ background: "#34d399" }} />
            <div>
              <div className="text-[1.25vw] font-display font-bold" style={{ color: "#a7f3d0" }}>Focus Mode</div>
              <div className="text-[1vw] font-body" style={{ color: "#4e6d8c" }}>Minimal · Guided</div>
            </div>
          </div>
          <div className="flex-1 text-[1.1vw] font-body" style={{ color: "#9cb8d8" }}>
            Zero decision fatigue — one number, one ranked queue
          </div>
          <div className="flex-1 text-[1.1vw] font-body" style={{ color: "#9cb8d8" }}>
            Campus coordinators on a daily check-in habit
          </div>
          <div className="flex-1 text-[1.1vw] font-body" style={{ color: "#9cb8d8" }}>
            Trend data hidden — slow decline not visible
          </div>
          <div style={{ width: "10vw", textAlign: "center" }}>
            <div className="text-[1.1vw] font-body font-semibold" style={{ color: "#34d399" }}>High</div>
          </div>
        </div>

        {/* Row 3: Wedge Hub */}
        <div className="flex gap-[1vw] items-center py-[1.8vh] shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ width: "22vw" }} className="flex items-center gap-[1vw]">
            <div className="w-[0.4vw] h-[4vh] rounded-full shrink-0" style={{ background: "#60a5fa" }} />
            <div>
              <div className="text-[1.25vw] font-display font-bold" style={{ color: "#bfdbfe" }}>Wedge Hub</div>
              <div className="text-[1vw] font-body" style={{ color: "#4e6d8c" }}>Tabbed · Pillar-based</div>
            </div>
          </div>
          <div className="flex-1 text-[1.1vw] font-body" style={{ color: "#9cb8d8" }}>
            Each stakeholder owns their pillar tab
          </div>
          <div className="flex-1 text-[1.1vw] font-body" style={{ color: "#9cb8d8" }}>
            Multi-stakeholder teams with role separation
          </div>
          <div className="flex-1 text-[1.1vw] font-body" style={{ color: "#9cb8d8" }}>
            Cross-pillar alerts missed when staying in one tab
          </div>
          <div style={{ width: "10vw", textAlign: "center" }}>
            <div className="text-[1.1vw] font-body font-semibold" style={{ color: "#f59e0b" }}>Medium</div>
          </div>
        </div>

        {/* Row 4: Narrative Scroll */}
        <div className="flex gap-[1vw] items-center py-[1.8vh] shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ width: "22vw" }} className="flex items-center gap-[1vw]">
            <div className="w-[0.4vw] h-[4vh] rounded-full shrink-0" style={{ background: "#f59e0b" }} />
            <div>
              <div className="text-[1.25vw] font-display font-bold" style={{ color: "#fde68a" }}>Narrative Scroll</div>
              <div className="text-[1vw] font-body" style={{ color: "#4e6d8c" }}>Story-driven · Report</div>
            </div>
          </div>
          <div className="flex-1 text-[1.1vw] font-body" style={{ color: "#9cb8d8" }}>
            Full story on one page — nothing hidden, ideal for presenting
          </div>
          <div className="flex-1 text-[1.1vw] font-body" style={{ color: "#9cb8d8" }}>
            Weekly leadership reviews and board presentations
          </div>
          <div className="flex-1 text-[1.1vw] font-body" style={{ color: "#9cb8d8" }}>
            Too long for daily check-in habit
          </div>
          <div style={{ width: "10vw", textAlign: "center" }}>
            <div className="text-[1.1vw] font-body font-semibold" style={{ color: "#ef4444" }}>Low</div>
          </div>
        </div>

        {/* Row 5: Kanban */}
        <div className="flex gap-[1vw] items-center py-[1.8vh] shrink-0">
          <div style={{ width: "22vw" }} className="flex items-center gap-[1vw]">
            <div className="w-[0.4vw] h-[4vh] rounded-full shrink-0" style={{ background: "#f87171" }} />
            <div>
              <div className="text-[1.25vw] font-display font-bold" style={{ color: "#fecaca" }}>Kanban Board</div>
              <div className="text-[1vw] font-body" style={{ color: "#4e6d8c" }}>Action-first · Triage</div>
            </div>
          </div>
          <div className="flex-1 text-[1.1vw] font-body" style={{ color: "#9cb8d8" }}>
            Triage, delegate, and close without leaving the board
          </div>
          <div className="flex-1 text-[1.1vw] font-body" style={{ color: "#9cb8d8" }}>
            Ops-focused admins who manage and delegate daily
          </div>
          <div className="flex-1 text-[1.1vw] font-body" style={{ color: "#9cb8d8" }}>
            Macro metrics buried — not usable for leadership reporting
          </div>
          <div style={{ width: "10vw", textAlign: "center" }}>
            <div className="text-[1.1vw] font-body font-semibold" style={{ color: "#34d399" }}>High</div>
          </div>
        </div>

        {/* Bottom note */}
        <div className="mt-auto pb-[3.5vh] shrink-0">
          <div className="h-px mb-[2vh]" style={{ background: "rgba(78,155,245,0.12)" }} />
          <div className="flex items-center justify-between">
            <div className="text-[1.1vw] font-body" style={{ color: "#3d5a7a" }}>
              Next step: pick one direction — the team will build a high-fidelity prototype before implementation begins.
            </div>
            <div className="text-[1.1vw] font-body font-semibold" style={{ color: "#4e9bf5" }}>
              Noverta — MetroWest Collaborative Pilot
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
