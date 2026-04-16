export default function ProblemSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-gradient-to-br from-[#fafafa] to-[#f0fdf4]">
      <div className="absolute top-[3vh] right-[4vw] w-[35vw] h-[35vw] rounded-full bg-accent/5" />
      <div className="absolute bottom-[-5vh] left-[-3vw] w-[25vw] h-[25vw] rounded-full bg-primary/5" />

      <div className="relative z-10 flex flex-col h-full px-[7vw] py-[7vh]">
        <p className="font-body text-[1.3vw] font-semibold text-primary tracking-[0.15em] uppercase mb-[1.5vh]">The Problem</p>
        <h2 className="font-display text-[4vw] font-bold text-text tracking-tight leading-[1.1]">
          SPED teams are drowning
        </h2>
        <p className="font-body text-[1.8vw] text-muted mt-[1.5vh] max-w-[55vw]">
          Special education runs on disconnected spreadsheets, paper forms, and generic school systems never designed for clinical workflows.
        </p>

        <div className="flex gap-[3vw] mt-[6vh]">
          <div className="flex-1 border-l-[0.3vw] border-red-400 pl-[2vw]">
            <p className="font-display text-[3.5vw] font-bold text-red-500">73%</p>
            <p className="font-body text-[1.5vw] text-text font-medium mt-[0.5vh]">SPED directors report compliance tracking as their top pain point</p>
            <p className="font-body text-[1.2vw] text-muted mt-[0.5vh]">Council of Administrators of Special Education survey, est.</p>
          </div>

          <div className="flex-1 border-l-[0.3vw] border-amber-400 pl-[2vw]">
            <p className="font-display text-[3.5vw] font-bold text-amber-500">5-8 hrs</p>
            <p className="font-body text-[1.5vw] text-text font-medium mt-[0.5vh]">Per week spent by case managers on manual paperwork instead of instruction</p>
            <p className="font-body text-[1.2vw] text-muted mt-[0.5vh]">National average, est.</p>
          </div>

          <div className="flex-1 border-l-[0.3vw] border-primary pl-[2vw]">
            <p className="font-display text-[3.5vw] font-bold text-primary">$2.4M</p>
            <p className="font-body text-[1.5vw] text-text font-medium mt-[0.5vh]">Average district liability exposure from service minute shortfalls</p>
            <p className="font-body text-[1.2vw] text-muted mt-[0.5vh]">Compensatory services risk, est.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
