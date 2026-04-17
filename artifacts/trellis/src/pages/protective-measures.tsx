import { useState } from "react";
import { useSearch } from "wouter";
import { IncidentList } from "@/pages/protective-measures/IncidentList";
import { NewIncidentForm } from "@/pages/protective-measures/NewIncidentForm";
import { QuickReportForm } from "@/pages/protective-measures/QuickReportForm";
import { IncidentDetailView } from "@/pages/protective-measures/IncidentDetailView";

export default function ProtectiveMeasuresPage() {
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const [view, setView] = useState<"list" | "new" | "quick" | "detail" | "edit">("list");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState(searchParams.get("status") ?? "all");
  const [searchTerm, setSearchTerm] = useState("");

  if (view === "new") return <NewIncidentForm onClose={() => setView("list")} />;
  if (view === "edit" && detailId) return <NewIncidentForm editId={detailId} onClose={() => { setView("list"); setDetailId(null); }} />;
  if (view === "quick") return <QuickReportForm onClose={() => setView("list")} />;
  if (view === "detail" && detailId) return <IncidentDetailView id={detailId} onBack={() => { setView("list"); setDetailId(null); }} onExpandToFull={(id: number) => { setDetailId(id); setView("edit"); }} />;

  return <IncidentList
    filterType={filterType} setFilterType={setFilterType}
    filterStatus={filterStatus} setFilterStatus={setFilterStatus}
    searchTerm={searchTerm} setSearchTerm={setSearchTerm}
    onNew={() => setView("new")}
    onQuick={() => setView("quick")}
    onDetail={(id: number) => { setDetailId(id); setView("detail"); }}
  />;
}
