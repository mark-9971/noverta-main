import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageSquare, AlertTriangle, CheckCircle, X } from "lucide-react";
import { Contact, METHOD_ICONS, METHOD_LABELS, formatDate } from "./types";

interface Props {
  contacts: Contact[];
  loading: boolean;
  onEdit: (c: Contact) => void;
  onDelete: (id: number) => void;
}

export function ContactsList({ contacts, loading, onEdit, onDelete }: Props) {
  return (
    <Card>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="w-full h-16" />)}</div>
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No communication logged yet"
            description="Log your first contact above to start building a parent communication history."
            compact
          />
        ) : (
          <div className="divide-y divide-gray-50">
            {contacts.map(c => {
              const MethodIcon = METHOD_ICONS[c.contactMethod] || MessageSquare;
              const isOverdue = c.followUpNeeded === "yes" && c.followUpDate && c.followUpDate < new Date().toISOString().substring(0, 10) && (!c.outcome || c.outcome === "");
              return (
                <div key={c.id} className="p-4 hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${c.notificationRequired ? "bg-red-50" : "bg-emerald-50"}`}>
                      <MethodIcon className={`w-4 h-4 ${c.notificationRequired ? "text-red-500" : "text-emerald-600"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/students/${c.studentId}`} className="text-sm font-medium text-gray-800 hover:text-emerald-700">
                          {c.studentName || `Student #${c.studentId}`}
                        </Link>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{c.contactType.replace(/_/g, " ")}</span>
                        {c.notificationRequired && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium">Compliance</span>
                        )}
                        {isOverdue && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium flex items-center gap-0.5">
                            <AlertTriangle className="w-3 h-3" /> Overdue
                          </span>
                        )}
                        {c.followUpNeeded === "yes" && c.outcome && c.outcome !== "" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-medium flex items-center gap-0.5">
                            <CheckCircle className="w-3 h-3" /> Resolved
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5">{c.subject}</p>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                        <span>{formatDate(c.contactDate)}</span>
                        <span>{METHOD_LABELS[c.contactMethod] || c.contactMethod}</span>
                        {c.parentName && <span>with {c.parentName}</span>}
                        {c.contactedBy && <span>by {c.contactedBy}</span>}
                        {c.followUpDate && <span>Follow-up: {formatDate(c.followUpDate)}</span>}
                      </div>
                      {c.notes && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{c.notes}</p>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => onEdit(c)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md text-xs">
                        Edit
                      </button>
                      <button onClick={() => onDelete(c.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md text-xs">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
