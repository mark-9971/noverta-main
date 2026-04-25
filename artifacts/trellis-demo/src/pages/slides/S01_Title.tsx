const base = import.meta.env.BASE_URL;

export default function S01_Title() {
  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <img src={`${base}hero-teacher.png`} crossOrigin="anonymous" className="absolute inset-0 w-full h-full object-cover" alt="Teacher and student" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#022c22]/90 via-[#022c22]/70 to-transparent" />
      <div className="relative z-10 flex flex-col justify-center h-full pl-[8vw] pr-[40vw]">
        <div className="flex items-center gap-[1.5vw] mb-[3vh]">
          <div className="w-[4vw] h-[4vw] rounded-[1vw] bg-primary flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="w-[2.5vw] h-[2.5vw]">
              <path d="M12 22c0-4-3-7-7-7m7 7c0-4 3-7 7-7M12 22V12m0 0c-2-4-5-6-8-7m8 7c2-4 5-6 8-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="font-display text-[2.5vw] font-bold text-white tracking-tight">Noverta</span>
        </div>
        <h1 className="font-display text-[5.5vw] font-extrabold text-white leading-[1.05] tracking-tighter mb-[2vh]">Built to Support.</h1>
        <p className="font-body text-[1.8vw] text-emerald-200/90 leading-relaxed max-w-[35vw]">The compliance and clinical platform purpose-built for special education.</p>
        <div className="mt-[5vh] flex items-center gap-[2vw]">
          <div className="w-[5vw] h-[0.3vh] bg-primary rounded-full" />
          <span className="font-body text-[1.3vw] text-emerald-300/70 tracking-wide uppercase">Demo Walkthrough</span>
        </div>
      </div>
    </div>
  );
}
