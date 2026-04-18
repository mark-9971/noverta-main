export default function CompetitionSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-gradient-to-br from-[#fafafa] to-[#f0fdf4]">
      <div className="absolute bottom-0 left-0 w-[25vw] h-[25vw] rounded-full bg-primary/5 -translate-x-[8vw] translate-y-[8vw]" />

      <div className="relative z-10 flex flex-col h-full px-[7vw] py-[6vh]">
        <p className="font-body text-[1.3vw] font-semibold text-primary tracking-[0.15em] uppercase mb-[1vh]">Competitive Landscape</p>
        <h2 className="font-display text-[3.5vw] font-bold text-text tracking-tight leading-[1.1]">
          Purpose-built beats bolted-on
        </h2>

        <div className="mt-[4vh] flex-1">
          <div className="bg-white rounded-[1vw] border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-6 bg-gray-50 border-b border-gray-200">
              <div className="px-[1.5vw] py-[1.5vh]">
                <p className="font-body text-[1vw] font-semibold text-muted">Capability</p>
              </div>
              <div className="px-[1vw] py-[1.5vh] text-center border-l border-gray-200 bg-primary/5">
                <p className="font-body text-[1vw] font-bold text-primary">Trellis</p>
              </div>
              <div className="px-[1vw] py-[1.5vh] text-center border-l border-gray-200">
                <p className="font-body text-[1vw] font-semibold text-muted">Generic SIS</p>
              </div>
              <div className="px-[1vw] py-[1.5vh] text-center border-l border-gray-200">
                <p className="font-body text-[1vw] font-semibold text-muted">SpedTrack</p>
              </div>
              <div className="px-[1vw] py-[1.5vh] text-center border-l border-gray-200">
                <p className="font-body text-[1vw] font-semibold text-muted">Frontline</p>
              </div>
              <div className="px-[1vw] py-[1.5vh] text-center border-l border-gray-200">
                <p className="font-body text-[1vw] font-semibold text-muted">Spreadsheets</p>
              </div>
            </div>

            {[
              { cap: "Real-time compliance scoring", t: true, sis: false, sp: "partial", fl: "partial", ss: false },
              { cap: "Clinical ABA data collection", t: true, sis: false, sp: false, fl: false, ss: false },
              { cap: "Restraint / 603 CMR 46 workflows", t: true, sis: false, sp: "partial", fl: false, ss: false },
              { cap: "Guardian portal with messaging", t: true, sis: "partial", sp: false, fl: false, ss: false },
              { cap: "IEP goal progress tracking", t: true, sis: false, sp: true, fl: true, ss: "partial" },
              { cap: "Roster import (CSV today; live SIS in pilot)", t: "partial", sis: true, sp: "partial", fl: "partial", ss: false },
              { cap: "Compensatory services calculator", t: true, sis: false, sp: false, fl: false, ss: false },
              { cap: "Multi-role access (9 roles)", t: true, sis: "partial", sp: "partial", fl: "partial", ss: false },
            ].map((row, i) => (
              <div key={i} className={`grid grid-cols-6 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"} border-b border-gray-100 last:border-b-0`}>
                <div className="px-[1.5vw] py-[1.2vh] flex items-center">
                  <p className="font-body text-[1vw] text-text">{row.cap}</p>
                </div>
                {[row.t, row.sis, row.sp, row.fl, row.ss].map((val, j) => (
                  <div key={j} className={`px-[1vw] py-[1.2vh] flex items-center justify-center border-l border-gray-100 ${j === 0 ? "bg-primary/5" : ""}`}>
                    {val === true ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3" className="w-[1.2vw] h-[1.2vw]"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : val === "partial" ? (
                      <div className="w-[1vw] h-[0.2vh] bg-amber-400 rounded-full" />
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2.5" className="w-[1vw] h-[1vw]"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-[3vw] mt-[2.5vh] px-[1vw]">
            <div className="flex items-center gap-[0.5vw]">
              <svg viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3" className="w-[1vw] h-[1vw]"><polyline points="20 6 9 17 4 12"/></svg>
              <p className="font-body text-[1vw] text-muted">Full support</p>
            </div>
            <div className="flex items-center gap-[0.5vw]">
              <div className="w-[1vw] h-[0.2vh] bg-amber-400 rounded-full" />
              <p className="font-body text-[1vw] text-muted">Partial / manual</p>
            </div>
            <div className="flex items-center gap-[0.5vw]">
              <svg viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2.5" className="w-[0.8vw] h-[0.8vw]"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              <p className="font-body text-[1vw] text-muted">Not available</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
