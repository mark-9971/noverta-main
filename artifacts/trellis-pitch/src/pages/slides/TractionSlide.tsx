export default function TractionSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-dark">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(16,185,129,0.1)_0%,_transparent_60%)]" />

      <div className="relative z-10 flex flex-col h-full px-[7vw] py-[7vh]">
        <p className="font-body text-[1.3vw] font-semibold text-accent tracking-[0.15em] uppercase mb-[1.5vh]">Traction & Roadmap</p>
        <h2 className="font-display text-[4vw] font-bold text-white tracking-tight leading-[1.1]">
          Built, shipped, and ready to pilot
        </h2>

        <div className="flex gap-[4vw] mt-[5vh] flex-1">
          <div className="flex-1 flex flex-col gap-[2.5vh]">
            <p className="font-body text-[1.5vw] font-semibold text-accent">What's Live Today</p>

            <div className="space-y-[1.5vh]">
              {[
                { label: "Full compliance engine", desc: "Real-time service minute tracking with risk scoring across all service types" },
                { label: "Clinical ABA tooling", desc: "DTT, interval recording, FBA/BIP, and phase-change graphing" },
                { label: "9-role access system", desc: "Admin, Coordinator, BCBA, Teacher, Para, Provider, Related Services, Agency, Guardian" },
                { label: "Guardian portal", desc: "Families view progress, documents, and send secure messages" },
                { label: "Protective measures (603 CMR 46)", desc: "5-step restraint documentation with automated parent notification" },
                { label: "IEP builder with template-driven goal drafting", desc: "Assemble IEP drafts from progress data + MA curriculum frameworks (rule-based, not AI-generated)" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-[1vw]">
                  <div className="w-[1.5vw] h-[1.5vw] rounded-full bg-accent/20 flex items-center justify-center shrink-0 mt-[0.3vh]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" className="w-[0.8vw] h-[0.8vw]"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div>
                    <p className="font-body text-[1.2vw] font-semibold text-white">{item.label}</p>
                    <p className="font-body text-[0.9vw] text-white/40">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="w-[0.15vw] bg-white/10" />

          <div className="flex-1 flex flex-col gap-[2.5vh]">
            <p className="font-body text-[1.5vw] font-semibold text-white/60">Roadmap</p>

            <div className="space-y-[1.5vh]">
              {[
                { q: "Q3 2026", items: ["PowerSchool / IC sync graduated from pilot to GA", "Direct Medicaid claim submission (today: CSV export)", "Mobile-optimized Para views"] },
                { q: "Q4 2026", items: ["DESE state reporting exports", "Multi-district admin console", "Advanced analytics dashboard"] },
                { q: "Q1 2027", items: ["New England expansion", "Custom SIS API marketplace", "White-label SIS partner SDK"] },
              ].map((phase, i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-[0.8vw] p-[1.5vw]">
                  <p className="font-body text-[1.1vw] font-bold text-accent mb-[0.8vh]">{phase.q}</p>
                  <div className="space-y-[0.5vh]">
                    {phase.items.map((item, j) => (
                      <div key={j} className="flex items-center gap-[0.6vw]">
                        <div className="w-[0.4vw] h-[0.4vw] rounded-full bg-white/30" />
                        <p className="font-body text-[1vw] text-white/50">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
