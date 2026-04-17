export default function S06_Differentiator() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <div className="h-full px-[7vw] py-[7vh] flex flex-col">
        <div className="flex items-center gap-[1vw] mb-[5vh]">
          <span className="font-display italic text-accent text-[1.4vw]">05</span>
          <span className="block w-[2vw] h-[0.2vh] bg-rule/40" />
          <span className="font-body uppercase tracking-[0.3em] text-[0.95vw] text-muted">
            Why Trellis wins
          </span>
        </div>

        <h2 className="font-display font-light text-[4.6vw] leading-[1.0] tracking-tight text-primary mb-[6vh] max-w-[70vw]">
          The legacy SIS treats SPED as a checkbox.
          <span className="italic text-accent"> We treat it as the product.</span>
        </h2>

        <div className="grid grid-cols-2 gap-[4vw] flex-1">
          <div>
            <div className="font-body uppercase tracking-[0.3em] text-[0.95vw] text-muted mb-[2vh]">
              Legacy SIS modules
            </div>
            <div className="border-t border-rule/30 pt-[2vh]">
              <div className="flex justify-between py-[1.5vh] border-b border-rule/15 font-body text-[1.15vw] text-text/70">
                <span>Built for general education</span>
                <span className="font-display italic">retrofitted</span>
              </div>
              <div className="flex justify-between py-[1.5vh] border-b border-rule/15 font-body text-[1.15vw] text-text/70">
                <span>Annual implementation</span>
                <span className="font-display italic">6+ months</span>
              </div>
              <div className="flex justify-between py-[1.5vh] border-b border-rule/15 font-body text-[1.15vw] text-text/70">
                <span>Compliance reporting</span>
                <span className="font-display italic">add-on module</span>
              </div>
              <div className="flex justify-between py-[1.5vh] font-body text-[1.15vw] text-text/70">
                <span>Provider experience</span>
                <span className="font-display italic">desktop-only</span>
              </div>
            </div>
          </div>

          <div className="bg-primary text-bg p-[4vh]">
            <div className="font-body uppercase tracking-[0.3em] text-[0.95vw] text-gold mb-[2vh]">
              Trellis
            </div>
            <div className="border-t border-bg/25 pt-[2vh]">
              <div className="flex justify-between py-[1.5vh] border-b border-bg/15 font-body text-[1.15vw]">
                <span>Built for SPED, day one</span>
                <span className="font-display italic text-gold">native</span>
              </div>
              <div className="flex justify-between py-[1.5vh] border-b border-bg/15 font-body text-[1.15vw]">
                <span>CSV import + go-live</span>
                <span className="font-display italic text-gold">2 weeks</span>
              </div>
              <div className="flex justify-between py-[1.5vh] border-b border-bg/15 font-body text-[1.15vw]">
                <span>Compliance reporting</span>
                <span className="font-display italic text-gold">core surface</span>
              </div>
              <div className="flex justify-between py-[1.5vh] font-body text-[1.15vw]">
                <span>Provider experience</span>
                <span className="font-display italic text-gold">mobile-first</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
