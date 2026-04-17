export default function S07_Market() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-paper">
      <div className="absolute inset-0">
        <div className="absolute top-[15vh] left-[8vw] w-[28vw] h-[28vw] rounded-full border-[0.3vh] border-accent/40" />
        <div className="absolute top-[22vh] left-[15vw] w-[18vw] h-[18vw] rounded-full border-[0.3vh] border-primary/40" />
        <div className="absolute top-[30vh] left-[22vw] w-[10vw] h-[10vw] rounded-full bg-accent/15" />
      </div>

      <div className="relative h-full px-[7vw] py-[7vh] grid grid-cols-12">
        <div className="col-span-5 flex flex-col justify-between">
          <div className="flex items-center gap-[1vw]">
            <span className="font-display italic text-accent text-[1.4vw]">06</span>
            <span className="block w-[2vw] h-[0.2vh] bg-rule/40" />
            <span className="font-body uppercase tracking-[0.3em] text-[0.95vw] text-muted">
              Market
            </span>
          </div>

          <div>
            <h2 className="font-display font-light text-[5vw] leading-[1.0] tracking-tight text-primary">
              Start in
              <span className="italic text-accent"> Massachusetts</span>.
              Take the Northeast.
            </h2>
            <p className="font-body text-[1.25vw] text-text/80 leading-relaxed mt-[3vh] max-w-[28vw]">
              MA is the most heavily regulated SPED market in the country — if it works here, it works in CT, NY, NJ, RI, and beyond.
            </p>
          </div>

          <div className="font-body text-[1vw] text-muted leading-relaxed max-w-[26vw]">
            Sources: NCES district counts, MA DESE 2024 special education enrollment, internal pricing model.
          </div>
        </div>

        <div className="col-span-7 flex flex-col justify-center gap-[4vh]">
          <div className="grid grid-cols-2 items-end border-b border-rule/25 pb-[3vh]">
            <div>
              <div className="font-body uppercase tracking-[0.3em] text-[0.9vw] text-muted">
                Beachhead — MA
              </div>
              <div className="font-display text-[1.4vw] text-text/80 mt-[0.8vh]">
                289 districts · 165k IEP students
              </div>
            </div>
            <div className="font-display text-[5.5vw] text-primary leading-none text-right">
              $58M
              <span className="block font-body text-[1vw] uppercase tracking-[0.3em] text-muted mt-[0.8vh]">
                annual recurring opportunity
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 items-end border-b border-rule/25 pb-[3vh]">
            <div>
              <div className="font-body uppercase tracking-[0.3em] text-[0.9vw] text-muted">
                Northeast expansion
              </div>
              <div className="font-display text-[1.4vw] text-text/80 mt-[0.8vh]">
                NY · NJ · CT · RI · NH · ME · VT
              </div>
            </div>
            <div className="font-display text-[5.5vw] text-primary leading-none text-right">
              $410M
              <span className="block font-body text-[1vw] uppercase tracking-[0.3em] text-muted mt-[0.8vh]">
                serviceable market by 2029
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 items-end pb-[1vh]">
            <div>
              <div className="font-body uppercase tracking-[0.3em] text-[0.9vw] text-muted">
                US K-12 SPED software TAM
              </div>
              <div className="font-display text-[1.4vw] text-text/80 mt-[0.8vh]">
                13,800 districts · 7.5M IEP students
              </div>
            </div>
            <div className="font-display text-[5.5vw] text-accent leading-none text-right">
              $2.6B
              <span className="block font-body text-[1vw] uppercase tracking-[0.3em] text-muted mt-[0.8vh]">
                long-term TAM
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
