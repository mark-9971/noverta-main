const base = import.meta.env.BASE_URL;

export default function ClosingSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-dark">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(16,185,129,0.08)_0%,_transparent_70%)]" />
      <div className="absolute top-0 left-0 w-full h-[0.3vh] bg-gradient-to-r from-transparent via-accent to-transparent" />

      <div className="relative z-10 flex flex-col items-center justify-center h-full text-center px-[10vw]">
        <div className="w-[6vw] h-[6vw] rounded-[1.2vw] bg-primary flex items-center justify-center mb-[3vh]">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[3.5vw] h-[3.5vw]">
            <path d="M7 20h10" />
            <path d="M10 20c5.5-2.5.8-6.4 3-10" />
            <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" />
            <path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />
          </svg>
        </div>

        <h2 className="font-display text-[5vw] font-extrabold text-white tracking-tight leading-[1.05]">
          Let's build the future of
        </h2>
        <h2 className="font-display text-[5vw] font-extrabold text-accent tracking-tight leading-[1.05]">
          special education.
        </h2>

        <p className="font-body text-[1.8vw] text-white/50 mt-[3vh] max-w-[50vw] leading-relaxed">
          Whether you're a district ready to modernize, an investor looking at EdTech infrastructure, or an SIS partner seeking a SPED solution -- we're ready to talk.
        </p>

        <div className="mt-[5vh] flex items-center gap-[4vw]">
          <div className="bg-white/5 border border-white/10 rounded-[0.8vw] px-[2.5vw] py-[2vh] text-center">
            <p className="font-body text-[1.3vw] text-white/40 mb-[0.5vh]">Schedule a Demo</p>
            <p className="font-body text-[1.6vw] text-accent font-semibold">demo@trellised.com</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-[0.8vw] px-[2.5vw] py-[2vh] text-center">
            <p className="font-body text-[1.3vw] text-white/40 mb-[0.5vh]">Partnerships</p>
            <p className="font-body text-[1.6vw] text-white font-semibold">partners@trellised.com</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-[0.8vw] px-[2.5vw] py-[2vh] text-center">
            <p className="font-body text-[1.3vw] text-white/40 mb-[0.5vh]">Website</p>
            <p className="font-body text-[1.6vw] text-white font-semibold">trellised.com</p>
          </div>
        </div>

        <div className="mt-[4vh] bg-accent/10 border border-accent/20 rounded-[0.6vw] px-[2vw] py-[1vh]">
          <p className="font-body text-[1.2vw] text-accent font-semibold">60-day pilot program available -- full features, no commitment</p>
        </div>
      </div>
    </div>
  );
}
