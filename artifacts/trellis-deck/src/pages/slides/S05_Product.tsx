export default function S05_Product() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <div className="h-full px-[6vw] py-[6vh] flex flex-col">
        <div className="flex items-end justify-between mb-[5vh]">
          <div>
            <div className="flex items-center gap-[1vw] mb-[2vh]">
              <span className="font-display italic text-accent text-[1.4vw]">04</span>
              <span className="block w-[2vw] h-[0.2vh] bg-rule/40" />
              <span className="font-body uppercase tracking-[0.3em] text-[0.95vw] text-muted">
                Product
              </span>
            </div>
            <h2 className="font-display font-light text-[4.4vw] leading-[1.0] tracking-tight text-primary max-w-[50vw]">
              The four surfaces a district actually uses.
            </h2>
          </div>
          <div className="font-display italic text-[1.3vw] text-muted max-w-[22vw] text-right leading-snug">
            Each surface earns its keep on day one — no implementation marathon required.
          </div>
        </div>

        <div className="grid grid-cols-4 gap-[1.8vw] flex-1">
          <div className="bg-paper p-[3vh] flex flex-col justify-between">
            <div>
              <div className="font-display text-[3.5vw] text-accent leading-none">01</div>
              <div className="font-display text-[1.7vw] text-primary mt-[2vh] leading-tight">
                Compliance Risk Report
              </div>
            </div>
            <p className="font-body text-[1vw] text-text/75 leading-relaxed">
              Live dollar exposure per student, per service, per school — color-coded by audit risk tier.
            </p>
          </div>

          <div className="bg-primary text-bg p-[3vh] flex flex-col justify-between">
            <div>
              <div className="font-display text-[3.5vw] text-gold leading-none">02</div>
              <div className="font-display text-[1.7vw] mt-[2vh] leading-tight">
                Service Schedule Builder
              </div>
            </div>
            <p className="font-body text-[1vw] text-bg/80 leading-relaxed">
              Drag-and-drop weekly grid that respects IEP minutes, caseload caps, and rotation calendars.
            </p>
          </div>

          <div className="bg-paper p-[3vh] flex flex-col justify-between">
            <div>
              <div className="font-display text-[3.5vw] text-accent leading-none">03</div>
              <div className="font-display text-[1.7vw] text-primary mt-[2vh] leading-tight">
                Provider Mobile Logging
              </div>
            </div>
            <p className="font-body text-[1vw] text-text/75 leading-relaxed">
              Phone-first session capture in under 30 seconds. Offline-friendly. Make-ups auto-suggested.
            </p>
          </div>

          <div className="bg-primary text-bg p-[3vh] flex flex-col justify-between">
            <div>
              <div className="font-display text-[3.5vw] text-gold leading-none">04</div>
              <div className="font-display text-[1.7vw] mt-[2vh] leading-tight">
                DESE-Ready Reporting
              </div>
            </div>
            <p className="font-body text-[1vw] text-bg/80 leading-relaxed">
              State-format exports, cohort analytics, and the audit binder your superintendent wants on Monday.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
