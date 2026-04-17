export default function S04_Solution() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <div className="absolute top-0 right-0 w-[42vw] h-full bg-paper" />
      <div className="absolute top-[8vh] right-[6vw] font-display italic text-[24vw] leading-none text-accent/10 select-none pointer-events-none">
        T
      </div>

      <div className="relative h-full grid grid-cols-12 px-[7vw] py-[7vh]">
        <div className="col-span-7 flex flex-col justify-between pr-[3vw]">
          <div className="flex items-center gap-[1vw]">
            <span className="font-display italic text-accent text-[1.4vw]">03</span>
            <span className="block w-[2vw] h-[0.2vh] bg-rule/40" />
            <span className="font-body uppercase tracking-[0.3em] text-[0.95vw] text-muted">
              The solution
            </span>
          </div>

          <div>
            <h2 className="font-display font-light text-[5.6vw] leading-[1.0] tracking-tight text-primary max-w-[44vw]">
              One platform.
              <span className="block italic text-accent">Three jobs done.</span>
            </h2>
            <p className="font-body text-[1.4vw] text-text/85 leading-relaxed mt-[4vh] max-w-[40vw]">
              Trellis replaces the SPED director's spreadsheet, the related-service provider's notebook, and the superintendent's dashboard — with a single source of truth.
            </p>
          </div>

          <div className="font-body uppercase tracking-[0.3em] text-[0.9vw] text-muted">
            Built for K-12 · Massachusetts-first · SOC 2 Type II in progress
          </div>
        </div>

        <div className="col-span-5 flex flex-col justify-center gap-[3vh]">
          <div className="border-l-[0.4vw] border-accent pl-[2vw]">
            <div className="font-display text-[1.6vw] text-primary mb-[0.8vh]">Schedule</div>
            <p className="font-body text-[1.05vw] text-text/80 leading-relaxed">
              Auto-generated, IEP-aware service blocks across schools, providers, and rotation cycles.
            </p>
          </div>
          <div className="border-l-[0.4vw] border-accent pl-[2vw]">
            <div className="font-display text-[1.6vw] text-primary mb-[0.8vh]">Document</div>
            <p className="font-body text-[1.05vw] text-text/80 leading-relaxed">
              30-second session logs. Make-ups, group sizes, and minute math handled automatically.
            </p>
          </div>
          <div className="border-l-[0.4vw] border-accent pl-[2vw]">
            <div className="font-display text-[1.6vw] text-primary mb-[0.8vh]">Defend</div>
            <p className="font-body text-[1.05vw] text-text/80 leading-relaxed">
              Live compliance score per student. Audit-ready report for DESE in two clicks.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
