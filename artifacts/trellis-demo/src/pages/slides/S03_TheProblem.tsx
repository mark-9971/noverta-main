const base = import.meta.env.BASE_URL;

export default function S03_TheProblem() {
  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <img src={`${base}overwhelmed-admin.png`} crossOrigin="anonymous" className="absolute inset-0 w-full h-full object-cover" alt="Overwhelmed administrator" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#022c22]/95 via-[#022c22]/80 to-[#022c22]/50" />
      <div className="relative z-10 flex flex-col justify-end h-full px-[8vw] pb-[8vh]">
        <p className="font-body text-[1.4vw] text-amber-400 font-semibold tracking-widest uppercase mb-[2vh]">The Problem</p>
        <h2 className="font-display text-[4.5vw] font-bold text-white tracking-tight leading-[1.1] mb-[3vh]">Special Ed is drowning in compliance.</h2>
        <p className="font-body text-[1.8vw] text-emerald-100/80 leading-relaxed max-w-[55vw]">Districts juggle 5-10 disconnected tools, miss IEP deadlines, lose Medicaid revenue, and risk federal violations -- all while staff burnout accelerates.</p>
      </div>
    </div>
  );
}
