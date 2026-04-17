const base = import.meta.env.BASE_URL;

export default function S22_WhyNow() {
  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <img src={`${base}team-collab.png`} crossOrigin="anonymous" className="absolute inset-0 w-full h-full object-cover" alt="Team collaboration" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#022c22]/90 via-[#022c22]/75 to-[#022c22]/50" />
      <div className="relative z-10 flex flex-col justify-center h-full pl-[8vw] pr-[35vw]">
        <p className="font-body text-[1.4vw] text-amber-400 font-semibold tracking-widest uppercase mb-[2vh]">Timing</p>
        <h2 className="font-display text-[4vw] font-bold text-white tracking-tight leading-[1.1] mb-[4vh]">Why now?</h2>
        <div className="space-y-[3vh]">
          <div className="flex gap-[1.5vw] items-start">
            <div className="w-[0.4vw] h-[4vh] bg-primary rounded-full flex-shrink-0 mt-[0.3vh]" />
            <p className="font-body text-[1.6vw] text-emerald-100/90 leading-relaxed">Post-COVID SPED backlogs have forced districts to modernize. Paper-based systems collapsed under remote service delivery.</p>
          </div>
          <div className="flex gap-[1.5vw] items-start">
            <div className="w-[0.4vw] h-[4vh] bg-warm rounded-full flex-shrink-0 mt-[0.3vh]" />
            <p className="font-body text-[1.6vw] text-emerald-100/90 leading-relaxed">Federal IDEA audits are intensifying. Massachusetts DESE has increased compliance monitoring since 2023.</p>
          </div>
          <div className="flex gap-[1.5vw] items-start">
            <div className="w-[0.4vw] h-[4vh] bg-blue-400 rounded-full flex-shrink-0 mt-[0.3vh]" />
            <p className="font-body text-[1.6vw] text-emerald-100/90 leading-relaxed">AI capabilities now enable IEP parsing and smart suggestions that were impossible two years ago.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
