export default function S10_Ask() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-primary text-bg">
      <div className="absolute top-0 left-0 right-0 h-[6vh] bg-accent" />
      <div className="absolute bottom-0 left-0 right-0 h-[2vh] bg-gold" />

      <div className="absolute right-[7vw] top-[18vh] font-display italic text-[40vw] leading-none text-bg/[0.04] select-none pointer-events-none">
        T
      </div>

      <div className="relative h-full px-[7vw] py-[12vh] grid grid-cols-12">
        <div className="col-span-7 flex flex-col justify-between pr-[3vw]">
          <div className="flex items-center gap-[1vw]">
            <span className="font-display italic text-gold text-[1.4vw]">09</span>
            <span className="block w-[2vw] h-[0.2vh] bg-bg/50" />
            <span className="font-body uppercase tracking-[0.3em] text-[0.95vw] text-bg/70">
              The ask
            </span>
          </div>

          <div>
            <h2 className="font-display font-light text-[6.4vw] leading-[0.95] tracking-tight">
              Raising
              <span className="italic text-gold"> $4.5M</span>
              <span className="block">to own Massachusetts</span>
              <span className="block">by fall 2027.</span>
            </h2>
          </div>

          <div className="font-display italic text-[1.5vw] text-bg/85 max-w-[42vw] leading-snug">
            Investor partners who understand education sales cycles and want a defensible foothold in the most rigorous K-12 market in the country.
          </div>
        </div>

        <div className="col-span-5 flex flex-col justify-center gap-[3vh]">
          <div className="border-l-[0.4vw] border-accent pl-[2vw]">
            <div className="font-body uppercase tracking-[0.3em] text-[0.9vw] text-gold mb-[1vh]">
              Use of funds
            </div>
            <div className="font-display text-[1.5vw] leading-snug">
              45% engineering · 30% MA go-to-market · 15% compliance + security · 10% reserve
            </div>
          </div>
          <div className="border-l-[0.4vw] border-accent pl-[2vw]">
            <div className="font-body uppercase tracking-[0.3em] text-[0.9vw] text-gold mb-[1vh]">
              Milestone — 18 months
            </div>
            <div className="font-display text-[1.5vw] leading-snug">
              40 paying districts · $3.6M ARR · Series A ready
            </div>
          </div>
          <div className="border-l-[0.4vw] border-accent pl-[2vw]">
            <div className="font-body uppercase tracking-[0.3em] text-[0.9vw] text-gold mb-[1vh]">
              Contact
            </div>
            <div className="font-display text-[1.5vw] leading-snug">
              sarah@trellis.school · trellis.school
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
