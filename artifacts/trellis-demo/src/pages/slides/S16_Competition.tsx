export default function S16_Competition() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gradient-to-br from-[#f8f9fa] to-[#f0fdf4]">
      <div className="relative z-10 flex flex-col justify-center h-full px-[6vw]">
        <p className="font-body text-[1.4vw] text-primary font-semibold tracking-widest uppercase mb-[2vh]">Landscape</p>
        <h2 className="font-display text-[3vw] font-bold text-text tracking-tight leading-[1.1] mb-[4vh]">How Trellis compares</h2>
        <div className="bg-white rounded-[1vw] border border-gray-200 shadow-lg overflow-hidden">
          <div className="grid grid-cols-6 bg-dark text-white">
            <div className="p-[1.2vw] font-body text-[1.2vw] font-semibold">Feature</div>
            <div className="p-[1.2vw] font-body text-[1.2vw] font-semibold text-center bg-primary">Trellis</div>
            <div className="p-[1.2vw] font-body text-[1.2vw] font-semibold text-center">SpedTrack</div>
            <div className="p-[1.2vw] font-body text-[1.2vw] font-semibold text-center">Frontline</div>
            <div className="p-[1.2vw] font-body text-[1.2vw] font-semibold text-center">PowerSchool</div>
            <div className="p-[1.2vw] font-body text-[1.2vw] font-semibold text-center">Spreadsheets</div>
          </div>
          <div className="grid grid-cols-6 border-b border-gray-100">
            <div className="p-[1vw] font-body text-[1.2vw] text-text">IEP Compliance</div>
            <div className="p-[1vw] font-body text-[1.2vw] text-center bg-primary/5 text-primary font-bold">Full</div>
            <div className="p-[1vw] font-body text-[1.2vw] text-center text-muted">Partial</div>
            <div className="p-[1vw] font-body text-[1.2vw] text-center text-muted">Full</div>
            <div className="p-[1vw] font-body text-[1.2vw] text-center text-muted">Basic</div>
            <div className="p-[1vw] font-body text-[1.2vw] text-center text-red-500">None</div>
          </div>
          <div className="grid grid-cols-6 border-b border-gray-100">
            <div className="p-[1vw] font-body text-[1.2vw] text-text">Clinical Data / ABA</div>
            <div className="p-[1vw] font-body text-[1.2vw] text-center bg-primary/5 text-primary font-bold">Full</div>
            <div className="p-[1vw] font-body text-[1.2vw] text-center text-muted">Limited</div>
            <div className="p-[1vw] font-body text-[1.2vw] text-center text-red-500">None</div>
            <div className="p-[1vw] font-body text-[1.2vw] text-center text-red-500">None</div>
            <div className="p-[1vw] font-body text-[1.2vw] text-center text-red-500">None</div>
          </div>
          <div className="grid grid-cols-6 border-b border-gray-100">
            <div className="p-[1vw] font-body text-[1.2vw] text-text">Cost-Avoidance Alerts</div>
            <div className="p-[1vw] font-body text-[1.2vw] text-center bg-primary/5 text-primary font-bold">Full</div>
            <div className="p-[1vw] font-body text-[1.2vw] text-center text-red-500">None</div>
            <div className="p-[1vw] font-body text-[1.2vw] text-center text-red-500">None</div>
            <div className="p-[1vw] font-body text-[1.2vw] text-center text-red-500">None</div>
            <div className="p-[1vw] font-body text-[1.2vw] text-center text-red-500">None</div>
          </div>
          <div className="grid grid-cols-6 border-b border-gray-100">
            <div className="p-[1vw] font-body text-[1.2vw] text-text">AI IEP Import</div>
            <div className="p-[1vw] font-body text-[1.2vw] text-center bg-primary/5 text-primary font-bold">Full</div>
            <div className="p-[1vw] font-body text-[1.2vw] text-center text-red-500">None</div>
            <div className="p-[1vw] font-body text-[1.2vw] text-center text-red-500">None</div>
            <div className="p-[1vw] font-body text-[1.2vw] text-center text-red-500">None</div>
            <div className="p-[1vw] font-body text-[1.2vw] text-center text-red-500">None</div>
          </div>
          <div className="grid grid-cols-6">
            <div className="p-[1vw] font-body text-[1.2vw] text-text">Medicaid Claim Prep</div>
            <div className="p-[1vw] font-body text-[1.2vw] text-center bg-primary/5 text-primary font-bold">Built-in</div>
            <div className="p-[1vw] font-body text-[1.2vw] text-center text-muted">Add-on</div>
            <div className="p-[1vw] font-body text-[1.2vw] text-center text-muted">Partner</div>
            <div className="p-[1vw] font-body text-[1.2vw] text-center text-red-500">None</div>
            <div className="p-[1vw] font-body text-[1.2vw] text-center text-red-500">None</div>
          </div>
        </div>
      </div>
    </div>
  );
}
