export default function S02_WhoAmI() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gradient-to-br from-[#f8f9fa] to-[#ecfdf5]">
      <div className="absolute top-0 right-0 w-[40vw] h-[40vh] bg-primary/5 rounded-bl-[10vw]" />
      <div className="absolute bottom-0 left-0 w-[30vw] h-[30vh] bg-primary/5 rounded-tr-[8vw]" />
      <div className="relative z-10 flex flex-col justify-center h-full px-[8vw]">
        <p className="font-body text-[1.4vw] text-primary font-semibold tracking-widest uppercase mb-[2vh]">About This Project</p>
        <h2 className="font-display text-[4vw] font-bold text-text tracking-tight leading-[1.1] mb-[4vh]">What is Noverta?</h2>
        <div className="flex gap-[4vw]">
          <div className="flex-1">
            <div className="w-[3vw] h-[0.4vh] bg-primary rounded-full mb-[2vh]" />
            <p className="font-body text-[1.8vw] text-text leading-relaxed">A full-stack platform that replaces the disconnected spreadsheets, paper forms, and outdated software that Massachusetts school districts use to manage special education services.</p>
          </div>
          <div className="flex-1">
            <div className="w-[3vw] h-[0.4vh] bg-warm rounded-full mb-[2vh]" />
            <p className="font-body text-[1.8vw] text-text leading-relaxed">Built from scratch as a solo founder project, Noverta handles IEP compliance, session logging, clinical data, behavior tracking, staff scheduling, and Medicaid claim prep -- all in one system.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
