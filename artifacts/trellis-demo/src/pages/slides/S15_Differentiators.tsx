export default function S15_Differentiators() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gradient-to-br from-[#f8f9fa] to-[#ecfdf5]">
      <div className="relative z-10 flex flex-col justify-center h-full px-[8vw]">
        <p className="font-body text-[1.4vw] text-primary font-semibold tracking-widest uppercase mb-[2vh]">Competitive Advantage</p>
        <h2 className="font-display text-[3.5vw] font-bold text-text tracking-tight leading-[1.1] mb-[5vh]">Why Trellis wins.</h2>
        <div className="grid grid-cols-2 gap-[3vw]">
          <div className="flex gap-[1.5vw] items-start">
            <div className="w-[3vw] h-[3vw] flex-shrink-0 rounded-full bg-primary/10 flex items-center justify-center mt-[0.3vh]">
              <span className="font-display text-[1.5vw] font-bold text-primary">1</span>
            </div>
            <div>
              <p className="font-body text-[1.6vw] font-semibold text-text mb-[0.5vh]">Compliance + Clinical in One System</p>
              <p className="font-body text-[1.3vw] text-muted">Competitors do compliance OR clinical data. Trellis does both, so session logs automatically feed IEP progress graphs.</p>
            </div>
          </div>
          <div className="flex gap-[1.5vw] items-start">
            <div className="w-[3vw] h-[3vw] flex-shrink-0 rounded-full bg-primary/10 flex items-center justify-center mt-[0.3vh]">
              <span className="font-display text-[1.5vw] font-bold text-primary">2</span>
            </div>
            <div>
              <p className="font-body text-[1.6vw] font-semibold text-text mb-[0.5vh]">Proactive Cost-Avoidance Alerts</p>
              <p className="font-body text-[1.3vw] text-muted">No competitor surfaces dollar-denominated risk exposure per student. Trellis tells you "this gap will cost $436" before it happens.</p>
            </div>
          </div>
          <div className="flex gap-[1.5vw] items-start">
            <div className="w-[3vw] h-[3vw] flex-shrink-0 rounded-full bg-primary/10 flex items-center justify-center mt-[0.3vh]">
              <span className="font-display text-[1.5vw] font-bold text-primary">3</span>
            </div>
            <div>
              <p className="font-body text-[1.6vw] font-semibold text-text mb-[0.5vh]">AI-Assisted IEP Import</p>
              <p className="font-body text-[1.3vw] text-muted">Upload a PDF; an LLM extracts goals, services, and accommodations and imports them so a clinician can verify and edit in-app. Minutes instead of hours of re-typing.</p>
            </div>
          </div>
          <div className="flex gap-[1.5vw] items-start">
            <div className="w-[3vw] h-[3vw] flex-shrink-0 rounded-full bg-primary/10 flex items-center justify-center mt-[0.3vh]">
              <span className="font-display text-[1.5vw] font-bold text-primary">4</span>
            </div>
            <div>
              <p className="font-body text-[1.6vw] font-semibold text-text mb-[0.5vh]">Massachusetts-First, Regulation-Aware</p>
              <p className="font-body text-[1.3vw] text-muted">Built for MA DESE rules and 603 CMR compliance. Not a generic national tool hoping MA districts will adapt.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
