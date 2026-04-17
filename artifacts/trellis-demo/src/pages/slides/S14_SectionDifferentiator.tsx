export default function S14_SectionDifferentiator() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-dark">
      <div className="absolute inset-0 bg-gradient-to-tl from-primary/20 to-transparent" />
      <div className="absolute top-[10vh] left-[5vw] w-[30vw] h-[30vw] rounded-full border border-emerald-800/30" />
      <div className="relative z-10 flex flex-col justify-center h-full px-[8vw]">
        <div className="w-[6vw] h-[0.4vh] bg-warm rounded-full mb-[3vh]" />
        <h2 className="font-display text-[6vw] font-extrabold text-white tracking-tighter leading-[1]">What Makes</h2>
        <h2 className="font-display text-[6vw] font-extrabold text-primary tracking-tighter leading-[1]">It Different</h2>
        <p className="font-body text-[2vw] text-emerald-300/70 mt-[3vh] max-w-[50vw]">Built by someone who understands both the clinical and compliance sides.</p>
      </div>
    </div>
  );
}
