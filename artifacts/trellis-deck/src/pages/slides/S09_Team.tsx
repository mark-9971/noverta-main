export default function S09_Team() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <div className="h-full px-[7vw] py-[7vh] flex flex-col">
        <div className="flex items-center gap-[1vw] mb-[4vh]">
          <span className="font-display italic text-accent text-[1.4vw]">08</span>
          <span className="block w-[2vw] h-[0.2vh] bg-rule/40" />
          <span className="font-body uppercase tracking-[0.3em] text-[0.95vw] text-muted">
            Team
          </span>
        </div>

        <h2 className="font-display font-light text-[4.6vw] leading-[1.0] tracking-tight text-primary mb-[6vh] max-w-[60vw]">
          Operators who lived this problem,
          <span className="italic text-accent"> not consultants who studied it.</span>
        </h2>

        <div className="grid grid-cols-3 gap-[3vw] flex-1">
          <div className="flex flex-col justify-between border-t-[0.3vh] border-primary pt-[3vh]">
            <div>
              <div className="font-display text-[2.2vw] text-primary leading-tight">Sarah Chen</div>
              <div className="font-body uppercase tracking-[0.25em] text-[0.9vw] text-accent mt-[1vh]">
                Co-founder · CEO
              </div>
            </div>
            <p className="font-body text-[1.05vw] text-text/80 leading-relaxed">
              Former SPED director, 7,000-student MA district. Led DESE corrective-action remediation across two superintendents.
            </p>
          </div>

          <div className="flex flex-col justify-between border-t-[0.3vh] border-primary pt-[3vh]">
            <div>
              <div className="font-display text-[2.2vw] text-primary leading-tight">Marcus Reyes</div>
              <div className="font-body uppercase tracking-[0.25em] text-[0.9vw] text-accent mt-[1vh]">
                Co-founder · CTO
              </div>
            </div>
            <p className="font-body text-[1.05vw] text-text/80 leading-relaxed">
              Early engineer at PowerSchool and Clever. Shipped K-12 integrations to 4,000+ districts.
            </p>
          </div>

          <div className="flex flex-col justify-between border-t-[0.3vh] border-primary pt-[3vh]">
            <div>
              <div className="font-display text-[2.2vw] text-primary leading-tight">Dr. Priya Anand</div>
              <div className="font-body uppercase tracking-[0.25em] text-[0.9vw] text-accent mt-[1vh]">
                Head of Product
              </div>
            </div>
            <p className="font-body text-[1.05vw] text-text/80 leading-relaxed">
              School psychologist turned PM. Designed compliance workflows now used by 30+ MA districts.
            </p>
          </div>
        </div>

        <div className="mt-[5vh] pt-[3vh] border-t border-rule/25 flex items-center justify-between">
          <div className="font-display italic text-[1.4vw] text-primary">
            Advised by former MA DESE associate commissioner and two superintendents.
          </div>
          <div className="font-body uppercase tracking-[0.3em] text-[0.85vw] text-muted">
            Boston, MA · 9 FTE · hiring
          </div>
        </div>
      </div>
    </div>
  );
}
