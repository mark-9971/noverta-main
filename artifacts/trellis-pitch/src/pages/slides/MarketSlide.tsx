export default function MarketSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-dark">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(16,185,129,0.1)_0%,_transparent_50%)]" />

      <div className="relative z-10 flex h-full">
        <div className="w-[50vw] flex flex-col justify-center px-[7vw] py-[7vh]">
          <p className="font-body text-[1.3vw] font-semibold text-accent tracking-[0.15em] uppercase mb-[1.5vh]">Market Opportunity</p>
          <h2 className="font-display text-[4vw] font-bold text-white tracking-tight leading-[1.1]">
            Massive, underserved, and growing
          </h2>
          <p className="font-body text-[1.5vw] text-white/50 mt-[2vh] leading-relaxed">
            7.5 million students receive special education services in the U.S. -- yet the tools available are generic SIS add-ons built for general ed.
          </p>
          <p className="font-body text-[1.5vw] text-white/50 mt-[1.5vh] leading-relaxed">
            Trellis starts with Massachusetts (400+ districts, strict regulations) and expands state by state with localized compliance modules.
          </p>
        </div>

        <div className="w-[50vw] flex flex-col justify-center items-center gap-[4vh] pr-[5vw]">
          <div className="text-center">
            <p className="font-display text-[8vw] font-extrabold text-accent leading-none">$3.2B</p>
            <p className="font-body text-[1.5vw] text-white/50 mt-[1vh]">U.S. K-12 SPED software market (est.)</p>
          </div>

          <div className="flex gap-[3vw]">
            <div className="text-center">
              <p className="font-display text-[3.5vw] font-bold text-white">400+</p>
              <p className="font-body text-[1.3vw] text-white/40">MA Districts</p>
            </div>
            <div className="w-[0.15vw] bg-white/10" />
            <div className="text-center">
              <p className="font-display text-[3.5vw] font-bold text-white">14%</p>
              <p className="font-body text-[1.3vw] text-white/40">Students in SPED</p>
            </div>
            <div className="w-[0.15vw] bg-white/10" />
            <div className="text-center">
              <p className="font-display text-[3.5vw] font-bold text-white">50</p>
              <p className="font-body text-[1.3vw] text-white/40">State Expansions</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
