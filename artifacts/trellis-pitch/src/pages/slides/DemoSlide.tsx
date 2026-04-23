export default function DemoSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-gradient-to-br from-[#fafafa] to-[#f0fdf4]">
      <div className="absolute top-0 left-0 w-full h-[0.3vh] bg-gradient-to-r from-primary via-accent to-transparent" />

      <div className="relative z-10 flex flex-col h-full px-[7vw] py-[5vh]">
        <p className="font-body text-[1.3vw] font-semibold text-primary tracking-[0.15em] uppercase mb-[1vh]">Live Platform</p>
        <h2 className="font-display text-[3.5vw] font-bold text-text tracking-tight leading-[1.1]">
          See Noverta in action
        </h2>
        <p className="font-body text-[1.5vw] text-muted mt-[1vh] max-w-[55vw]">
          A unified dashboard gives every role -- from BCBA to district admin -- exactly what they need.
        </p>

        <div className="flex gap-[2.5vw] mt-[3vh] flex-1">
          <div className="flex-[1.5] bg-white rounded-[1vw] border border-gray-200 shadow-lg overflow-hidden flex flex-col">
            <div className="bg-gray-50 border-b border-gray-200 px-[1.5vw] py-[1vh] flex items-center gap-[0.8vw]">
              <div className="flex gap-[0.4vw]">
                <div className="w-[0.6vw] h-[0.6vw] rounded-full bg-red-400" />
                <div className="w-[0.6vw] h-[0.6vw] rounded-full bg-amber-400" />
                <div className="w-[0.6vw] h-[0.6vw] rounded-full bg-green-400" />
              </div>
              <p className="font-body text-[0.9vw] text-muted">app.trellised.com/students/detail</p>
            </div>
            <div className="flex-1 p-[1.5vw] flex flex-col gap-[1.5vh]">
              <div className="flex items-center gap-[1vw]">
                <div className="w-[3vw] h-[3vw] bg-emerald-100 rounded-[0.6vw] flex items-center justify-center">
                  <span className="font-body text-[1.2vw] font-bold text-primary">JD</span>
                </div>
                <div>
                  <p className="font-body text-[1.3vw] font-bold text-text">Jane Doe</p>
                  <p className="font-body text-[0.9vw] text-muted">Grade 4 -- Autism -- 92% Progress</p>
                </div>
                <div className="ml-auto flex gap-[0.5vw]">
                  <span className="font-body text-[0.8vw] bg-emerald-100 text-primary px-[0.6vw] py-[0.3vh] rounded-full font-semibold">On Track</span>
                  <span className="font-body text-[0.8vw] bg-blue-100 text-blue-700 px-[0.6vw] py-[0.3vh] rounded-full font-semibold">IEP Active</span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-[0.8vw]">
                <div className="bg-emerald-50 rounded-[0.5vw] p-[0.8vw] text-center">
                  <p className="font-display text-[1.8vw] font-bold text-primary">92%</p>
                  <p className="font-body text-[0.7vw] text-muted">Progress</p>
                </div>
                <div className="bg-emerald-50 rounded-[0.5vw] p-[0.8vw] text-center">
                  <p className="font-display text-[1.8vw] font-bold text-primary">340<span className="text-[0.9vw] text-muted">/360</span></p>
                  <p className="font-body text-[0.7vw] text-muted">Minutes</p>
                </div>
                <div className="bg-emerald-50 rounded-[0.5vw] p-[0.8vw] text-center">
                  <p className="font-display text-[1.8vw] font-bold text-primary">28</p>
                  <p className="font-body text-[0.7vw] text-muted">Sessions</p>
                </div>
                <div className="bg-red-50 rounded-[0.5vw] p-[0.8vw] text-center">
                  <p className="font-display text-[1.8vw] font-bold text-red-500">2</p>
                  <p className="font-body text-[0.7vw] text-muted">Missed</p>
                </div>
              </div>

              <div className="flex gap-[0.8vw] flex-1">
                <div className="flex-1 bg-gray-50 rounded-[0.5vw] p-[1vw]">
                  <p className="font-body text-[0.9vw] font-semibold text-text mb-[0.8vh]">IEP Goal Progress</p>
                  <div className="space-y-[0.6vh]">
                    <div className="flex items-center gap-[0.5vw]">
                      <div className="flex-1 h-[0.5vh] bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{width: "85%"}} /></div>
                      <span className="font-body text-[0.7vw] text-muted w-[3vw] text-right">85%</span>
                    </div>
                    <div className="flex items-center gap-[0.5vw]">
                      <div className="flex-1 h-[0.5vh] bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{width: "92%"}} /></div>
                      <span className="font-body text-[0.7vw] text-muted w-[3vw] text-right">92%</span>
                    </div>
                    <div className="flex items-center gap-[0.5vw]">
                      <div className="flex-1 h-[0.5vh] bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-amber-400 rounded-full" style={{width: "67%"}} /></div>
                      <span className="font-body text-[0.7vw] text-muted w-[3vw] text-right">67%</span>
                    </div>
                  </div>
                </div>
                <div className="flex-1 bg-gray-50 rounded-[0.5vw] p-[1vw]">
                  <p className="font-body text-[0.9vw] font-semibold text-text mb-[0.8vh]">Compliance Status</p>
                  <div className="space-y-[0.6vh]">
                    <div className="flex items-center justify-between">
                      <span className="font-body text-[0.8vw] text-muted">Speech/Language</span>
                      <span className="font-body text-[0.7vw] bg-emerald-100 text-primary px-[0.5vw] py-[0.2vh] rounded font-semibold">Compliant</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-body text-[0.8vw] text-muted">OT Services</span>
                      <span className="font-body text-[0.7vw] bg-emerald-100 text-primary px-[0.5vw] py-[0.2vh] rounded font-semibold">Compliant</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-body text-[0.8vw] text-muted">Counseling</span>
                      <span className="font-body text-[0.7vw] bg-amber-100 text-amber-700 px-[0.5vw] py-[0.2vh] rounded font-semibold">At Risk</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-[2vh]">
            <div className="bg-white rounded-[1vw] border border-gray-200 p-[1.5vw] flex-1">
              <p className="font-body text-[1.1vw] font-bold text-text mb-[1vh]">Key Workflows</p>
              <div className="space-y-[1.2vh]">
                <div className="flex items-start gap-[0.8vw]">
                  <div className="w-[1.8vw] h-[1.8vw] rounded-[0.4vw] bg-primary/10 flex items-center justify-center shrink-0 mt-[0.2vh]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" className="w-[1vw] h-[1vw]"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                  </div>
                  <div>
                    <p className="font-body text-[1vw] font-semibold text-text">Session Logging</p>
                    <p className="font-body text-[0.8vw] text-muted">Providers log minutes with timer, notes, and auto-calculated compliance</p>
                  </div>
                </div>
                <div className="flex items-start gap-[0.8vw]">
                  <div className="w-[1.8vw] h-[1.8vw] rounded-[0.4vw] bg-primary/10 flex items-center justify-center shrink-0 mt-[0.2vh]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" className="w-[1vw] h-[1vw]"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  </div>
                  <div>
                    <p className="font-body text-[1vw] font-semibold text-text">IEP Draft Builder</p>
                    <p className="font-body text-[0.8vw] text-muted">Template-based goal drafting from progress data + MA curriculum frameworks</p>
                  </div>
                </div>
                <div className="flex items-start gap-[0.8vw]">
                  <div className="w-[1.8vw] h-[1.8vw] rounded-[0.4vw] bg-primary/10 flex items-center justify-center shrink-0 mt-[0.2vh]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" className="w-[1vw] h-[1vw]"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  </div>
                  <div>
                    <p className="font-body text-[1vw] font-semibold text-text">Restraint Documentation</p>
                    <p className="font-body text-[0.8vw] text-muted">603 CMR 46 compliant with multi-step workflows and parent notification</p>
                  </div>
                </div>
                <div className="flex items-start gap-[0.8vw]">
                  <div className="w-[1.8vw] h-[1.8vw] rounded-[0.4vw] bg-primary/10 flex items-center justify-center shrink-0 mt-[0.2vh]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" className="w-[1vw] h-[1vw]"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  </div>
                  <div>
                    <p className="font-body text-[1vw] font-semibold text-text">ABA Data Collection</p>
                    <p className="font-body text-[0.8vw] text-muted">DTT, interval recording, and FBA/BIP with phase-change graphing</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
