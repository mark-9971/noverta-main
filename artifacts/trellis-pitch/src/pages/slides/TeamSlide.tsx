export default function TeamSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-gradient-to-br from-[#fafafa] to-[#f0fdf4]">
      <div className="absolute top-0 right-0 w-[35vw] h-[35vw] rounded-full bg-accent/5 translate-x-[10vw] -translate-y-[10vw]" />

      <div className="relative z-10 flex flex-col h-full px-[7vw] py-[7vh]">
        <p className="font-body text-[1.3vw] font-semibold text-primary tracking-[0.15em] uppercase mb-[1.5vh]">Our Approach</p>
        <h2 className="font-display text-[4vw] font-bold text-text tracking-tight leading-[1.1]">
          Built by people who know SPED
        </h2>
        <p className="font-body text-[1.8vw] text-muted mt-[1.5vh] max-w-[55vw]">
          Domain expertise in special education compliance, clinical operations, and Massachusetts regulatory requirements.
        </p>

        <div className="grid grid-cols-3 gap-[3vw] mt-[5vh]">
          <div className="bg-white border border-gray-200 rounded-[1vw] p-[2.5vw]">
            <div className="w-[4vw] h-[4vw] rounded-full bg-primary/10 flex items-center justify-center mb-[2vh]">
              <svg viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" className="w-[2vw] h-[2vw]"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <p className="font-body text-[1.6vw] font-bold text-text">Compliance First</p>
            <p className="font-body text-[1.2vw] text-muted mt-[1vh] leading-relaxed">
              Every feature maps to a regulatory requirement. 603 CMR 46, IDEA Part B, FERPA -- compliance isn't an afterthought, it's the foundation.
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-[1vw] p-[2.5vw]">
            <div className="w-[4vw] h-[4vw] rounded-full bg-primary/10 flex items-center justify-center mb-[2vh]">
              <svg viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" className="w-[2vw] h-[2vw]"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </div>
            <p className="font-body text-[1.6vw] font-bold text-text">Clinical Grade</p>
            <p className="font-body text-[1.2vw] text-muted mt-[1vh] leading-relaxed">
              ABA data collection tools designed with BCBAs. Discrete trial training, interval recording, and functional analysis that meet clinical standards.
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-[1vw] p-[2.5vw]">
            <div className="w-[4vw] h-[4vw] rounded-full bg-primary/10 flex items-center justify-center mb-[2vh]">
              <svg viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" className="w-[2vw] h-[2vw]"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <p className="font-body text-[1.6vw] font-bold text-text">Role-Aware Design</p>
            <p className="font-body text-[1.2vw] text-muted mt-[1vh] leading-relaxed">
              Nine distinct roles from district admin to paraprofessional. Each sees exactly what they need -- no feature overload, no missing capabilities.
            </p>
          </div>
        </div>

        <div className="mt-[4vh] flex items-center gap-[4vw] bg-primary/5 border border-primary/15 rounded-[0.8vw] px-[2.5vw] py-[2vh]">
          <div className="text-center">
            <p className="font-display text-[3vw] font-bold text-primary">30+</p>
            <p className="font-body text-[1vw] text-muted">Feature Modules</p>
          </div>
          <div className="w-[0.15vw] h-[4vh] bg-primary/20" />
          <div className="text-center">
            <p className="font-display text-[3vw] font-bold text-primary">9</p>
            <p className="font-body text-[1vw] text-muted">User Roles</p>
          </div>
          <div className="w-[0.15vw] h-[4vh] bg-primary/20" />
          <div className="text-center">
            <p className="font-display text-[3vw] font-bold text-primary">100%</p>
            <p className="font-body text-[1vw] text-muted">MA Compliance</p>
          </div>
          <div className="w-[0.15vw] h-[4vh] bg-primary/20" />
          <div className="text-center">
            <p className="font-display text-[3vw] font-bold text-primary">FERPA</p>
            <p className="font-body text-[1vw] text-muted">Aligned · DPA on request</p>
          </div>
          <div className="w-[0.15vw] h-[4vh] bg-primary/20" />
          <div className="text-center">
            <p className="font-display text-[3vw] font-bold text-primary">SaaS</p>
            <p className="font-body text-[1vw] text-muted">Cloud Native</p>
          </div>
        </div>
      </div>
    </div>
  );
}
