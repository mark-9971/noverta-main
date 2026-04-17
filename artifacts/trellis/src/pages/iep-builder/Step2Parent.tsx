import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info, GraduationCap } from "lucide-react";
import { Textarea, Field } from "./shared";
import type { BuilderContext, ParentQuestionnaire } from "./types";

export function Step2Parent({ context, values, onChange }: {
  context: BuilderContext;
  values: ParentQuestionnaire;
  onChange: (field: keyof ParentQuestionnaire, value: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2">
        <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-[12px] text-blue-700">
          This questionnaire gathers parent/guardian input for the IEP Annual Review. 
          If using a paper questionnaire, transfer responses here. All fields are optional — 
          complete what is available.
          {context.student.parentName && <span className="font-semibold"> Parent/Guardian: {context.student.parentName}</span>}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800">Strengths & Observations at Home</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <Field label="What are your child's strengths at home?" hint="Skills, behaviors, interests the child excels at">
            <Textarea value={values.strengthsAtHome} onChange={v => onChange("strengthsAtHome", v)} placeholder="e.g., Strong memory, loves music, helps with chores..." />
          </Field>
          <Field label="How does your child learn best?" hint="Visual, hands-on, repetition, certain environments...">
            <Textarea value={values.learningStyle} onChange={v => onChange("learningStyle", v)} placeholder="e.g., Responds well to visual supports and short task breaks..." rows={2} />
          </Field>
          <Field label="Any significant health, family, or living situation changes this year?">
            <Textarea value={values.healthChanges} onChange={v => onChange("healthChanges", v)} placeholder="e.g., New medication, moved to new home, family changes..." rows={2} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800">Priorities & Concerns</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <Field label="What are your primary concerns for the upcoming school year?" hint="Academic, behavioral, social, independence, etc.">
            <Textarea value={values.primaryConcerns} onChange={v => onChange("primaryConcerns", v)} placeholder="e.g., Reading comprehension has been difficult. Concerns about peer relationships..." />
          </Field>
          <Field label="What are your top priorities for your child this year?">
            <Textarea value={values.prioritiesForYear} onChange={v => onChange("prioritiesForYear", v)} placeholder="e.g., Build independent self-care skills, develop more friendships, catch up in math..." />
          </Field>
          <Field label="Are there daily living skills you'd like the school to focus on?" hint="e.g., Toileting, meal preparation, community navigation">
            <Textarea value={values.dailyLivingSkills} onChange={v => onChange("dailyLivingSkills", v)} placeholder="e.g., Needs more practice with managing belongings, packing backpack..." rows={2} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800">Student Voice & New Goals</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <Field label="What does your child want to work on or achieve?" hint="Student's own expressed goals or interests">
            <Textarea value={values.studentGoals} onChange={v => onChange("studentGoals", v)} placeholder="e.g., Wants to learn to read better, wants to have more friends, wants to play soccer..." rows={2} />
          </Field>
          <Field label="Are there specific goal areas you'd like added to the IEP?" hint="List areas separated by commas (e.g., Social Skills, Self-Care, Reading)">
            <Textarea value={values.newGoalAreas} onChange={v => onChange("newGoalAreas", v)} placeholder="e.g., Money management, Community safety, Self-regulation..." rows={2} />
          </Field>
        </CardContent>
      </Card>

      {context.needsTransition && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-[14px] font-bold text-gray-800 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-emerald-600" /> Transition Concerns
              <span className="text-[10px] font-normal text-gray-400">Age {context.student.age} — Transition Planning Required</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <Field label="Transition concerns or goals for post-secondary life" hint="Employment, living arrangements, education after high school">
              <Textarea value={values.transitionConcerns} onChange={v => onChange("transitionConcerns", v)} placeholder="e.g., Concerned about what will happen after graduation. Would like supported employment..." />
            </Field>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800">Additional Comments</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <Textarea value={values.additionalComments} onChange={v => onChange("additionalComments", v)} placeholder="Any other information the team should know..." rows={2} />
        </CardContent>
      </Card>
    </div>
  );
}
