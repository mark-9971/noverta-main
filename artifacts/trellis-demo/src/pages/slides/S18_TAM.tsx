export default function S18_TAM() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gradient-to-br from-[#f8f9fa] to-[#ecfdf5]">
      <div className="absolute top-0 right-0 w-[40vw] h-[40vh] bg-primary/5 rounded-bl-[10vw]" />
      <div className="relative z-10 flex flex-col justify-center h-full px-[8vw]">
        <p className="font-body text-[1.4vw] text-primary font-semibold tracking-widest uppercase mb-[2vh]">Market Opportunity</p>
        <h2 className="font-display text-[3.5vw] font-bold text-text tracking-tight leading-[1.1] mb-[5vh]">A multi-billion dollar market.</h2>
        <div className="flex gap-[4vw] items-end">
          <div className="flex-1 text-center">
            <div className="bg-primary/10 rounded-[1vw] p-[2.5vw] mb-[2vh]">
              <p className="font-display text-[5vw] font-extrabold text-primary tracking-tight">$3.2B</p>
            </div>
            <p className="font-body text-[1.5vw] font-semibold text-text">U.S. Special Ed Software</p>
            <p className="font-body text-[1.2vw] text-muted mt-[0.5vh]">TAM (2025, Market Reports World)</p>
          </div>
          <div className="flex-1 text-center">
            <div className="bg-amber-50 rounded-[1vw] p-[2.5vw] mb-[2vh]">
              <p className="font-display text-[5vw] font-extrabold text-warm tracking-tight">11.5%</p>
            </div>
            <p className="font-body text-[1.5vw] font-semibold text-text">Annual Growth Rate</p>
            <p className="font-body text-[1.2vw] text-muted mt-[0.5vh]">CAGR through 2032</p>
          </div>
          <div className="flex-1 text-center">
            <div className="bg-blue-50 rounded-[1vw] p-[2.5vw] mb-[2vh]">
              <p className="font-display text-[5vw] font-extrabold text-blue-600 tracking-tight">7.5M</p>
            </div>
            <p className="font-body text-[1.5vw] font-semibold text-text">Students with IEPs</p>
            <p className="font-body text-[1.2vw] text-muted mt-[0.5vh]">In U.S. public schools (IDEA)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
