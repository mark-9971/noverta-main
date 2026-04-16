export default function WhyNowSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-dark">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(16,185,129,0.1)_0%,_transparent_60%)]" />

      <div className="relative z-10 flex flex-col h-full px-[7vw] py-[7vh]">
        <p className="font-body text-[1.3vw] font-semibold text-accent tracking-[0.15em] uppercase mb-[1.5vh]">Why Now</p>
        <h2 className="font-display text-[4vw] font-bold text-white tracking-tight leading-[1.1]">
          A perfect storm of urgency
        </h2>
        <p className="font-body text-[1.8vw] text-white/60 mt-[1.5vh] max-w-[55vw]">
          Regulatory tightening, post-COVID funding, and staffing shortages are forcing districts to modernize -- now.
        </p>

        <div className="grid grid-cols-2 gap-[3vw] mt-[5vh]">
          <div className="bg-white/5 border border-white/10 rounded-[1vw] p-[2vw]">
            <div className="flex items-center gap-[1vw] mb-[1.5vh]">
              <div className="w-[2.5vw] h-[2.5vw] rounded-full bg-red-500/20 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[1.3vw] h-[1.3vw]"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
              <p className="font-body text-[1.5vw] font-bold text-white">Regulatory Pressure</p>
            </div>
            <p className="font-body text-[1.2vw] text-white/50 leading-relaxed">Massachusetts 603 CMR 46 updates and federal IDEA audits demand real-time, auditable documentation. Paper-based systems can't keep up.</p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-[1vw] p-[2vw]">
            <div className="flex items-center gap-[1vw] mb-[1.5vh]">
              <div className="w-[2.5vw] h-[2.5vw] rounded-full bg-emerald-500/20 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[1.3vw] h-[1.3vw]"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              </div>
              <p className="font-body text-[1.5vw] font-bold text-white">ESSER Funding Window</p>
            </div>
            <p className="font-body text-[1.2vw] text-white/50 leading-relaxed">$190B in federal COVID relief allocated for K-12 includes technology modernization. Districts have budget now -- but the spending deadline creates urgency.</p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-[1vw] p-[2vw]">
            <div className="flex items-center gap-[1vw] mb-[1.5vh]">
              <div className="w-[2.5vw] h-[2.5vw] rounded-full bg-amber-500/20 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[1.3vw] h-[1.3vw]"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
              </div>
              <p className="font-body text-[1.5vw] font-bold text-white">Staffing Crisis</p>
            </div>
            <p className="font-body text-[1.2vw] text-white/50 leading-relaxed">National SPED teacher shortage exceeds 100,000. Districts must do more with fewer staff -- automation isn't optional, it's survival.</p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-[1vw] p-[2vw]">
            <div className="flex items-center gap-[1vw] mb-[1.5vh]">
              <div className="w-[2.5vw] h-[2.5vw] rounded-full bg-blue-500/20 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[1.3vw] h-[1.3vw]"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              </div>
              <p className="font-body text-[1.5vw] font-bold text-white">SIS Modernization Wave</p>
            </div>
            <p className="font-body text-[1.2vw] text-white/50 leading-relaxed">PowerSchool, Infinite Campus, and others are actively seeking SPED partner integrations. The ecosystem is ready for a purpose-built layer.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
