export default function S19_Massachusetts() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gradient-to-br from-[#f8f9fa] to-[#fef3c7]/20">
      <div className="relative z-10 flex flex-col justify-center h-full px-[8vw]">
        <p className="font-body text-[1.4vw] text-warm font-semibold tracking-widest uppercase mb-[2vh]">Beachhead Market</p>
        <h2 className="font-display text-[3.5vw] font-bold text-text tracking-tight leading-[1.1] mb-[5vh]">Starting in Massachusetts.</h2>
        <div className="flex gap-[4vw]">
          <div className="flex-1">
            <div className="bg-white rounded-[1vw] p-[2.5vw] border border-gray-100 shadow-sm">
              <p className="font-display text-[3.5vw] font-extrabold text-text tracking-tight mb-[1vh]">400</p>
              <p className="font-body text-[1.5vw] font-semibold text-text">School Districts</p>
              <p className="font-body text-[1.3vw] text-muted mt-[1vh]">Each with dedicated SPED departments requiring compliance software.</p>
            </div>
          </div>
          <div className="flex-1">
            <div className="bg-white rounded-[1vw] p-[2.5vw] border border-gray-100 shadow-sm">
              <p className="font-display text-[3.5vw] font-extrabold text-text tracking-tight mb-[1vh]">185K</p>
              <p className="font-body text-[1.5vw] font-semibold text-text">Students on IEPs</p>
              <p className="font-body text-[1.3vw] text-muted mt-[1vh]">Massachusetts has one of the highest SPED identification rates in the country.</p>
            </div>
          </div>
          <div className="flex-1">
            <div className="bg-white rounded-[1vw] p-[2.5vw] border border-gray-100 shadow-sm">
              <p className="font-display text-[3.5vw] font-extrabold text-text tracking-tight mb-[1vh]">$4.2B</p>
              <p className="font-body text-[1.5vw] font-semibold text-text">Annual SPED Spend</p>
              <p className="font-body text-[1.3vw] text-muted mt-[1vh]">MA districts spend heavily on special education -- compliance failures are costly.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
