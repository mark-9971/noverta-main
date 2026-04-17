export default function S17_SectionMarket() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-dark">
      <div className="absolute inset-0 bg-gradient-to-br from-transparent to-primary/15" />
      <div className="absolute bottom-[10vh] right-[8vw] w-[25vw] h-[25vw] rounded-full border border-emerald-800/20" />
      <div className="absolute bottom-[15vh] right-[12vw] w-[15vw] h-[15vw] rounded-full border border-emerald-800/15" />
      <div className="relative z-10 flex flex-col justify-center h-full px-[8vw]">
        <div className="w-[6vw] h-[0.4vh] bg-warm rounded-full mb-[3vh]" />
        <h2 className="font-display text-[6vw] font-extrabold text-white tracking-tighter leading-[1]">The Market</h2>
        <p className="font-body text-[2vw] text-emerald-300/70 mt-[3vh] max-w-[50vw]">Large, growing, and underserved.</p>
      </div>
    </div>
  );
}
