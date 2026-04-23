const base = import.meta.env.BASE_URL;

export default function S08_Traction() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <div className="absolute inset-y-0 right-0 w-[38vw]">
        <img
          src={`${base}school-hallway.png`}
          crossOrigin="anonymous"
          alt="Sunlit New England school hallway"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-l from-transparent via-bg/30 to-bg" />
      </div>

      <div className="relative h-full px-[7vw] py-[7vh] grid grid-cols-12">
        <div className="col-span-7 flex flex-col justify-between pr-[3vw]">
          <div className="flex items-center gap-[1vw]">
            <span className="font-display italic text-accent text-[1.4vw]">07</span>
            <span className="block w-[2vw] h-[0.2vh] bg-rule/40" />
            <span className="font-body uppercase tracking-[0.3em] text-[0.95vw] text-muted">
              Early traction
            </span>
          </div>

          <div>
            <h2 className="font-display font-light text-[4.8vw] leading-[1.0] tracking-tight text-primary max-w-[42vw]">
              Three pilot districts.
              <span className="italic text-accent"> Zero churn.</span>
            </h2>

            <div className="grid grid-cols-3 gap-[2vw] mt-[5vh]">
              <div className="border-t-[0.3vh] border-primary pt-[2vh]">
                <div className="font-display text-[3.4vw] text-primary leading-none">8,400</div>
                <div className="font-body text-[0.95vw] uppercase tracking-[0.25em] text-muted mt-[1vh]">
                  IEP students under management
                </div>
              </div>
              <div className="border-t-[0.3vh] border-primary pt-[2vh]">
                <div className="font-display text-[3.4vw] text-primary leading-none">42k</div>
                <div className="font-body text-[0.95vw] uppercase tracking-[0.25em] text-muted mt-[1vh]">
                  service sessions logged in Q1
                </div>
              </div>
              <div className="border-t-[0.3vh] border-accent pt-[2vh]">
                <div className="font-display text-[3.4vw] text-accent leading-none">$1.2M</div>
                <div className="font-body text-[0.95vw] uppercase tracking-[0.25em] text-muted mt-[1vh]">
                  in compensatory exposure surfaced
                </div>
              </div>
            </div>
          </div>

          <div className="border-l-[0.4vw] border-accent pl-[2vw] max-w-[40vw]">
            <p className="font-display italic text-[1.6vw] text-primary leading-snug">
              "Noverta is the first tool my providers actually open on a Monday morning."
            </p>
            <p className="font-body uppercase tracking-[0.25em] text-[0.85vw] text-muted mt-[1.5vh]">
              Assistant Superintendent · pilot district · MA
            </p>
          </div>
        </div>

        <div className="col-span-5" />
      </div>
    </div>
  );
}
