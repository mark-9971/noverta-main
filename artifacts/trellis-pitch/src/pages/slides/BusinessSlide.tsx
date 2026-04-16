export default function BusinessSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-gradient-to-br from-[#fafafa] to-[#f0fdf4]">
      <div className="absolute bottom-0 right-0 w-[30vw] h-[30vw] rounded-full bg-primary/5 translate-x-[10vw] translate-y-[10vw]" />

      <div className="relative z-10 flex flex-col h-full px-[7vw] py-[7vh]">
        <p className="font-body text-[1.3vw] font-semibold text-primary tracking-[0.15em] uppercase mb-[1.5vh]">Business Model</p>
        <h2 className="font-display text-[3.5vw] font-bold text-text tracking-tight leading-[1.1]">
          SaaS with built-in expansion
        </h2>

        <div className="flex gap-[3vw] mt-[5vh]">
          <div className="flex-1 bg-white border border-gray-200/80 rounded-[1vw] p-[2.5vw] relative">
            <div className="absolute top-0 left-0 w-full h-[0.4vh] bg-gray-300 rounded-t-[1vw]" />
            <p className="font-body text-[1.2vw] font-semibold text-muted uppercase tracking-wider">Starter</p>
            <p className="font-display text-[3vw] font-bold text-text mt-[1vh]">$4<span className="text-[1.5vw] text-muted font-medium">/student/mo</span></p>
            <div className="mt-[2vh] space-y-[1.2vh]">
              <p className="font-body text-[1.3vw] text-muted flex items-center gap-[0.5vw]"><span className="text-primary font-bold">+</span> Compliance tracking</p>
              <p className="font-body text-[1.3vw] text-muted flex items-center gap-[0.5vw]"><span className="text-primary font-bold">+</span> Service minutes</p>
              <p className="font-body text-[1.3vw] text-muted flex items-center gap-[0.5vw]"><span className="text-primary font-bold">+</span> Basic reporting</p>
            </div>
          </div>

          <div className="flex-1 bg-white border-2 border-primary rounded-[1vw] p-[2.5vw] relative shadow-lg shadow-primary/10">
            <div className="absolute top-0 left-0 w-full h-[0.4vh] bg-primary rounded-t-[1vw]" />
            <div className="absolute top-[1.5vh] right-[1.5vw]">
              <span className="font-body text-[1vw] font-semibold bg-primary text-white px-[0.8vw] py-[0.3vh] rounded-full">Most Popular</span>
            </div>
            <p className="font-body text-[1.2vw] font-semibold text-primary uppercase tracking-wider">Professional</p>
            <p className="font-display text-[3vw] font-bold text-text mt-[1vh]">$8<span className="text-[1.5vw] text-muted font-medium">/student/mo</span></p>
            <div className="mt-[2vh] space-y-[1.2vh]">
              <p className="font-body text-[1.3vw] text-muted flex items-center gap-[0.5vw]"><span className="text-primary font-bold">+</span> Clinical ABA tools</p>
              <p className="font-body text-[1.3vw] text-muted flex items-center gap-[0.5vw]"><span className="text-primary font-bold">+</span> FBA/BIP workflows</p>
              <p className="font-body text-[1.3vw] text-muted flex items-center gap-[0.5vw]"><span className="text-primary font-bold">+</span> Guardian portal</p>
            </div>
          </div>

          <div className="flex-1 bg-white border border-gray-200/80 rounded-[1vw] p-[2.5vw] relative">
            <div className="absolute top-0 left-0 w-full h-[0.4vh] bg-gray-300 rounded-t-[1vw]" />
            <p className="font-body text-[1.2vw] font-semibold text-muted uppercase tracking-wider">Enterprise</p>
            <p className="font-display text-[3vw] font-bold text-text mt-[1vh]">Custom</p>
            <div className="mt-[2vh] space-y-[1.2vh]">
              <p className="font-body text-[1.3vw] text-muted flex items-center gap-[0.5vw]"><span className="text-primary font-bold">+</span> SIS integration</p>
              <p className="font-body text-[1.3vw] text-muted flex items-center gap-[0.5vw]"><span className="text-primary font-bold">+</span> State reporting</p>
              <p className="font-body text-[1.3vw] text-muted flex items-center gap-[0.5vw]"><span className="text-primary font-bold">+</span> Dedicated support</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-[4vw] mt-[4vh] px-[1vw]">
          <div className="flex items-center gap-[1vw]">
            <div className="w-[0.6vw] h-[0.6vw] rounded-full bg-primary" />
            <p className="font-body text-[1.4vw] text-text"><span className="font-semibold">Seat-based licensing</span> with automated enforcement</p>
          </div>
          <div className="flex items-center gap-[1vw]">
            <div className="w-[0.6vw] h-[0.6vw] rounded-full bg-primary" />
            <p className="font-body text-[1.4vw] text-text"><span className="font-semibold">Stripe-powered</span> self-service billing portal</p>
          </div>
        </div>
      </div>
    </div>
  );
}
