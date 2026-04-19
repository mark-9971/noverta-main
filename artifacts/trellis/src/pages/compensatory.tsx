import { useSearch, useLocation } from "wouter";
import { Scale, DollarSign } from "lucide-react";
import CompensatoryServices from "@/pages/compensatory-services";
import CompensatoryFinancePage from "@/pages/compensatory-finance";

type View = "services" | "finance";

export default function CompensatoryWorkspace() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const view: View = params.get("view") === "finance" ? "finance" : "services";

  function setView(v: View) {
    const next = new URLSearchParams();
    if (v === "finance") {
      next.set("view", "finance");
    }
    const qs = next.toString();
    navigate(`/compensatory${qs ? `?${qs}` : ""}`, { replace: true });
  }

  return (
    <div>
      <div className="px-4 md:px-6 lg:px-8 pt-4 pb-1">
        <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Compensatory</h1>
        <p className="text-xs md:text-sm text-gray-400 mt-1">
          Service obligations, balances, and financial exposure.
        </p>
        <div className="flex gap-0 mt-3 border-b border-gray-200">
          <TabBtn
            active={view === "services"}
            onClick={() => setView("services")}
            icon={Scale}
            label="Services & Obligations"
          />
          <TabBtn
            active={view === "finance"}
            onClick={() => setView("finance")}
            icon={DollarSign}
            label="Financial Exposure"
          />
        </div>
      </div>

      {view === "services" ? (
        <CompensatoryServices embedded />
      ) : (
        <CompensatoryFinancePage />
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${
        active
          ? "border-emerald-600 text-emerald-700"
          : "border-transparent text-gray-400 hover:text-gray-600"
      }`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}
