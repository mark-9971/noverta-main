export default function S23_Roadmap() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gradient-to-br from-[#f8f9fa] to-[#ecfdf5]">
      <div className="relative z-10 flex flex-col justify-center h-full px-[8vw]">
        <p className="font-body text-[1.4vw] text-primary font-semibold tracking-widest uppercase mb-[2vh]">What Comes Next</p>
        <h2 className="font-display text-[3.5vw] font-bold text-text tracking-tight leading-[1.1] mb-[5vh]">Roadmap</h2>
        <div className="flex gap-[2vw] items-stretch">
          <div className="flex-1 bg-primary/10 rounded-[1vw] p-[2vw] border border-primary/20 relative">
            <div className="absolute -top-[1.5vh] left-[2vw] bg-primary text-white px-[1vw] py-[0.3vh] rounded-full font-body text-[1vw] font-semibold">Now</div>
            <p className="font-body text-[1.5vw] font-semibold text-text mt-[1vh] mb-[1vh]">Core Platform</p>
            <p className="font-body text-[1.2vw] text-muted">IEP compliance, session logging, behavior data, AI import, alerts, Medicaid prep.</p>
          </div>
          <div className="flex-shrink-0 flex items-center">
            <span className="font-body text-[2vw] text-primary">→</span>
          </div>
          <div className="flex-1 bg-white rounded-[1vw] p-[2vw] border border-gray-200">
            <div className="absolute -top-[1.5vh] left-[2vw]" />
            <p className="font-body text-[1.5vw] font-semibold text-text mb-[1vh]">Q3 2026</p>
            <p className="font-body text-[1.2vw] text-muted">Pilot with 2-3 MA districts, parent portal, mobile provider app, SIS integrations.</p>
          </div>
          <div className="flex-shrink-0 flex items-center">
            <span className="font-body text-[2vw] text-primary">→</span>
          </div>
          <div className="flex-1 bg-white rounded-[1vw] p-[2vw] border border-gray-200">
            <p className="font-body text-[1.5vw] font-semibold text-text mb-[1vh]">2027</p>
            <p className="font-body text-[1.2vw] text-muted">Full Medicaid billing, progress report generation, multi-state expansion, white-label for SIS vendors.</p>
          </div>
          <div className="flex-shrink-0 flex items-center">
            <span className="font-body text-[2vw] text-primary">→</span>
          </div>
          <div className="flex-1 bg-white rounded-[1vw] p-[2vw] border border-gray-200">
            <p className="font-body text-[1.5vw] font-semibold text-text mb-[1vh]">2028+</p>
            <p className="font-body text-[1.2vw] text-muted">National scale, predictive analytics, outcome-based insights, district benchmarking.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
