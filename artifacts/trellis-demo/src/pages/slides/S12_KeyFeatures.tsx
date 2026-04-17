export default function S12_KeyFeatures() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gradient-to-br from-[#f8f9fa] to-[#ecfdf5]">
      <div className="absolute top-0 right-0 w-[35vw] h-[35vh] bg-primary/5 rounded-bl-[10vw]" />
      <div className="relative z-10 flex flex-col justify-center h-full px-[8vw]">
        <p className="font-body text-[1.4vw] text-primary font-semibold tracking-widest uppercase mb-[2vh]">Platform Capabilities</p>
        <h2 className="font-display text-[3.5vw] font-bold text-text tracking-tight leading-[1.1] mb-[5vh]">Everything in one place.</h2>
        <div className="grid grid-cols-3 gap-[2.5vw]">
          <div className="bg-white rounded-[1vw] p-[2vw] border border-gray-100 shadow-sm">
            <div className="w-[3vw] h-[3vw] rounded-[0.5vw] bg-primary/10 flex items-center justify-center mb-[1.5vh]">
              <span className="font-display text-[1.5vw] font-bold text-primary">IEP</span>
            </div>
            <p className="font-body text-[1.5vw] font-semibold text-text mb-[0.5vh]">IEP Goal Tracking</p>
            <p className="font-body text-[1.3vw] text-muted">Progress monitoring with clinical data graphs and mastery tracking.</p>
          </div>
          <div className="bg-white rounded-[1vw] p-[2vw] border border-gray-100 shadow-sm">
            <div className="w-[3vw] h-[3vw] rounded-[0.5vw] bg-amber-50 flex items-center justify-center mb-[1.5vh]">
              <span className="font-display text-[1.3vw] font-bold text-warm">ABA</span>
            </div>
            <p className="font-body text-[1.5vw] font-semibold text-text mb-[0.5vh]">Behavior Analytics</p>
            <p className="font-body text-[1.3vw] text-muted">Frequency, duration, and percentage tracking with trend visualization.</p>
          </div>
          <div className="bg-white rounded-[1vw] p-[2vw] border border-gray-100 shadow-sm">
            <div className="w-[3vw] h-[3vw] rounded-[0.5vw] bg-blue-50 flex items-center justify-center mb-[1.5vh]">
              <span className="font-display text-[1.2vw] font-bold text-blue-600">PDF</span>
            </div>
            <p className="font-body text-[1.5vw] font-semibold text-text mb-[0.5vh]">AI IEP Import</p>
            <p className="font-body text-[1.3vw] text-muted">Upload an IEP PDF and auto-extract goals, services, and accommodations.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
