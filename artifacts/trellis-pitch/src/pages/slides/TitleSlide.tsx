const base = import.meta.env.BASE_URL;

export default function TitleSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative">
      <img
        src={`${base}hero.png`}
        crossOrigin="anonymous"
        className="absolute inset-0 w-full h-full object-cover"
        alt="Modern school building"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#022c22]/90 via-[#022c22]/70 to-transparent" />

      <div className="absolute top-[6vh] left-[6vw] flex items-center gap-[1vw]">
        <div className="w-[3.5vw] h-[3.5vw] rounded-[0.8vw] bg-primary flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[2vw] h-[2vw]">
            <path d="M7 20h10" />
            <path d="M10 20c5.5-2.5.8-6.4 3-10" />
            <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" />
            <path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />
          </svg>
        </div>
        <span className="font-body text-[1.8vw] font-semibold text-white/90 tracking-wide">Trellis</span>
      </div>

      <div className="absolute bottom-[12vh] left-[6vw] max-w-[55vw]">
        <p className="font-body text-[1.5vw] font-semibold text-accent tracking-[0.15em] uppercase mb-[2vh]">Investor Pitch</p>
        <h1 className="font-display text-[5.5vw] font-extrabold text-white leading-[1.05] tracking-tight">
          Built to support.
        </h1>
        <p className="font-body text-[2vw] text-white/70 mt-[3vh] leading-relaxed max-w-[45vw]">
          The compliance and clinical platform special education schools actually need.
        </p>
      </div>

      <div className="absolute bottom-[6vh] right-[6vw]">
        <p className="font-body text-[1.3vw] text-white/40">April 2026</p>
      </div>
    </div>
  );
}
