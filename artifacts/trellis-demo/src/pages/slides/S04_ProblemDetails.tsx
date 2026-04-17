export default function S04_ProblemDetails() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gradient-to-br from-[#f8f9fa] to-[#fef3c7]/30">
      <div className="absolute top-[5vh] right-[5vw] w-[20vw] h-[20vw] rounded-full bg-amber-100/40" />
      <div className="relative z-10 flex flex-col justify-center h-full px-[8vw]">
        <p className="font-body text-[1.4vw] text-warm font-semibold tracking-widest uppercase mb-[2vh]">Why This Matters</p>
        <h2 className="font-display text-[3.5vw] font-bold text-text tracking-tight leading-[1.1] mb-[5vh]">Every missed minute is a liability.</h2>
        <div className="grid grid-cols-3 gap-[3vw]">
          <div className="bg-white/80 rounded-[1vw] p-[2vw] border border-gray-100">
            <p className="font-display text-[3vw] font-bold text-red-600 mb-[1vh]">$436</p>
            <p className="font-body text-[1.5vw] text-text font-medium mb-[1vh]">Avg. compensatory cost per missed service</p>
            <p className="font-body text-[1.3vw] text-muted">Districts owe families makeup sessions when IEP minutes go undelivered.</p>
          </div>
          <div className="bg-white/80 rounded-[1vw] p-[2vw] border border-gray-100">
            <p className="font-display text-[3vw] font-bold text-warm mb-[1vh]">67%</p>
            <p className="font-body text-[1.5vw] text-text font-medium mb-[1vh]">Of SPED staff say paperwork is their top burden</p>
            <p className="font-body text-[1.3vw] text-muted">Staff spend more time documenting than teaching. Burnout is epidemic.</p>
          </div>
          <div className="bg-white/80 rounded-[1vw] p-[2vw] border border-gray-100">
            <p className="font-display text-[3vw] font-bold text-primary mb-[1vh]">5-10</p>
            <p className="font-body text-[1.5vw] text-text font-medium mb-[1vh]">Tools a typical district uses for SPED</p>
            <p className="font-body text-[1.3vw] text-muted">Spreadsheets, paper forms, SIS add-ons, email -- none of them talk to each other.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
