import PilotOnboardingChecklist from "@/components/onboarding/PilotOnboardingChecklist";

export default function OnboardingPage() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">District onboarding</h1>
        <p className="text-xs md:text-sm text-gray-400 mt-1">
          Eight steps to take your district from a blank workspace to a usable pilot. Each step is checked
          off automatically when the underlying data exists in Trellis.
        </p>
      </div>
      <PilotOnboardingChecklist variant="full" />
    </div>
  );
}
