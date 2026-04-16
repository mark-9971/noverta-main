export default function ImplementationSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-gradient-to-br from-[#fafafa] to-[#f0fdf4]">
      <div className="absolute top-[-5vh] right-[-3vw] w-[30vw] h-[30vw] rounded-full bg-accent/5" />

      <div className="relative z-10 flex flex-col h-full px-[7vw] py-[7vh]">
        <p className="font-body text-[1.3vw] font-semibold text-primary tracking-[0.15em] uppercase mb-[1.5vh]">For Districts & Partners</p>
        <h2 className="font-display text-[3.8vw] font-bold text-text tracking-tight leading-[1.1]">
          Live in weeks, not months
        </h2>
        <p className="font-body text-[1.6vw] text-muted mt-[1.5vh] max-w-[55vw]">
          Cloud-native SaaS means zero infrastructure. CSV import or SIS sync gets you running immediately.
        </p>

        <div className="flex gap-[2vw] mt-[5vh]">
          {[
            { step: "1", title: "Onboard", time: "Week 1", items: ["CSV roster upload or SIS sync", "Role assignment for staff", "Service requirement configuration", "Training webinar (60 min)"] },
            { step: "2", title: "Configure", time: "Week 2", items: ["IEP goals & service schedules", "Compliance thresholds set", "Guardian portal invitations", "Custom report templates"] },
            { step: "3", title: "Go Live", time: "Week 3", items: ["Staff begin logging sessions", "Real-time compliance dashboard", "Automated risk alerts active", "Parent notifications flowing"] },
            { step: "4", title: "Optimize", time: "Ongoing", items: ["Monthly compliance reviews", "Analytics-driven insights", "Feature rollouts & updates", "Dedicated success manager"] },
          ].map((phase) => (
            <div key={phase.step} className="flex-1 relative">
              <div className="flex items-center gap-[0.8vw] mb-[2vh]">
                <div className="w-[2.5vw] h-[2.5vw] rounded-full bg-primary flex items-center justify-center">
                  <span className="font-display text-[1.3vw] font-bold text-white">{phase.step}</span>
                </div>
                <div>
                  <p className="font-body text-[1.4vw] font-bold text-text">{phase.title}</p>
                  <p className="font-body text-[0.9vw] text-primary font-semibold">{phase.time}</p>
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-[0.8vw] p-[1.5vw] h-[28vh]">
                <div className="space-y-[1.2vh]">
                  {phase.items.map((item, i) => (
                    <div key={i} className="flex items-center gap-[0.6vw]">
                      <div className="w-[0.35vw] h-[0.35vw] rounded-full bg-primary shrink-0" />
                      <p className="font-body text-[1.05vw] text-muted">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-[3vh] bg-primary/5 border border-primary/20 rounded-[0.8vw] px-[2vw] py-[1.5vh] flex items-center gap-[2vw]">
          <svg viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[1.8vw] h-[1.8vw] shrink-0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <p className="font-body text-[1.2vw] text-text"><span className="font-semibold text-primary">Pilot program available:</span> 60-day no-commitment pilot with full feature access for up to 50 students. Dedicated onboarding support included.</p>
        </div>
      </div>
    </div>
  );
}
