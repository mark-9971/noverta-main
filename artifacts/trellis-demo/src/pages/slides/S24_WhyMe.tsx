export default function S24_WhyMe() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gradient-to-br from-[#f8f9fa] to-[#fef3c7]/20">
      <div className="absolute top-0 right-0 w-[35vw] h-[35vh] bg-warm/5 rounded-bl-[10vw]" />
      <div className="relative z-10 flex flex-col justify-center h-full px-[8vw]">
        <p className="font-body text-[1.4vw] text-warm font-semibold tracking-widest uppercase mb-[2vh]">The Builder</p>
        <h2 className="font-display text-[3.5vw] font-bold text-text tracking-tight leading-[1.1] mb-[5vh]">Why I am building this.</h2>
        <div className="flex gap-[4vw]">
          <div className="flex-1">
            <div className="w-[3vw] h-[0.4vh] bg-primary rounded-full mb-[2vh]" />
            <p className="font-body text-[1.6vw] text-text leading-relaxed mb-[3vh]">I have seen firsthand how broken the systems are that SPED teams rely on. Teachers and clinicians spend more time fighting their tools than helping students.</p>
            <p className="font-body text-[1.6vw] text-text leading-relaxed">Trellis is built by someone who understands both the compliance paperwork and the clinical workflows -- not a generic EdTech team guessing at what schools need.</p>
          </div>
          <div className="flex-1">
            <div className="bg-white rounded-[1vw] p-[2.5vw] border border-gray-100 shadow-sm">
              <p className="font-body text-[1.5vw] font-semibold text-text mb-[2vh]">What has been built (solo)</p>
              <div className="space-y-[1.5vh]">
                <div className="flex items-center gap-[1vw]">
                  <div className="w-[0.6vw] h-[0.6vw] rounded-full bg-primary flex-shrink-0" />
                  <p className="font-body text-[1.3vw] text-muted">Full-stack React + Node + PostgreSQL app</p>
                </div>
                <div className="flex items-center gap-[1vw]">
                  <div className="w-[0.6vw] h-[0.6vw] rounded-full bg-primary flex-shrink-0" />
                  <p className="font-body text-[1.3vw] text-muted">50+ database tables, 100+ API endpoints</p>
                </div>
                <div className="flex items-center gap-[1vw]">
                  <div className="w-[0.6vw] h-[0.6vw] rounded-full bg-primary flex-shrink-0" />
                  <p className="font-body text-[1.3vw] text-muted">AI-assisted IEP PDF import (clinician-reviewed)</p>
                </div>
                <div className="flex items-center gap-[1vw]">
                  <div className="w-[0.6vw] h-[0.6vw] rounded-full bg-primary flex-shrink-0" />
                  <p className="font-body text-[1.3vw] text-muted">Real-time compliance engine with cost alerts</p>
                </div>
                <div className="flex items-center gap-[1vw]">
                  <div className="w-[0.6vw] h-[0.6vw] rounded-full bg-primary flex-shrink-0" />
                  <p className="font-body text-[1.3vw] text-muted">Multi-role access (admin, teacher, parent)</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
