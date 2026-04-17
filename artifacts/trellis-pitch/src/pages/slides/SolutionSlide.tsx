export default function SolutionSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-dark">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(16,185,129,0.12)_0%,_transparent_60%)]" />
      <div className="absolute bottom-0 left-0 w-full h-[0.4vh] bg-gradient-to-r from-primary via-accent to-transparent" />

      <div className="relative z-10 flex flex-col h-full px-[7vw] py-[7vh]">
        <p className="font-body text-[1.3vw] font-semibold text-accent tracking-[0.15em] uppercase mb-[1.5vh]">The Solution</p>
        <h2 className="font-display text-[4vw] font-bold text-white tracking-tight leading-[1.1]">
          One platform. Every workflow.
        </h2>
        <p className="font-body text-[1.8vw] text-white/60 mt-[1.5vh] max-w-[55vw]">
          Trellis replaces disconnected tools with a single source of truth purpose-built for special education compliance and clinical operations.
        </p>

        <div className="grid grid-cols-3 gap-[2.5vw] mt-[5vh]">
          <div className="bg-white/5 border border-white/10 rounded-[1vw] p-[2vw]">
            <div className="w-[3vw] h-[3vw] rounded-[0.6vw] bg-primary/20 flex items-center justify-center mb-[1.5vh]">
              <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[1.5vw] h-[1.5vw]"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <p className="font-body text-[1.6vw] font-bold text-white">Compliance Engine</p>
            <p className="font-body text-[1.3vw] text-white/50 mt-[1vh] leading-relaxed">Real-time service minute tracking with automated risk scoring. Gaps caught before they become violations.</p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-[1vw] p-[2vw]">
            <div className="w-[3vw] h-[3vw] rounded-[0.6vw] bg-primary/20 flex items-center justify-center mb-[1.5vh]">
              <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[1.5vw] h-[1.5vw]"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </div>
            <p className="font-body text-[1.6vw] font-bold text-white">Clinical ABA Tools</p>
            <p className="font-body text-[1.3vw] text-white/50 mt-[1vh] leading-relaxed">Discrete trial training, interval recording, FBA/BIP workflows, and phase-change graphing -- built for BCBAs.</p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-[1vw] p-[2vw]">
            <div className="w-[3vw] h-[3vw] rounded-[0.6vw] bg-primary/20 flex items-center justify-center mb-[1.5vh]">
              <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[1.5vw] h-[1.5vw]"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <p className="font-body text-[1.6vw] font-bold text-white">Role-Based Access</p>
            <p className="font-body text-[1.3vw] text-white/50 mt-[1vh] leading-relaxed">Nine distinct roles from Admin to Para. Guardian portal for families. Append-only audit trail on every change to a student record.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
