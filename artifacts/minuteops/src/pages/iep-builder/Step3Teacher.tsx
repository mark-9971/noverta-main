import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";
import { Textarea, Field } from "./shared";
import type { BuilderContext, TeacherQuestionnaire } from "./types";

export function Step3Teacher({ context, values, onChange, onServiceNote }: {
  context: BuilderContext;
  values: TeacherQuestionnaire;
  onChange: (field: keyof TeacherQuestionnaire, value: string) => void;
  onServiceNote: (svc: string, note: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
        <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-[12px] text-amber-700">
          Complete this section based on your professional observations and direct assessment of {context.student.name}. 
          This input directly informs the PLAAFP and goal recommendations.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800">Academic & Functional Performance</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <Field label="Current Academic Performance" hint="Describe reading, writing, math, and other academic skill levels">
            <Textarea value={values.academicPerformance} onChange={v => onChange("academicPerformance", v)} placeholder="e.g., Reading at a 2nd grade level with supports. Decoding skills improving. Math performance at grade level for addition/subtraction..." />
          </Field>
          <Field label="Areas of Strength" hint="What does the student do well?">
            <Textarea value={values.areasOfStrength} onChange={v => onChange("areasOfStrength", v)} placeholder="e.g., Excellent memory for routines, strong visual-spatial skills, highly motivated by..." rows={2} />
          </Field>
          <Field label="Areas of Greatest Need" hint="Where does the student require the most support?">
            <Textarea value={values.areasOfNeed} onChange={v => onChange("areasOfNeed", v)} placeholder="e.g., Expressive language, fine motor skills, reading comprehension, social initiation..." rows={2} />
          </Field>
          <Field label="Response to Current Services" hint="How is the student responding to current IEP services and supports?">
            <Textarea value={values.responseToServices} onChange={v => onChange("responseToServices", v)} placeholder="e.g., Student responds well to structured ABA sessions. Speech services show measurable gains. OT recommendations implemented in classroom..." rows={2} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800">Behavioral & Social-Emotional</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <Field label="Behavioral Observations" hint="Frequency, intensity, patterns of target behaviors; response to behavior interventions">
            <Textarea value={values.behavioralObservations} onChange={v => onChange("behavioralObservations", v)} placeholder="e.g., Challenging behaviors have decreased since implementing sensory breaks. Remaining concerns: task refusal during writing activities..." />
          </Field>
          <Field label="Social-Emotional Functioning" hint="Peer interactions, emotional regulation, friendship skills, anxiety">
            <Textarea value={values.socialEmotional} onChange={v => onChange("socialEmotional", v)} placeholder="e.g., Student participates in structured peer activities. Difficulty initiating with peers independently. Emotional regulation improving with check-in/check-out..." rows={2} />
          </Field>
          <Field label="Communication Skills" hint="Expressive/receptive language, AAC use, pragmatics">
            <Textarea value={values.communicationSkills} onChange={v => onChange("communicationSkills", v)} placeholder="e.g., Uses device to communicate basic needs. Receptive language age-appropriate. Expressive language emerging with prompting..." rows={2} />
          </Field>
          <Field label="Self-Advocacy & Independence" hint="Does the student request help? Make choices? Self-monitor?">
            <Textarea value={values.selfAdvocacy} onChange={v => onChange("selfAdvocacy", v)} placeholder="e.g., Student can request a break when prompted. Beginning to identify own strengths..." rows={2} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800">Recommendations for Next IEP</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <Field label="Recommended New Goals" hint="One goal per line. Include goal area and specific objective.">
            <Textarea value={values.recommendedNewGoals} onChange={v => onChange("recommendedNewGoals", v)} rows={4}
              placeholder={`e.g.,\nSelf-care: Student will independently manage lunch tray 100% of opportunities.\nReading: Student will identify main idea from short passages with 80% accuracy.`} />
          </Field>
          <Field label="Recommended New Accommodations" hint="One accommodation per line.">
            <Textarea value={values.recommendedAccommodations} onChange={v => onChange("recommendedAccommodations", v)} rows={3}
              placeholder={`e.g.,\nExtended time (50%) on all assessments.\nPreferential seating near instruction.`} />
          </Field>
        </CardContent>
      </Card>

      {context.services.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-[14px] font-bold text-gray-800">Service Delivery Notes</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {context.services.map(s => (
              <div key={s.id} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[13px] font-medium text-gray-700">{s.serviceTypeName}</p>
                  {s.compliancePercent !== null && (
                    <span className={`text-[11px] font-bold ${s.compliancePercent >= 90 ? "text-emerald-700" : s.compliancePercent >= 75 ? "text-amber-600" : "text-red-600"}`}>
                      {s.compliancePercent}% compliance
                    </span>
                  )}
                </div>
                <Field label="Notes or recommended changes">
                  <Textarea rows={2} value={values.serviceChanges[s.serviceTypeName || ""] || ""}
                    onChange={v => onServiceNote(s.serviceTypeName || "", v)}
                    placeholder={`e.g., Recommend increasing to 60 min/week. Scheduling conflicts on Fridays...`} />
                </Field>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800">Team Meeting Topics</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <Field label="Topics to raise at the IEP Team meeting">
            <Textarea value={values.teamDiscussionTopics} onChange={v => onChange("teamDiscussionTopics", v)} rows={2}
              placeholder="e.g., Discuss change in placement, review ESY eligibility, discuss medication change impact..." />
          </Field>
          {context.needsTransition && (
            <Field label="Transition-related observations" hint="Career interests, work-readiness skills, post-secondary goals observed">
              <Textarea value={values.transitionNotes} onChange={v => onChange("transitionNotes", v)} rows={2}
                placeholder="e.g., Student has expressed interest in working with animals. Good task persistence with hands-on activities..." />
            </Field>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
