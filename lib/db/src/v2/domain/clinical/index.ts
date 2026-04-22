/**
 * Seed Overhaul V2 — Domain / Clinical content banks.
 *
 * Extracted from `seed-sample-data.ts` (W2). The IEP goal bank
 * (annual goal text + baselines + criteria) and the accommodation
 * bank live here. The actual `iep_goals` / `accommodations` row inserts
 * still live inside `seedSampleDataForDistrict()` because they need the
 * inserted student IDs as foreign keys — moving the insert glue is a
 * W3 (simulator wave) concern.
 *
 * Behavior is byte-identical to the pre-W2 inline definitions.
 */

// ──────────────────────────────────────────────────────────────────
// Goal content bank (varied across goal areas)
// ──────────────────────────────────────────────────────────────────
export const GOAL_BANK: Record<
  string,
  Array<{ annual: string; baseline: string; criterion: string }>
> = {
  "Communication": [
    { annual: "Student will initiate a topic-relevant comment during structured group discussions with 80% accuracy across 3 consecutive sessions.", baseline: "Student currently initiates comments 1–2 times per session with 30% relevance.", criterion: "80% accuracy across 3 consecutive sessions" },
    { annual: "Student will use AAC device to request preferred items in 4 of 5 opportunities without prompting.", baseline: "Student requires maximum prompting (hand-over-hand) to activate AAC device.", criterion: "4/5 opportunities independently" },
    { annual: "Student will produce multi-word utterances (3+ words) during structured play with 75% intelligibility.", baseline: "Student produces primarily single words; 40% intelligibility to unfamiliar listeners.", criterion: "75% intelligibility, 3+ word utterances across 4 probes" },
  ],
  "Social Skills": [
    { annual: "Student will initiate peer interaction during unstructured lunch/recess 3 times per week across 4 consecutive weeks.", baseline: "Student engages only when directly approached; peer initiations average <1/week.", criterion: "3 peer-initiated interactions per week across 4 consecutive weeks" },
    { annual: "Student will identify and label 5 basic emotions in self and peers using visual supports with 90% accuracy.", baseline: "Student labels 2 emotions (happy, sad) with 60% accuracy; requires adult support.", criterion: "90% accuracy across 2 consecutive probes" },
  ],
  "Self-Regulation": [
    { annual: "Student will independently use a self-monitoring checklist to transition between activities within 3 minutes, 80% of opportunities.", baseline: "Student requires 1:1 adult support to transition; average time 8–12 minutes.", criterion: "≤3 minutes independently, 80% of transitions" },
    { annual: "Student will use a calm-down strategy from the co-regulation menu in 4 of 5 observed escalation precursors without adult prompt.", baseline: "Student has not yet demonstrated independent use of any calm-down strategy.", criterion: "4/5 opportunities without adult prompt" },
    { annual: "Student will complete a 15-minute independent work block with <2 off-task behaviors per interval recording.", baseline: "Student averages 6–8 off-task behaviors per 15-minute block; requires frequent redirects.", criterion: "<2 off-task behaviors per 15-min block across 3 consecutive sessions" },
  ],
  "Academics": [
    { annual: "Student will decode multisyllabic words using syllable division strategies with 75% accuracy on grade-level passages.", baseline: "Student decodes CVC/CVCE patterns at 60%; multisyllabic accuracy is 25%.", criterion: "75% accuracy on grade-level decodable text, 3 consecutive probes" },
    { annual: "Student will solve two-step word problems involving addition and subtraction within 1,000 with 80% accuracy.", baseline: "Student solves single-step addition problems to 100 at 70%; multi-step at 20%.", criterion: "80% accuracy across 5 consecutive sessions" },
    { annual: "Student will produce a 3-paragraph expository essay using a graphic organizer with 80% of target components present.", baseline: "Student writes 1–2 disorganized sentences; does not independently use organizers.", criterion: "80% of rubric components present across 3 essays" },
  ],
  "Behavior": [
    { annual: "Student will maintain appropriate proximity to peers (≥18 inches) during class transitions in 9 of 10 observed opportunities.", baseline: "Student invades peer space in 60% of transitions; BIP recently initiated.", criterion: "9/10 opportunities across 4 consecutive school days" },
    { annual: "Student will accept redirection from adults without verbal or physical protest in 85% of observed trials.", baseline: "Student protests redirection (verbal: 70%, physical: 30% of trials).", criterion: "85% of trials across 3 consecutive days" },
  ],
  "Transition": [
    { annual: "Student will research and identify 3 post-secondary education programs aligned with career interests using online resources with 80% task completion.", baseline: "Student has not yet engaged in post-secondary planning activities.", criterion: "80% task completion across 3 independent work sessions" },
    { annual: "Student will complete a job application form accurately with ≤2 errors per form across 3 trials.", baseline: "Student requires step-by-step adult guidance to complete application sections.", criterion: "≤2 errors per form, 3 consecutive trials" },
    { annual: "Student will demonstrate mastery of 5 self-advocacy statements describing their disability-related needs in 4 of 4 role-play scenarios.", baseline: "Student cannot articulate accommodation needs without adult scripting.", criterion: "4/4 role-play scenarios across 2 consecutive probes" },
  ],
};

// ──────────────────────────────────────────────────────────────────
// Accommodation bank (drawn 3–4× per student)
// ──────────────────────────────────────────────────────────────────
export const ACCOM_BANK = [
  { category: "instruction",   description: "Extended time on assignments and assessments (time and one-half)" },
  { category: "instruction",   description: "Preferential seating near teacher and away from distractions" },
  { category: "instruction",   description: "Visual schedule and advance notice of transitions" },
  { category: "instruction",   description: "Directions chunked and repeated; use of check-in questions" },
  { category: "instruction",   description: "Reduced assignment length while maintaining rigor" },
  { category: "assessment",    description: "Small-group or individual testing environment" },
  { category: "assessment",    description: "Oral responses accepted in lieu of written work" },
  { category: "environmental", description: "Access to sensory tools (fidget, weighted lap pad, noise-cancelling headphones)" },
  { category: "environmental", description: "Movement breaks every 20–30 minutes" },
  { category: "behavioral",    description: "Daily check-in/check-out with case manager" },
  { category: "behavioral",    description: "Social narrative review before high-demand periods" },
  { category: "technology",    description: "Text-to-speech software for reading tasks" },
  { category: "technology",    description: "Speech-to-text software for written expression tasks" },
];
