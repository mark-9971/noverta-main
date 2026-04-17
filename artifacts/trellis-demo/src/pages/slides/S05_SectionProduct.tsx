export default function S05_SectionProduct() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-dark">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent" />
      <div className="absolute bottom-0 right-0 w-[50vw] h-[50vh] bg-primary/10 rounded-tl-[15vw]" />
      <div className="relative z-10 flex flex-col justify-center h-full px-[8vw]">
        <div className="w-[6vw] h-[0.4vh] bg-primary rounded-full mb-[3vh]" />
        <h2 className="font-display text-[6vw] font-extrabold text-white tracking-tighter leading-[1]">The Product</h2>
        <p className="font-body text-[2vw] text-emerald-300/70 mt-[3vh] max-w-[50vw]">One platform. Every workflow. Total visibility.</p>
      </div>
    </div>
  );
}
