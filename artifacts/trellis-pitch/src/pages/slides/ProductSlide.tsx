export default function ProductSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-gradient-to-br from-[#fafafa] to-[#f0fdf4]">
      <div className="absolute top-0 right-0 w-[40vw] h-full bg-gradient-to-l from-accent/5 to-transparent" />

      <div className="relative z-10 flex flex-col h-full px-[7vw] py-[6vh]">
        <p className="font-body text-[1.3vw] font-semibold text-primary tracking-[0.15em] uppercase mb-[1vh]">Product Depth</p>
        <h2 className="font-display text-[3.5vw] font-bold text-text tracking-tight leading-[1.1]">
          Beyond compliance -- a clinical-grade platform
        </h2>

        <div className="grid grid-cols-2 gap-x-[4vw] gap-y-[3vh] mt-[4vh]">
          <div className="flex gap-[1.5vw] items-start">
            <div className="w-[0.4vw] h-[5vh] bg-primary rounded-full mt-[0.5vh] shrink-0" />
            <div>
              <p className="font-body text-[1.6vw] font-bold text-text">IEP Goal Progress Tracking</p>
              <p className="font-body text-[1.3vw] text-muted leading-relaxed mt-[0.3vh]">Per-goal time-series charts with trend analysis, baseline/target reference lines, and progress ratings from mastered to needs attention.</p>
            </div>
          </div>

          <div className="flex gap-[1.5vw] items-start">
            <div className="w-[0.4vw] h-[5vh] bg-primary rounded-full mt-[0.5vh] shrink-0" />
            <div>
              <p className="font-body text-[1.6vw] font-bold text-text">Protective Measures (603 CMR 46)</p>
              <p className="font-body text-[1.3vw] text-muted leading-relaxed mt-[0.3vh]">Five-step restraint/seclusion documentation with multi-signature routing, automated parent notifications, and DESE-compliant exports.</p>
            </div>
          </div>

          <div className="flex gap-[1.5vw] items-start">
            <div className="w-[0.4vw] h-[5vh] bg-primary rounded-full mt-[0.5vh] shrink-0" />
            <div>
              <p className="font-body text-[1.6vw] font-bold text-text">SIS Integrations</p>
              <p className="font-body text-[1.3vw] text-muted leading-relaxed mt-[0.3vh]">Sync rosters from PowerSchool, Infinite Campus, and Skyward. Auto-archive unenrolled students. CSV fallback for any system.</p>
            </div>
          </div>

          <div className="flex gap-[1.5vw] items-start">
            <div className="w-[0.4vw] h-[5vh] bg-primary rounded-full mt-[0.5vh] shrink-0" />
            <div>
              <p className="font-body text-[1.6vw] font-bold text-text">Para "My Day" Mobile View</p>
              <p className="font-body text-[1.3vw] text-muted leading-relaxed mt-[0.3vh]">Touch-optimized interface for paras to run timers, log behavior data, record DTT trials, and view schedules in real time.</p>
            </div>
          </div>

          <div className="flex gap-[1.5vw] items-start">
            <div className="w-[0.4vw] h-[5vh] bg-primary rounded-full mt-[0.5vh] shrink-0" />
            <div>
              <p className="font-body text-[1.6vw] font-bold text-text">Agency Contract Management</p>
              <p className="font-body text-[1.3vw] text-muted leading-relaxed mt-[0.3vh]">Track outsourced service contracts with utilization dashboards and automated alerts at 80% and 95% thresholds.</p>
            </div>
          </div>

          <div className="flex gap-[1.5vw] items-start">
            <div className="w-[0.4vw] h-[5vh] bg-primary rounded-full mt-[0.5vh] shrink-0" />
            <div>
              <p className="font-body text-[1.6vw] font-bold text-text">State Reporting (SIMS / IDEA Part B)</p>
              <p className="font-body text-[1.3vw] text-muted leading-relaxed mt-[0.3vh]">Pre-validated exports for MA SIMS and federal IDEA reporting. Catches missing SASIDs and disability codes before submission.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
