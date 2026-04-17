export default function S21_UnitEconomics() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gradient-to-br from-[#f8f9fa] to-[#ecfdf5]">
      <div className="absolute top-0 left-0 w-[25vw] h-[25vh] bg-primary/5 rounded-br-[8vw]" />
      <div className="relative z-10 flex flex-col justify-center h-full px-[8vw]">
        <p className="font-body text-[1.4vw] text-primary font-semibold tracking-widest uppercase mb-[2vh]">Back-of-Napkin Math</p>
        <h2 className="font-display text-[3.5vw] font-bold text-text tracking-tight leading-[1.1] mb-[5vh]">The numbers work.</h2>
        <div className="flex gap-[3vw]">
          <div className="flex-1 bg-white rounded-[1vw] p-[2.5vw] border border-gray-100 shadow-sm">
            <p className="font-body text-[1.3vw] text-muted font-medium uppercase tracking-wider mb-[2vh]">Just Massachusetts</p>
            <div className="flex items-baseline gap-[0.5vw] mb-[1vh]">
              <p className="font-display text-[3vw] font-extrabold text-primary">$31M</p>
              <p className="font-body text-[1.3vw] text-muted">ARR potential</p>
            </div>
            <p className="font-body text-[1.3vw] text-muted">185K students x $14/mo = $31M annual addressable revenue in MA alone.</p>
          </div>
          <div className="flex-1 bg-white rounded-[1vw] p-[2.5vw] border border-gray-100 shadow-sm">
            <p className="font-body text-[1.3vw] text-muted font-medium uppercase tracking-wider mb-[2vh]">First 10 Districts</p>
            <div className="flex items-baseline gap-[0.5vw] mb-[1vh]">
              <p className="font-display text-[3vw] font-extrabold text-warm">$840K</p>
              <p className="font-body text-[1.3vw] text-muted">year one target</p>
            </div>
            <p className="font-body text-[1.3vw] text-muted">10 districts avg. 500 SPED students each, Professional tier. Achievable in year one.</p>
          </div>
          <div className="flex-1 bg-white rounded-[1vw] p-[2.5vw] border border-gray-100 shadow-sm">
            <p className="font-body text-[1.3vw] text-muted font-medium uppercase tracking-wider mb-[2vh]">National Scale</p>
            <div className="flex items-baseline gap-[0.5vw] mb-[1vh]">
              <p className="font-display text-[3vw] font-extrabold text-blue-600">$1.26B</p>
              <p className="font-body text-[1.3vw] text-muted">full TAM</p>
            </div>
            <p className="font-body text-[1.3vw] text-muted">7.5M U.S. students on IEPs x $14/mo. Every state has the same compliance requirements.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
