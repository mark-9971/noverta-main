export default function S03_WhyNow() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-primary text-bg">
      <div className="absolute top-0 left-0 w-[40vw] h-[40vw] rounded-full bg-accent/15 -translate-x-1/3 -translate-y-1/3" />
      <div className="absolute bottom-0 right-0 w-[55vw] h-[55vw] rounded-full bg-gold/10 translate-x-1/4 translate-y-1/3" />

      <div className="relative h-full px-[7vw] py-[7vh] flex flex-col justify-between">
        <div className="flex items-center gap-[1vw]">
          <span className="font-display italic text-gold text-[1.4vw]">02</span>
          <span className="block w-[2vw] h-[0.2vh] bg-bg/40" />
          <span className="font-body uppercase tracking-[0.3em] text-[0.95vw] text-bg/70">
            Why now
          </span>
        </div>

        <div>
          <h2 className="font-display font-light text-[5.6vw] leading-[1.0] tracking-tight max-w-[70vw]">
            Three forces are colliding for the
            <span className="italic text-gold"> first time</span>.
          </h2>
        </div>

        <div className="grid grid-cols-3 gap-[3vw]">
          <div className="border-t-[0.3vh] border-accent pt-[2.5vh]">
            <div className="font-body uppercase tracking-[0.3em] text-[0.95vw] text-gold mb-[1.5vh]">
              Regulation
            </div>
            <h3 className="font-display text-[2vw] leading-tight mb-[1.5vh]">
              IDEA enforcement is back
            </h3>
            <p className="font-body text-[1.05vw] leading-relaxed text-bg/80">
              MA DESE has tripled district monitoring visits since 2023, and federal corrective-action orders are at a 10-year high.
            </p>
          </div>
          <div className="border-t-[0.3vh] border-accent pt-[2.5vh]">
            <div className="font-body uppercase tracking-[0.3em] text-[0.95vw] text-gold mb-[1.5vh]">
              Workforce
            </div>
            <h3 className="font-display text-[2vw] leading-tight mb-[1.5vh]">
              SPED staffing has cratered
            </h3>
            <p className="font-body text-[1.05vw] leading-relaxed text-bg/80">
              Vacancy rates above 18% mean the people who remain need leverage, not another portal to log into.
            </p>
          </div>
          <div className="border-t-[0.3vh] border-accent pt-[2.5vh]">
            <div className="font-body uppercase tracking-[0.3em] text-[0.95vw] text-gold mb-[1.5vh]">
              Budget
            </div>
            <h3 className="font-display text-[2vw] leading-tight mb-[1.5vh]">
              Comp-ed claims are exploding
            </h3>
            <p className="font-body text-[1.05vw] leading-relaxed text-bg/80">
              ESSER cliff plus rising out-of-district placements has every superintendent asking the same question: where is the leak?
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
