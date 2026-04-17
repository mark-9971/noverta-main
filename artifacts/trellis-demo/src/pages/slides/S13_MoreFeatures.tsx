export default function S13_MoreFeatures() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gradient-to-br from-[#f8f9fa] to-[#ecfdf5]">
      <div className="absolute bottom-0 left-0 w-[30vw] h-[30vh] bg-primary/5 rounded-tr-[8vw]" />
      <div className="relative z-10 flex flex-col justify-center h-full px-[8vw]">
        <p className="font-body text-[1.4vw] text-primary font-semibold tracking-widest uppercase mb-[2vh]">And More</p>
        <h2 className="font-display text-[3.5vw] font-bold text-text tracking-tight leading-[1.1] mb-[5vh]">Depth competitors can not match.</h2>
        <div className="grid grid-cols-3 gap-[2.5vw]">
          <div className="bg-white rounded-[1vw] p-[2vw] border border-gray-100 shadow-sm">
            <div className="w-[3vw] h-[0.4vh] bg-primary rounded-full mb-[1.5vh]" />
            <p className="font-body text-[1.5vw] font-semibold text-text mb-[0.5vh]">Medicaid Billing</p>
            <p className="font-body text-[1.3vw] text-muted">Auto-capture billable minutes with student Medicaid ID management.</p>
          </div>
          <div className="bg-white rounded-[1vw] p-[2vw] border border-gray-100 shadow-sm">
            <div className="w-[3vw] h-[0.4vh] bg-warm rounded-full mb-[1.5vh]" />
            <p className="font-body text-[1.5vw] font-semibold text-text mb-[0.5vh]">Staff Scheduling</p>
            <p className="font-body text-[1.3vw] text-muted">Weekly grid view with provider assignments across students.</p>
          </div>
          <div className="bg-white rounded-[1vw] p-[2vw] border border-gray-100 shadow-sm">
            <div className="w-[3vw] h-[0.4vh] bg-blue-500 rounded-full mb-[1.5vh]" />
            <p className="font-body text-[1.5vw] font-semibold text-text mb-[0.5vh]">Role-Based Access</p>
            <p className="font-body text-[1.3vw] text-muted">Admin, teacher, BCBA, parent, and student views -- each sees exactly what they need.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
