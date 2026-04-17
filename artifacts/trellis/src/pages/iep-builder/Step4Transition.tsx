import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, Briefcase, Home, Building2 } from "lucide-react";
import { Textarea, Field } from "./shared";
import type { BuilderContext, TransitionInput } from "./types";

export function Step4Transition({ context, values, onChange }: {
  context: BuilderContext;
  values: TransitionInput;
  onChange: (v: TransitionInput) => void;
}) {
  const set = (domain: keyof TransitionInput, field: string, val: string) => {
    if (typeof values[domain] === "object" && values[domain] !== null) {
      onChange({ ...values, [domain]: { ...(values[domain] as any), [field]: val } });
    } else {
      onChange({ ...values, [domain]: val });
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex gap-2">
        <GraduationCap className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[12px] text-emerald-800 font-semibold">Transition Planning Required (Age {context.student.age})</p>
          <p className="text-[11px] text-emerald-700 mt-0.5">
            Per 603 CMR 28.05(4)(c), the IEP for students age 14+ must include a Transition Planning section.
            Complete the domains below based on assessment data, student/family input, and teacher observations.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800 flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-emerald-600" /> Employment / Vocational
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <Field label="Post-Secondary Employment Goal" hint="Describe the student's vocational aspirations">
            <Textarea value={values.employment.goal} onChange={v => set("employment", "goal", v)} rows={2}
              placeholder="e.g., After completing high school, the student will obtain competitive employment in a food service or retail environment with job coaching support." />
          </Field>
          <Field label="Transition Services" hint="Activities and supports that will help reach this goal">
            <Textarea value={values.employment.services} onChange={v => set("employment", "services", v)} rows={2}
              placeholder="e.g., Career exploration, job shadowing, work-based learning, vocational assessment." />
          </Field>
          <Field label="Assessment Used">
            <Textarea value={values.employment.assessment} onChange={v => set("employment", "assessment", v)} rows={1}
              placeholder="e.g., Informal interest inventory, situational assessment at school store." />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800 flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-emerald-600" /> Post-Secondary Education / Training
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <Field label="Post-Secondary Education Goal">
            <Textarea value={values.postSecondary.goal} onChange={v => set("postSecondary", "goal", v)} rows={2}
              placeholder="e.g., After high school, student will enroll in a certificate program at a local community college or vocational training program." />
          </Field>
          <Field label="Transition Services">
            <Textarea value={values.postSecondary.services} onChange={v => set("postSecondary", "services", v)} rows={2}
              placeholder="e.g., College visits, guidance counselor meetings, disability services coordination." />
          </Field>
        </CardContent>
      </Card>

      {(context.student.age !== null && context.student.age >= 16) && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-[14px] font-bold text-gray-800 flex items-center gap-2">
              <Home className="w-4 h-4 text-emerald-600" /> Independent Living
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <Field label="Independent Living Goal">
              <Textarea value={values.independentLiving.goal} onChange={v => set("independentLiving", "goal", v)} rows={2}
                placeholder="e.g., Student will demonstrate functional independent living skills including meal preparation, home management, and community safety." />
            </Field>
            <Field label="Transition Services">
              <Textarea value={values.independentLiving.services} onChange={v => set("independentLiving", "services", v)} rows={2}
                placeholder="e.g., Life skills instruction, community-based training, apartment living program." />
            </Field>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-600" /> Agency Linkages
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <Field label="Outside agencies to connect with" hint="State agencies, community programs, or service providers to link the student to">
            <Textarea value={values.agencyLinkages} onChange={v => onChange({ ...values, agencyLinkages: v })} rows={2}
              placeholder="e.g., Department of Developmental Services (DDS), Mass Rehab Commission (MRC), Social Security Administration..." />
          </Field>
        </CardContent>
      </Card>
    </div>
  );
}
