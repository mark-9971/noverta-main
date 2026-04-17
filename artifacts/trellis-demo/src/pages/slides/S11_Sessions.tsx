const base = import.meta.env.BASE_URL;

export default function S11_Sessions() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gradient-to-br from-[#f8f9fa] to-[#ecfdf5]">
      <div className="relative z-10 flex flex-col h-full px-[5vw] py-[4vh]">
        <div className="flex items-center justify-between mb-[2vh]">
          <div>
            <p className="font-body text-[1.3vw] text-primary font-semibold tracking-widest uppercase mb-[0.5vh]">Service Delivery</p>
            <h2 className="font-display text-[3vw] font-bold text-text tracking-tight">Session Logging Made Simple</h2>
          </div>
          <div className="bg-primary/10 rounded-[0.5vw] px-[1.5vw] py-[0.8vh]">
            <p className="font-body text-[1.2vw] text-primary font-semibold">Actual Screenshot</p>
          </div>
        </div>
        <div className="flex-1 rounded-[1vw] overflow-hidden shadow-2xl border border-gray-200 bg-white">
          <img src={`${base}sessions.jpg`} crossOrigin="anonymous" className="w-full h-full object-cover object-top" alt="Session Log" />
        </div>
        <p className="font-body text-[1.3vw] text-muted mt-[1.5vh] text-center">Providers log sessions in seconds. Each log auto-links to IEP goals, calculates compliance, and feeds clinical graphs.</p>
      </div>
    </div>
  );
}
