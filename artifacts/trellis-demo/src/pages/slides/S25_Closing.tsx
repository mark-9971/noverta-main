const base = import.meta.env.BASE_URL;

export default function S25_Closing() {
  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <img src={`${base}parent-child-school.png`} crossOrigin="anonymous" className="absolute inset-0 w-full h-full object-cover" alt="Parent and child at school" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#022c22]/95 via-[#022c22]/70 to-[#022c22]/40" />
      <div className="relative z-10 flex flex-col justify-end h-full px-[8vw] pb-[10vh]">
        <div className="flex items-center gap-[1.5vw] mb-[3vh]">
          <div className="w-[4vw] h-[4vw] rounded-[1vw] bg-primary flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="w-[2.5vw] h-[2.5vw]">
              <path d="M12 22c0-4-3-7-7-7m7 7c0-4 3-7 7-7M12 22V12m0 0c-2-4-5-6-8-7m8 7c2-4 5-6 8-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="font-display text-[2.5vw] font-bold text-white tracking-tight">Trellis</span>
        </div>
        <h2 className="font-display text-[5vw] font-extrabold text-white tracking-tighter leading-[1.05] mb-[2vh]">Built to support.</h2>
        <p className="font-body text-[1.8vw] text-emerald-200/80 leading-relaxed max-w-[50vw] mb-[4vh]">Every student deserves a team that has the tools to do their job. Trellis makes that possible.</p>
        <div className="w-[8vw] h-[0.3vh] bg-primary rounded-full" />
      </div>
    </div>
  );
}
