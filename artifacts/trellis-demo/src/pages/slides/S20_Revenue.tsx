export default function S20_Revenue() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gradient-to-br from-[#f8f9fa] to-[#ecfdf5]">
      <div className="absolute bottom-0 right-0 w-[35vw] h-[35vh] bg-primary/5 rounded-tl-[10vw]" />
      <div className="relative z-10 flex flex-col justify-center h-full px-[8vw]">
        <p className="font-body text-[1.4vw] text-primary font-semibold tracking-widest uppercase mb-[2vh]">Revenue Model</p>
        <h2 className="font-display text-[3.5vw] font-bold text-text tracking-tight leading-[1.1] mb-[5vh]">SaaS pricing that scales with districts.</h2>
        <div className="grid grid-cols-3 gap-[3vw]">
          <div className="bg-white rounded-[1vw] p-[2.5vw] border border-gray-100 shadow-sm">
            <p className="font-body text-[1.3vw] text-muted font-medium uppercase tracking-wider mb-[1vh]">Essentials</p>
            <p className="font-display text-[2.5vw] font-bold text-text mb-[0.5vh]">$8</p>
            <p className="font-body text-[1.3vw] text-muted mb-[2vh]">per student / month</p>
            <div className="w-full h-[0.2vh] bg-gray-100 mb-[2vh]" />
            <p className="font-body text-[1.3vw] text-muted">Compliance tracking, session logging, basic alerts.</p>
          </div>
          <div className="bg-dark rounded-[1vw] p-[2.5vw] border-2 border-primary shadow-lg relative">
            <div className="absolute -top-[1.5vh] left-1/2 -translate-x-1/2 bg-primary text-white px-[1.5vw] py-[0.3vh] rounded-full font-body text-[1vw] font-semibold">Most Popular</div>
            <p className="font-body text-[1.3vw] text-emerald-300 font-medium uppercase tracking-wider mb-[1vh]">Professional</p>
            <p className="font-display text-[2.5vw] font-bold text-white mb-[0.5vh]">$14</p>
            <p className="font-body text-[1.3vw] text-emerald-300/70 mb-[2vh]">per student / month</p>
            <div className="w-full h-[0.2vh] bg-emerald-800/30 mb-[2vh]" />
            <p className="font-body text-[1.3vw] text-emerald-100/80">Full clinical data, AI-assisted IEP import, Medicaid claim prep, behavior analytics.</p>
          </div>
          <div className="bg-white rounded-[1vw] p-[2.5vw] border border-gray-100 shadow-sm">
            <p className="font-body text-[1.3vw] text-muted font-medium uppercase tracking-wider mb-[1vh]">Enterprise</p>
            <p className="font-display text-[2.5vw] font-bold text-text mb-[0.5vh]">Custom</p>
            <p className="font-body text-[1.3vw] text-muted mb-[2vh]">district-wide license</p>
            <div className="w-full h-[0.2vh] bg-gray-100 mb-[2vh]" />
            <p className="font-body text-[1.3vw] text-muted">SIS integration, SSO, custom reporting, dedicated support.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
