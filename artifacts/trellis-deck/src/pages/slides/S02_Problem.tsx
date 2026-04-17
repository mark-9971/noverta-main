const base = import.meta.env.BASE_URL;

export default function S02_Problem() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <div className="grid grid-cols-12 h-full">
        <div className="col-span-7 relative px-[6vw] py-[7vh] flex flex-col justify-between">
          <div className="flex items-center gap-[1vw]">
            <span className="font-display italic text-accent text-[1.4vw]">01</span>
            <span className="block w-[2vw] h-[0.2vh] bg-rule/40" />
            <span className="font-body uppercase tracking-[0.3em] text-[0.95vw] text-muted">
              The problem
            </span>
          </div>

          <div className="max-w-[42vw]">
            <h2 className="font-display font-light text-[5.4vw] leading-[1.0] tracking-tight text-primary">
              Districts are running
              <span className="italic text-accent"> compliance</span> on
              spreadsheets and prayer.
            </h2>
            <p className="font-body text-[1.45vw] text-text/85 leading-relaxed mt-[4vh] max-w-[36vw]">
              Service minutes are missed. Make-ups go untracked. Compensatory liability quietly compounds — until the state audit shows up.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-[2vw]">
            <div>
              <div className="font-display text-[3.2vw] text-primary leading-none">73%</div>
              <div className="font-body text-[1vw] text-muted mt-[1vh] leading-snug">
                of MA districts cite IEP service tracking as a top operational risk
              </div>
            </div>
            <div>
              <div className="font-display text-[3.2vw] text-primary leading-none">$184k</div>
              <div className="font-body text-[1vw] text-muted mt-[1vh] leading-snug">
                median annual comp-ed exposure per mid-size district
              </div>
            </div>
            <div>
              <div className="font-display text-[3.2vw] text-primary leading-none">12+</div>
              <div className="font-body text-[1vw] text-muted mt-[1vh] leading-snug">
                disconnected tools the average SPED director juggles weekly
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-5 relative">
          <img
            src={`${base}problem-desk.png`}
            crossOrigin="anonymous"
            alt="Cluttered desk with IEP forms, sticky notes and a tablet"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-l from-transparent to-bg/30" />
          <div className="absolute bottom-[5vh] left-[3vw] right-[3vw] bg-bg/92 backdrop-blur p-[2.5vh] border-l-[0.4vw] border-accent">
            <p className="font-display italic text-[1.4vw] text-primary leading-snug">
              "I spend my Sundays reconciling service logs in Excel. That's the job now."
            </p>
            <p className="font-body uppercase tracking-[0.25em] text-[0.85vw] text-muted mt-[1.5vh]">
              SPED Director · 4,200-student district · MA
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
