const base = import.meta.env.BASE_URL;

export default function S01_Title() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <img
        src={`${base}hero-folders.png`}
        crossOrigin="anonymous"
        alt="Color-coded student case folders on a desk"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-primary/85 via-primary/55 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-primary/40 to-transparent" />

      <div className="relative h-full flex flex-col justify-between px-[7vw] py-[7vh] text-bg">
        <div className="flex items-center gap-[1vw]">
          <span className="block w-[3vw] h-[0.25vh] bg-accent" />
          <span className="font-body uppercase tracking-[0.35em] text-[1.1vw] text-bg/80">
            Trellis · Seed Round · 2026
          </span>
        </div>

        <div className="max-w-[68vw]">
          <p className="font-body uppercase tracking-[0.3em] text-[1.2vw] text-gold mb-[3vh]">
            A new operating system for special education
          </p>
          <h1 className="font-display font-light text-[8.5vw] leading-[0.92] tracking-tight">
            Every student.
            <span className="block italic font-normal text-accent">Every minute.</span>
            <span className="block">Accounted for.</span>
          </h1>
        </div>

        <div className="flex items-end justify-between">
          <div className="font-body text-[1.2vw] text-bg/85 max-w-[34vw] leading-relaxed">
            Trellis is the compliance, scheduling, and service-delivery platform built specifically for Massachusetts special education teams.
          </div>
          <div className="font-display italic text-[1.4vw] text-bg/70">
            Vol. 01 — Investor brief
          </div>
        </div>
      </div>
    </div>
  );
}
