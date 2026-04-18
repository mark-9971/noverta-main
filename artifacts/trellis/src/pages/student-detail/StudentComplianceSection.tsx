import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { Shield, AlertTriangle, Sprout } from "lucide-react";
import BipManagement from "@/components/bip-management";
import StudentDocuments from "@/components/student-documents";
import { StudentGuardians } from "@/components/student-guardians";
import StudentMessages from "@/components/student-messages";
import StudentNotes from "@/components/student-notes";
import AccommodationTracking from "@/components/accommodation-tracking";

interface BaseProps {
  studentId: number;
}

interface ProtectiveProps extends BaseProps {
  section: "protective";
  protectiveData: { incidents: any[]; summary: any } | null;
  formatDate: (d: string) => string;
}

interface TransitionProps extends BaseProps {
  section: "transition";
  transitionData: {
    isTransitionAge: boolean;
    age: number | null;
    plans: { id: number; planDate: string; status: string; goals?: { id: number; domain: string; goalStatement: string; status: string }[]; agencyReferrals?: { id: number; agencyName: string; status: string }[] }[];
  } | null;
}

interface AfterTransitionProps extends BaseProps {
  section: "afterTransition";
  bipReadOnly: boolean;
  isEditable: boolean;
}

interface MessagesProps extends BaseProps {
  section: "messagesAccommodations";
  studentName: string;
  messageGuardians: { id: number; name: string; relationship: string; email: string | null }[];
}

type StudentComplianceSectionProps = ProtectiveProps | TransitionProps | AfterTransitionProps | MessagesProps;

export default function StudentComplianceSection(props: StudentComplianceSectionProps) {
  if (props.section === "protective") {
    const { protectiveData, formatDate } = props;
    if (!protectiveData || protectiveData.incidents.length === 0) return null;
    return (
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
              <Shield className="w-4 h-4 text-red-500" />
              Protective Measures
            </CardTitle>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">
                {protectiveData.summary.totalIncidents} incident{protectiveData.summary.totalIncidents !== 1 ? "s" : ""}
                {protectiveData.summary.thisMonth > 0 && (
                  <span className="text-red-600 font-semibold ml-1">({protectiveData.summary.thisMonth} this month)</span>
                )}
              </span>
              <Link href="/protective-measures" className="text-xs text-emerald-700 hover:text-emerald-800 font-medium">View All</Link>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {protectiveData.summary.pendingReview > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-xs text-amber-800 font-medium">{protectiveData.summary.pendingReview} incident{protectiveData.summary.pendingReview !== 1 ? "s" : ""} pending admin review</p>
            </div>
          )}
          <div className="space-y-2">
            {protectiveData.incidents.slice(0, 5).map((inc: any) => (
              <div key={inc.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50/50 hover:bg-gray-100/50 transition-colors">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${inc.incidentType === "physical_restraint" ? "bg-red-50" : inc.incidentType === "seclusion" ? "bg-amber-50" : "bg-gray-100"}`}>
                  <Shield className={`w-4 h-4 ${inc.incidentType === "physical_restraint" ? "text-red-600" : inc.incidentType === "seclusion" ? "text-amber-600" : "text-gray-600"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${inc.incidentType === "physical_restraint" ? "bg-red-50 text-red-700" : inc.incidentType === "seclusion" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-700"}`}>
                      {inc.incidentType === "physical_restraint" ? "Restraint" : inc.incidentType === "seclusion" ? "Seclusion" : "Time-Out"}
                    </span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${inc.status === "pending_review" ? "bg-amber-100 text-amber-700" : inc.status === "reviewed" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                      {inc.status === "pending_review" ? "Pending" : inc.status === "reviewed" ? "Reviewed" : "Closed"}
                    </span>
                    {(inc.studentInjury || inc.staffInjury) && <span className="w-1.5 h-1.5 rounded-full bg-red-500" title="Injury reported" />}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5 truncate">{inc.behaviorDescription}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-medium text-gray-700">{formatDate(inc.incidentDate)}</p>
                  <p className="text-[10px] text-gray-400">{inc.durationMinutes ? `${inc.durationMinutes} min` : ""}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (props.section === "transition") {
    const { transitionData } = props;
    if (!transitionData?.isTransitionAge) return null;
    return (
      <Card className="border-gray-200/60">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Sprout className="w-4 h-4 text-emerald-600" /> Transition Planning
              <span className="text-[10px] font-normal text-gray-400 ml-1">Age {transitionData.age}+</span>
            </CardTitle>
            <Link href="/transitions" className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800">
              Manage Transitions →
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {transitionData.plans.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-[12px] text-amber-600 font-medium">No transition plan on file</p>
              <p className="text-[11px] text-gray-400 mt-1">IDEA requires transition planning for students aged 14+</p>
            </div>
          ) : (
            <div className="space-y-3">
              {transitionData.plans.slice(0, 2).map(plan => (
                <div key={plan.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] font-medium text-gray-800">Plan dated {plan.planDate}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${plan.status === "active" ? "bg-emerald-50 text-emerald-700" : plan.status === "draft" ? "bg-gray-100 text-gray-600" : "bg-blue-50 text-blue-700"}`}>{plan.status}</span>
                  </div>
                  {plan.goals && plan.goals.length > 0 && (
                    <div className="space-y-1">
                      {plan.goals.slice(0, 3).map(g => (
                        <div key={g.id} className="flex items-center gap-2 text-[11px]">
                          <span className={`w-1.5 h-1.5 rounded-full ${g.domain === "education" ? "bg-emerald-400" : g.domain === "employment" ? "bg-blue-400" : "bg-purple-400"}`} />
                          <span className="text-gray-600 truncate">{g.goalStatement}</span>
                        </div>
                      ))}
                      {plan.goals.length > 3 && <p className="text-[10px] text-gray-400 ml-3.5">+{plan.goals.length - 3} more</p>}
                    </div>
                  )}
                  {plan.agencyReferrals && plan.agencyReferrals.length > 0 && (
                    <p className="text-[11px] text-gray-400 mt-1">{plan.agencyReferrals.length} agency referral{plan.agencyReferrals.length !== 1 ? "s" : ""}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (props.section === "afterTransition") {
    const { studentId, bipReadOnly, isEditable } = props;
    return (
      <>
        <BipManagement studentId={studentId} readOnly={bipReadOnly} />
        <StudentDocuments studentId={studentId} />
        <StudentGuardians studentId={studentId} isEditable={isEditable} />
      </>
    );
  }

  // section === "messagesAccommodations"
  const { studentId, studentName, messageGuardians } = props;
  return (
    <>
      <StudentMessages studentId={studentId} studentName={studentName} guardians={messageGuardians} />
      <StudentNotes studentId={studentId} />
      <AccommodationTracking studentId={studentId} />
    </>
  );
}
