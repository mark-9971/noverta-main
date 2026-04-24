export default function SISPartnerSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-dark">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center_top,_rgba(16,185,129,0.08)_0%,_transparent_60%)]" />

      <div className="relative z-10 flex flex-col h-full px-[7vw] py-[7vh]">
        <p className="font-body text-[1.3vw] font-semibold text-accent tracking-[0.15em] uppercase mb-[1.5vh]">SIS Partnership</p>
        <h2 className="font-display text-[4vw] font-bold text-white tracking-tight leading-[1.1]">
          Your SPED add-on, our engine
        </h2>
        <p className="font-body text-[1.8vw] text-white/60 mt-[1.5vh] max-w-[55vw]">
          SIS companies can offer enterprise SPED compliance without building it. Noverta integrates as a white-label module or partner extension.
        </p>

        <div className="flex gap-[3vw] mt-[5vh] flex-1">
          <div className="flex-1 flex flex-col gap-[2.5vh]">
            <div className="bg-white/5 border border-white/10 rounded-[1vw] p-[2vw] flex-1">
              <p className="font-body text-[1.5vw] font-bold text-white mb-[2vh]">Integration Options</p>

              <div className="space-y-[2vh]">
                <div className="flex items-start gap-[1.2vw]">
                  <div className="w-[3vw] h-[3vw] rounded-[0.6vw] bg-primary/20 flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" className="w-[1.5vw] h-[1.5vw]"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                  </div>
                  <div>
                    <p className="font-body text-[1.3vw] font-semibold text-white">Embedded Module</p>
                    <p className="font-body text-[1.1vw] text-white/50 leading-relaxed">White-label Noverta inside your SIS with SSO. Your branding, our compliance engine. iframe or API integration.</p>
                  </div>
                </div>

                <div className="flex items-start gap-[1.2vw]">
                  <div className="w-[3vw] h-[3vw] rounded-[0.6vw] bg-primary/20 flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" className="w-[1.5vw] h-[1.5vw]"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                  </div>
                  <div>
                    <p className="font-body text-[1.3vw] font-semibold text-white">API-First Architecture</p>
                    <p className="font-body text-[1.1vw] text-white/50 leading-relaxed">RESTful APIs for roster sync, session logging, compliance data, and reporting. Outbound webhooks for partner event streams on the roadmap.</p>
                  </div>
                </div>

                <div className="flex items-start gap-[1.2vw]">
                  <div className="w-[3vw] h-[3vw] rounded-[0.6vw] bg-primary/20 flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" className="w-[1.5vw] h-[1.5vw]"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  </div>
                  <div>
                    <p className="font-body text-[1.3vw] font-semibold text-white">Marketplace Listing</p>
                    <p className="font-body text-[1.1vw] text-white/50 leading-relaxed">List in your app store / partner directory. One-click install for districts already on your SIS platform.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-[2vh]">
            <div className="bg-white/5 border border-white/10 rounded-[1vw] p-[2vw]">
              <p className="font-body text-[1.3vw] font-bold text-accent mb-[1.5vh]">Revenue Share Model</p>
              <div className="space-y-[1.2vh]">
                <div className="flex items-center justify-between">
                  <p className="font-body text-[1.1vw] text-white/60">SIS partner gets</p>
                  <p className="font-display text-[1.8vw] font-bold text-white">20-30%</p>
                </div>
                <div className="w-full h-[0.15vh] bg-white/10" />
                <div className="flex items-center justify-between">
                  <p className="font-body text-[1.1vw] text-white/60">Avg. revenue per district</p>
                  <p className="font-display text-[1.8vw] font-bold text-white">$24K<span className="text-[1vw] text-white/40">/yr</span></p>
                </div>
                <div className="w-full h-[0.15vh] bg-white/10" />
                <div className="flex items-center justify-between">
                  <p className="font-body text-[1.1vw] text-white/60">Integration timeline</p>
                  <p className="font-display text-[1.8vw] font-bold text-white">4-6 wks</p>
                </div>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-[1vw] p-[2vw] flex-1">
              <p className="font-body text-[1.3vw] font-bold text-white mb-[1.5vh]">Why Partner with Noverta?</p>
              <div className="space-y-[1vh]">
                {[
                  "Retain SPED districts switching to competitors",
                  "Add compliance revenue without building it",
                  "Reduce support burden for SPED-specific requests",
                  "Differentiate with clinical-grade ABA tools",
                  "FERPA-aligned data handling built in (DPA, US-hosted, audit log)",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-[0.8vw]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" className="w-[1vw] h-[1vw] shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                    <p className="font-body text-[1.05vw] text-white/60">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
