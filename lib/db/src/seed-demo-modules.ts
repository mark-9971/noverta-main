/**
 * Demo-only: populate every module on the showcase tour path with
 * representative records for the MetroWest Collaborative demo district.
 *
 * Idempotent. Re-run any time after `seed-demo-district.ts`.
 *
 *   pnpm --filter @workspace/db exec tsx src/seed-demo-modules.ts
 *
 * Affects ONLY the district named "MetroWest Collaborative" (is_demo = true).
 */
import { db } from "./db";
import { sql } from "drizzle-orm";

const TAG = "[demo-modules]";

async function getDistrictId(): Promise<number> {
  const r = await db.execute(sql`SELECT id FROM districts WHERE name='MetroWest Collaborative' AND is_demo=true LIMIT 1`);
  const id = (r.rows[0] as { id: number } | undefined)?.id;
  if (!id) { console.error("MetroWest Collaborative demo district not found."); process.exit(1); }
  return id;
}

type CountRow = { c: number };
async function count(query: ReturnType<typeof sql>): Promise<number> {
  const r = await db.execute(query);
  return (r.rows[0] as CountRow).c;
}

async function seedAgenciesAndContracts(districtId: number) {
  const existing = await count(sql`SELECT COUNT(*)::int AS c FROM agencies WHERE district_id=${districtId} AND notes LIKE ${'%' + TAG + '%'}`);
  if (existing > 0) { console.log("Agencies/contracts: already seeded, skipping."); return; }

  const agencies = [
    { name: "Bay State Behavioral Partners", contact: "Theresa Kelleher", email: "tkelleher@baystatebehavioral.org", phone: "(508) 555-0142", address: "240 Cochituate Rd, Framingham, MA 01701",
      notes: `Contracted ABA + RBT coverage for intensive students. ${TAG}` },
    { name: "MetroWest Therapy Associates", contact: "Daniel Park", email: "dpark@mwtherapy.com", phone: "(508) 555-0188", address: "115 Worcester Rd, Natick, MA 01760",
      notes: `Speech, OT, and PT contract coverage. ${TAG}` },
    { name: "Compass Counseling Group", contact: "Rachel Ng", email: "rng@compass-counseling.org", phone: "(508) 555-0207", address: "88 Main St, Marlborough, MA 01752",
      notes: `Counseling and social-emotional contract coverage. ${TAG}` },
  ];
  const agencyIds: number[] = [];
  for (const a of agencies) {
    const r = await db.execute(sql`
      INSERT INTO agencies (name, district_id, contact_name, contact_email, contact_phone, address, notes, status)
      VALUES (${a.name}, ${districtId}, ${a.contact}, ${a.email}, ${a.phone}, ${a.address}, ${a.notes}, 'active')
      RETURNING id
    `);
    agencyIds.push((r.rows[0] as { id: number }).id);
  }

  const stRows = await db.execute(sql`SELECT id, name FROM service_types ORDER BY id`);
  const sts = stRows.rows as Array<{ id: number; name: string }>;
  const byName = (n: string) => sts.find(x => x.name === n)?.id ?? sts[0].id;

  const contracts = [
    { agency: agencyIds[0], service: byName("ABA Therapy"),              hours: 1200, rate: "72.00", thresh: 80 },
    { agency: agencyIds[0], service: byName("BCBA Consultation"),         hours: 240,  rate: "85.00", thresh: 75 },
    { agency: agencyIds[1], service: byName("Speech-Language Therapy"),   hours: 600,  rate: "68.00", thresh: 80 },
    { agency: agencyIds[1], service: byName("Occupational Therapy"),      hours: 480,  rate: "65.00", thresh: 80 },
    { agency: agencyIds[1], service: byName("Physical Therapy"),          hours: 240,  rate: "70.00", thresh: 80 },
    { agency: agencyIds[2], service: byName("Counseling"),                hours: 720,  rate: "55.00", thresh: 85 },
  ];
  for (const c of contracts) {
    await db.execute(sql`
      INSERT INTO agency_contracts (agency_id, service_type_id, contracted_hours, hourly_rate, start_date, end_date, alert_threshold_pct, status, notes)
      VALUES (${c.agency}, ${c.service}, ${c.hours}, ${c.rate}, '2025-09-01', '2026-06-30', ${c.thresh}, 'active', ${TAG + " SY 2025-26 contract"})
    `);
  }
  console.log(`Agencies: ${agencyIds.length} inserted, ${contracts.length} contracts inserted.`);
}

async function seedCptMappings(districtId: number) {
  const existing = await count(sql`SELECT COUNT(*)::int AS c FROM cpt_code_mappings WHERE district_id=${districtId}`);
  if (existing > 0) { console.log("CPT mappings: already present, skipping."); return; }

  const stRows = await db.execute(sql`SELECT id, name, cpt_code FROM service_types`);
  const sts = stRows.rows as Array<{ id: number; name: string; cpt_code: string | null }>;

  const ratesByName: Record<string, { unit: number; rate: string; mod?: string }> = {
    "ABA Therapy":              { unit: 15, rate: "18.00" },
    "BCBA Consultation":        { unit: 15, rate: "21.25" },
    "Speech-Language Therapy":  { unit: 30, rate: "34.00" },
    "Occupational Therapy":     { unit: 15, rate: "16.25" },
    "Physical Therapy":         { unit: 15, rate: "17.50" },
    "Counseling":               { unit: 60, rate: "55.00" },
  };
  let inserted = 0;
  for (const s of sts) {
    if (!s.cpt_code) continue;
    const cfg = ratesByName[s.name];
    if (!cfg) continue;
    await db.execute(sql`
      INSERT INTO cpt_code_mappings (district_id, service_type_id, cpt_code, modifier, description, unit_duration_minutes, rate_per_unit, place_of_service, is_active)
      VALUES (${districtId}, ${s.id}, ${s.cpt_code}, ${cfg.mod ?? null}, ${s.name + " — " + s.cpt_code}, ${cfg.unit}, ${cfg.rate}, '03', 'true')
    `);
    inserted++;
  }
  console.log(`CPT mappings: ${inserted} inserted.`);
}

async function seedMedicaidClaims(districtId: number) {
  const existing = await count(sql`SELECT COUNT(*)::int AS c FROM medicaid_claims WHERE district_id=${districtId}`);
  if (existing > 0) { console.log(`Medicaid claims: already present (${existing}), skipping.`); return; }

  // Pull a representative slice of completed sessions that have a service_type_id.
  const sessRows = await db.execute(sql`
    SELECT sl.id AS session_id, sl.student_id, sl.staff_id, sl.service_type_id, sl.session_date, sl.duration_minutes,
           m.id AS mapping_id, m.cpt_code, m.modifier, m.unit_duration_minutes, m.rate_per_unit
    FROM session_logs sl
    JOIN students s ON s.id=sl.student_id
    JOIN schools sc ON sc.id=s.school_id
    JOIN cpt_code_mappings m ON m.service_type_id=sl.service_type_id AND m.district_id=${districtId}
    WHERE sc.district_id=${districtId}
      AND sl.status='completed'
      AND sl.deleted_at IS NULL
      AND sl.staff_id IS NOT NULL
      AND sl.duration_minutes >= 15
    ORDER BY sl.session_date DESC
    LIMIT 60
  `);
  const sess = sessRows.rows as Array<{
    session_id: number; student_id: number; staff_id: number; service_type_id: number;
    session_date: string; duration_minutes: number; mapping_id: number; cpt_code: string;
    modifier: string | null; unit_duration_minutes: number; rate_per_unit: string;
  }>;

  // Pick an admin to mark as reviewer.
  const admin = (await db.execute(sql`
    SELECT st.id FROM staff st JOIN schools sc ON sc.id=st.school_id
    WHERE sc.district_id=${districtId} AND st.role='admin' AND st.deleted_at IS NULL ORDER BY st.id LIMIT 1
  `)).rows[0] as { id: number } | undefined;

  // Distribute statuses across the 30 most recent sessions:
  // 12 pending, 8 approved, 6 exported, 6 paid, 4 rejected.
  const buckets: Array<{ status: string; reason: string | null; reviewed: boolean; exported: boolean }> = [
    ...Array(12).fill({ status: "pending",  reason: null,                                          reviewed: false, exported: false }),
    ...Array(8).fill ({ status: "approved", reason: null,                                          reviewed: true,  exported: false }),
    ...Array(6).fill ({ status: "exported", reason: null,                                          reviewed: true,  exported: true  }),
    ...Array(6).fill ({ status: "paid",     reason: null,                                          reviewed: true,  exported: true  }),
    ...Array(2).fill ({ status: "rejected", reason: "Missing diagnosis code on linked IEP",        reviewed: true,  exported: true  }),
    ...Array(2).fill ({ status: "rejected", reason: "Provider NPI not on file with MassHealth",    reviewed: true,  exported: true  }),
  ];
  const slice = sess.slice(0, buckets.length);
  if (slice.length < 12) { console.log("Medicaid claims: not enough completed sessions to seed."); return; }

  let inserted = 0;
  let batch = 0;
  for (let i = 0; i < slice.length; i++) {
    const s = slice[i];
    const b = buckets[i];
    const units = Math.max(1, Math.round(s.duration_minutes / s.unit_duration_minutes));
    const billed = (units * Number(s.rate_per_unit)).toFixed(2);
    const studMedId = `MA${String(100000 + s.student_id).slice(-9)}`;
    const npi = `15${String(7000000000 + s.staff_id).slice(-8)}`;
    const dx = i % 4 === 0 ? "F84.0" : i % 4 === 1 ? "F90.0" : i % 4 === 2 ? "F80.2" : "F81.0";
    const exportBatch = b.exported ? `BATCH-${(b.status === "paid" ? "2026-Q1" : "2026-Q2")}-${String(Math.floor(batch / 6) + 1).padStart(3,"0")}` : null;
    const exportedAt  = b.exported ? sql`NOW() - INTERVAL '${sql.raw(String(7 + (batch % 14)))} days'` : sql`NULL`;
    const reviewedAt  = b.reviewed ? sql`NOW() - INTERVAL '${sql.raw(String(2 + (i % 10)))} days'`    : sql`NULL`;
    const reviewedBy  = b.reviewed && admin?.id ? admin.id : null;

    await db.execute(sql`
      INSERT INTO medicaid_claims (
        session_log_id, student_id, staff_id, service_type_id, cpt_code_mapping_id,
        cpt_code, modifier, place_of_service, service_date, units, unit_duration_minutes, duration_minutes,
        billed_amount, student_medicaid_id, provider_npi, diagnosis_code, status,
        reviewed_by, reviewed_at, rejection_reason, export_batch_id, exported_at, district_id
      ) VALUES (
        ${s.session_id}, ${s.student_id}, ${s.staff_id}, ${s.service_type_id}, ${s.mapping_id},
        ${s.cpt_code}, ${s.modifier}, '03', ${s.session_date}, ${units}, ${s.unit_duration_minutes}, ${s.duration_minutes},
        ${billed}, ${studMedId}, ${npi}, ${dx}, ${b.status},
        ${reviewedBy}, ${reviewedAt}, ${b.reason}, ${exportBatch}, ${exportedAt}, ${districtId}
      )
    `);
    inserted++;
    if (b.exported) batch++;
  }
  console.log(`Medicaid claims: ${inserted} inserted across pending/approved/exported/paid/rejected.`);
}

async function seedCompensatoryDiversity(districtId: number) {
  // Existing 19 obligations are all 'pending'. Diversify in place (idempotent: only changes 'pending' rows).
  const ids = (await db.execute(sql`
    SELECT co.id, co.minutes_owed FROM compensatory_obligations co
    JOIN students s ON s.id=co.student_id JOIN schools sc ON sc.id=s.school_id
    WHERE sc.district_id=${districtId} AND co.status='pending'
    ORDER BY co.id
  `)).rows as Array<{ id: number; minutes_owed: number }>;
  if (ids.length === 0) { console.log("Compensatory: no pending rows to diversify."); return; }

  // Plan: ~30% in_progress, ~25% fulfilled, ~10% on_hold, rest stay pending.
  let updates = 0;
  for (let i = 0; i < ids.length; i++) {
    const o = ids[i];
    if (i % 10 < 3) {
      const delivered = Math.floor(o.minutes_owed * (0.3 + (i % 5) * 0.1));
      await db.execute(sql`
        UPDATE compensatory_obligations
        SET status='in_progress', minutes_delivered=${delivered},
            agreed_date=(CURRENT_DATE - INTERVAL '30 days')::text,
            agreed_with='Parent agreement on file',
            notes=${TAG + " in-progress, make-up sessions scheduled weekly"}
        WHERE id=${o.id}
      `);
      updates++;
    } else if (i % 10 < 6) {
      await db.execute(sql`
        UPDATE compensatory_obligations
        SET status='fulfilled', minutes_delivered=${o.minutes_owed},
            agreed_date=(CURRENT_DATE - INTERVAL '90 days')::text,
            agreed_with='Parent agreement on file',
            notes=${TAG + " fulfilled, all owed minutes delivered"}
        WHERE id=${o.id}
      `);
      updates++;
    } else if (i % 10 === 6) {
      await db.execute(sql`
        UPDATE compensatory_obligations
        SET status='on_hold',
            notes=${TAG + " on hold pending parent meeting to revise plan"}
        WHERE id=${o.id}
      `);
      updates++;
    }
  }
  console.log(`Compensatory obligations: diversified ${updates} of ${ids.length} rows.`);
}

async function seedParentMessageVariety(districtId: number) {
  // Convert some of the existing all-general messages into category variety.
  const tagged = await count(sql`
    SELECT COUNT(*)::int AS c FROM parent_messages pm
    JOIN students s ON s.id=pm.student_id JOIN schools sc ON sc.id=s.school_id
    WHERE sc.district_id=${districtId} AND pm.metadata::text LIKE ${'%' + TAG + '%'}
  `);
  if (tagged > 0) { console.log(`Parent messages: variety already applied (${tagged}), skipping.`); return; }

  const rows = (await db.execute(sql`
    SELECT pm.id FROM parent_messages pm
    JOIN students s ON s.id=pm.student_id JOIN schools sc ON sc.id=s.school_id
    WHERE sc.district_id=${districtId} AND pm.category='general'
    ORDER BY pm.id LIMIT 20
  `)).rows as Array<{ id: number }>;

  const variants: Array<{ category: string; subject: string; body: string }> = [
    { category: "iep_meeting_invitation",
      subject: "Annual IEP Review meeting — please confirm",
      body: "We have scheduled the Annual IEP Review meeting for two weeks from today at 2:30pm. Please reply with your availability or to request an alternate time. An interpreter will be available if needed." },
    { category: "iep_meeting_invitation",
      subject: "Re-evaluation team meeting invitation",
      body: "We are scheduling the triennial re-evaluation team meeting. Please review the attached evaluation consent and let us know convenient dates over the next two weeks." },
    { category: "prior_written_notice",
      subject: "Prior Written Notice — proposed amendment to services",
      body: "This Prior Written Notice describes the proposed amendment to your child's service grid (additional 2x30 OT). The full PWN packet is attached. You have 10 calendar days to respond." },
    { category: "prior_written_notice",
      subject: "Prior Written Notice — change in placement under consideration",
      body: "We are evaluating a change in service delivery model. Attached is the PWN with the proposal, rationale, and your due-process rights." },
    { category: "progress_update",
      subject: "Q2 progress report — IEP goal updates",
      body: "Attached is the Q2 progress report. Highlights: speech goal at 78% mastery, behavior goal trending up, math goal needs additional supports. Please review and reach out with questions." },
    { category: "progress_update",
      subject: "Mid-quarter check-in — mastery on social-emotional goal",
      body: "Wanted to share a quick update — your child has independently used the coping strategies on the BIP in 4 of the last 5 instances of dysregulation. We're celebrating a real win this week." },
    { category: "conference_request",
      subject: "Parent conference request — review behavior plan",
      body: "Could we set up a 30-minute parent conference next week to review the updated behavior intervention plan? Please share two times that work and we will confirm." },
    { category: "conference_request",
      subject: "Conference request — discuss transition planning",
      body: "Now that your student is approaching age 16, we'd like to set up a transition planning conference. We will walk through post-secondary goals, agency referrals, and the 688 referral process." },
  ];

  let updated = 0;
  for (let i = 0; i < rows.length && i < variants.length * 2; i++) {
    const v = variants[i % variants.length];
    await db.execute(sql`
      UPDATE parent_messages
      SET category=${v.category}, subject=${v.subject}, body=${v.body},
          metadata=jsonb_build_object('demoTag', ${TAG})
      WHERE id=${rows[i].id}
    `);
    updated++;
  }
  console.log(`Parent messages: ${updated} reshaped into PWN/IEP-invite/progress/conference categories.`);
}

async function seedShareLinks(districtId: number) {
  const existing = await count(sql`
    SELECT COUNT(*)::int AS c FROM share_links WHERE district_id=${districtId} AND summary LIKE ${'%' + TAG + '%'}
  `);
  if (existing > 0) { console.log(`Share links: already present (${existing}), skipping.`); return; }

  const students = (await db.execute(sql`
    SELECT s.id, s.first_name, s.last_name FROM students s JOIN schools sc ON sc.id=s.school_id
    WHERE sc.district_id=${districtId} AND s.deleted_at IS NULL ORDER BY s.id LIMIT 6
  `)).rows as Array<{ id: number; first_name: string; last_name: string }>;
  const admin = (await db.execute(sql`
    SELECT st.id FROM staff st JOIN schools sc ON sc.id=st.school_id WHERE sc.district_id=${districtId} AND st.role='admin' AND st.deleted_at IS NULL ORDER BY st.id LIMIT 1
  `)).rows[0] as { id: number } | undefined;

  const variants = [
    { offsetDays:  +5, views: 0,  max: null,  revoked: false, label: "active link, 5d remaining" },
    { offsetDays:  +2, views: 3,  max: null,  revoked: false, label: "active link, viewed 3 times" },
    { offsetDays:  +1, views: 1,  max: 1,     revoked: false, label: "one-time link, already viewed" },
    { offsetDays: -10, views: 5,  max: null,  revoked: false, label: "expired link" },
    { offsetDays:  +6, views: 0,  max: null,  revoked: true,  label: "revoked link" },
  ];
  let inserted = 0;
  for (let i = 0; i < Math.min(variants.length, students.length); i++) {
    const stu = students[i];
    const v = variants[i];
    const rand = `demoshare-${stu.id}-${i}-${Date.now()}`;
    await db.execute(sql`
      INSERT INTO share_links (token_hash, student_id, district_id, created_by_user_id, created_by_staff_id,
                               summary, expires_at, view_count, max_views,
                               last_viewed_at, last_viewed_ip, revoked_at, revoked_by_user_id)
      VALUES (
        encode(digest(${rand},'sha256'),'hex'),
        ${stu.id}, ${districtId}, 'demo-admin', ${admin?.id ?? null},
        ${`Q2 progress for ${stu.first_name} ${stu.last_name} ` + TAG + " (" + v.label + ")"},
        NOW() + (${v.offsetDays} || ' days')::interval,
        ${v.views}, ${v.max},
        ${v.views > 0 ? sql`NOW() - INTERVAL '1 day'` : sql`NULL`},
        ${v.views > 0 ? "192.0.2.10" : null},
        ${v.revoked ? sql`NOW() - INTERVAL '2 days'` : sql`NULL`},
        ${v.revoked ? "demo-admin" : null}
      )
    `);
    inserted++;
  }
  console.log(`Share links: ${inserted} inserted across active/used/one-time/expired/revoked.`);
}

async function seedSignatureRequests(districtId: number) {
  const existing = await count(sql`
    SELECT COUNT(*)::int AS c FROM signature_requests sr
    JOIN documents d ON d.id=sr.document_id
    JOIN students s ON s.id=d.student_id JOIN schools sc ON sc.id=s.school_id
    WHERE sc.district_id=${districtId} AND sr.recipient_name LIKE ${'%' + TAG + '%'}
  `);
  if (existing > 0) { console.log(`Signature requests: already present (${existing}), skipping.`); return; }

  const docs = (await db.execute(sql`
    SELECT d.id, d.student_id FROM documents d
    JOIN students s ON s.id=d.student_id JOIN schools sc ON sc.id=s.school_id
    WHERE sc.district_id=${districtId} AND d.deleted_at IS NULL
    ORDER BY d.id LIMIT 8
  `)).rows as Array<{ id: number; student_id: number }>;
  if (docs.length < 4) { console.log("Signature requests: not enough documents to seed."); return; }

  const guardians = (await db.execute(sql`
    SELECT g.id, g.student_id, g.name, g.email FROM guardians g
    WHERE g.student_id = ANY(${sql`ARRAY[${sql.join(docs.map(d => sql`${d.student_id}`), sql`, `)}]`}::int[])
      AND g.email IS NOT NULL
  `)).rows as Array<{ id: number; student_id: number; name: string; email: string }>;
  const guardianFor = (studentId: number) =>
    guardians.find(g => g.student_id === studentId) ?? { name: "Parent/Guardian", email: `parent${studentId}@example.com` };

  const variants = [
    { status: "pending",  daysAgo: 1,  signed: false, expDays: 29, label: "pending — sent 1d ago" },
    { status: "pending",  daysAgo: 5,  signed: false, expDays: 25, label: "pending — sent 5d ago, viewed twice", views: 2 },
    { status: "signed",   daysAgo: 10, signed: true,  expDays: 20, label: "signed 8d ago" },
    { status: "expired",  daysAgo: 35, signed: false, expDays: -5, label: "expired without signature" },
  ];
  let inserted = 0;
  for (let i = 0; i < variants.length && i < docs.length; i++) {
    const doc = docs[i];
    const v = variants[i];
    const g = guardianFor(doc.student_id);
    const rand = `demosig-${doc.id}-${i}-${Date.now()}`;
    await db.execute(sql`
      INSERT INTO signature_requests (
        document_id, recipient_name, recipient_email, token_hash,
        status, signed_at, signature_data,
        created_at, expires_at, view_count, last_viewed_at, last_viewed_ip
      ) VALUES (
        ${doc.id},
        ${g.name + " " + TAG + " (" + v.label + ")"},
        ${g.email},
        encode(digest(${rand},'sha256'),'hex'),
        ${v.status},
        ${v.signed ? sql`NOW() - INTERVAL '${sql.raw(String(v.daysAgo - 2))} days'` : sql`NULL`},
        ${v.signed ? g.name : null},
        NOW() - (${v.daysAgo} || ' days')::interval,
        NOW() + (${v.expDays} || ' days')::interval,
        ${(v as { views?: number }).views ?? 0},
        ${(v as { views?: number }).views ? sql`NOW() - INTERVAL '1 day'` : sql`NULL`},
        ${(v as { views?: number }).views ? "192.0.2.20" : null}
      )
    `);
    inserted++;
  }
  console.log(`Signature requests: ${inserted} inserted across pending/signed/expired.`);
}

async function seedTransitionPlans(districtId: number) {
  const existing = await count(sql`
    SELECT COUNT(*)::int AS c FROM transition_plans tp
    JOIN students s ON s.id=tp.student_id JOIN schools sc ON sc.id=s.school_id
    WHERE sc.district_id=${districtId} AND tp.notes LIKE ${'%' + TAG + '%'}
  `);
  if (existing > 0) { console.log(`Transition plans: already present (${existing}), skipping.`); return; }

  const teens = (await db.execute(sql`
    SELECT s.id, s.first_name, s.last_name, s.grade FROM students s JOIN schools sc ON sc.id=s.school_id
    WHERE sc.district_id=${districtId} AND s.deleted_at IS NULL AND s.grade IN ('9','10','11','12')
    ORDER BY s.id
  `)).rows as Array<{ id: number; first_name: string; last_name: string; grade: string }>;
  if (teens.length === 0) { console.log("Transition plans: no grade 9-12 students."); return; }

  const coordinator = (await db.execute(sql`
    SELECT st.id FROM staff st JOIN schools sc ON sc.id=st.school_id WHERE sc.district_id=${districtId} AND st.role='coordinator' AND st.deleted_at IS NULL ORDER BY st.id LIMIT 1
  `)).rows[0] as { id: number } | undefined;

  const planVariants = [
    { status: "active",  pathway: "diploma",       diploma: "MA Competency Determination", vision: "Attend community college and study computer science. Live independently within 5 years." },
    { status: "active",  pathway: "diploma",       diploma: "MA Competency Determination", vision: "Pursue automotive technology certification at vocational school. Hold a part-time job during senior year." },
    { status: "active",  pathway: "certificate",   diploma: "Certificate of Attainment",   vision: "Participate in a supported employment program through MRC. Continue community-based instruction." },
    { status: "draft",   pathway: "diploma",       diploma: "MA Competency Determination", vision: "Explore careers in the healthcare field. Interested in CNA training." },
    { status: "active",  pathway: "diploma",       diploma: "MA Competency Determination", vision: "Major in graphic design. Live in supervised college housing during freshman year." },
    { status: "active",  pathway: "certificate",   diploma: "Certificate of Attainment",   vision: "Participate in 18-22 transition program. Develop daily-living and pre-vocational skills." },
    { status: "draft",   pathway: "diploma",       diploma: "MA Competency Determination", vision: "Attend a four-year college; interested in studying psychology and sociology." },
    { status: "active",  pathway: "diploma",       diploma: "MA Competency Determination", vision: "Pursue welding apprenticeship after graduation. Work alongside uncle's contracting business." },
  ];

  const goals = [
    { domain: "employment",      goal: "Complete a paid summer internship in chosen career area",       criteria: "Work 8+ weeks, 15+ hours/wk; supervisor evaluation 'satisfactory' or higher" },
    { domain: "education",       goal: "Tour 3 post-secondary programs aligned with vision statement", criteria: "Document tours; complete reflection sheet for each" },
    { domain: "independent_living", goal: "Independently use public transit between home and school",   criteria: "20 consecutive trips with no adult support" },
    { domain: "community",       goal: "Identify and access 2 community-based recreation programs",     criteria: "Enroll and attend monthly for full quarter" },
  ];

  let plansInserted = 0, goalsInserted = 0, refsInserted = 0;
  for (let i = 0; i < Math.min(teens.length, planVariants.length); i++) {
    const stu = teens[i];
    const v = planVariants[i];
    const planRow = await db.execute(sql`
      INSERT INTO transition_plans (
        student_id, plan_date, age_of_majority_notified, age_of_majority_date,
        graduation_pathway, expected_graduation_date, diploma_type,
        credits_earned, credits_required, assessments_used,
        student_vision_statement, coordinator_id, status, notes
      ) VALUES (
        ${stu.id}, (CURRENT_DATE - INTERVAL '60 days')::text,
        ${stu.grade === "12" || stu.grade === "11"}, ${stu.grade === "12" ? "2026-05-15" : null},
        ${v.pathway}, ${stu.grade === "12" ? "2026-06-04" : stu.grade === "11" ? "2027-06-04" : "2028-06-04"},
        ${v.diploma}, ${stu.grade === "12" ? "108" : stu.grade === "11" ? "78" : "52"}, '120',
        ${"PEATC, ASSET vocational interest, Brigance Transition Skills Inventory"},
        ${v.vision}, ${coordinator?.id ?? null}, ${v.status},
        ${TAG + " transition plan for grade " + stu.grade}
      )
      RETURNING id
    `);
    const planId = (planRow.rows[0] as { id: number }).id;
    plansInserted++;

    for (let g = 0; g < 3; g++) {
      const goal = goals[(i + g) % goals.length];
      await db.execute(sql`
        INSERT INTO transition_goals (transition_plan_id, domain, goal_statement, measurable_criteria, activities, responsible_party, target_date, status, progress_notes)
        VALUES (${planId}, ${goal.domain}, ${goal.goal}, ${goal.criteria},
                ${"Coordinated with case manager and family"},
                ${"Case manager + family"},
                ${stu.grade === "12" ? "2026-05-30" : "2026-12-15"},
                ${g === 0 ? "in_progress" : g === 1 ? "active" : "active"},
                ${TAG + " " + (g === 0 ? "trending toward mastery" : "underway")})
      `);
      goalsInserted++;
    }

    const refs = [
      { name: "Massachusetts Rehabilitation Commission (MRC)", type: "vocational",       contact: "Sandra Lopez, MRC Counselor", phone: "(508) 626-0102", email: "slopez@mass.gov", status: "accepted" },
      { name: "Department of Developmental Services",          type: "adult_services",   contact: "Daniel Greene, DDS Liaison",  phone: "(508) 879-5610", email: "dgreene@mass.gov", status: "pending"  },
    ];
    for (let r = 0; r < (i % 2 === 0 ? 2 : 1); r++) {
      const ref = refs[r];
      await db.execute(sql`
        INSERT INTO transition_agency_referrals (transition_plan_id, agency_name, agency_type, contact_name, contact_phone, contact_email, referral_date, status, follow_up_date, notes)
        VALUES (${planId}, ${ref.name}, ${ref.type}, ${ref.contact}, ${ref.phone}, ${ref.email},
                (CURRENT_DATE - INTERVAL '45 days')::text, ${ref.status},
                (CURRENT_DATE + INTERVAL '15 days')::text,
                ${TAG + " 688 referral / agency linkage"})
      `);
      refsInserted++;
    }
  }
  console.log(`Transition: ${plansInserted} plans, ${goalsInserted} goals, ${refsInserted} agency referrals inserted.`);
}

async function seedExportHistory(districtId: number) {
  const existing = await count(sql`SELECT COUNT(*)::int AS c FROM export_history WHERE district_id=${districtId} AND file_name LIKE ${'%' + TAG + '%'}`);
  if (existing > 0) { console.log(`Export history: already present (${existing}), skipping.`); return; }

  const exports = [
    { type: "compliance",      label: "Compliance Risk Report — Q2 2026",       fmt: "csv", count: 42, warn: 9 },
    { type: "compliance",      label: "Service Minute Summary — March 2026",    fmt: "csv", count: 42, warn: 0 },
    { type: "medicaid",        label: "Medicaid Claim Export — Batch 2026-Q2-001", fmt: "csv", count: 18, warn: 2 },
    { type: "medicaid",        label: "Medicaid Claim Export — Batch 2026-Q1-003", fmt: "csv", count: 24, warn: 0 },
    { type: "session_logs",    label: "Session Logs — All providers, March 2026", fmt: "csv", count: 612, warn: 0 },
    { type: "iep_calendar",    label: "Annual IEP Calendar — SY 2025-2026",     fmt: "pdf", count: 42, warn: 1 },
    { type: "restraint",       label: "Restraint Incidents — DESE 30-day log",  fmt: "pdf", count: 5,  warn: 0 },
    { type: "progress_report", label: "Q2 Progress Reports — Bulk PDF",         fmt: "pdf", count: 38, warn: 4 },
    { type: "leadership_packet", label: "Leadership Packet — March Board Meeting", fmt: "pdf", count: 1, warn: 0 },
    { type: "compensatory",    label: "Compensatory Obligation Tracker",        fmt: "csv", count: 19, warn: 0 },
  ];
  let inserted = 0;
  for (let i = 0; i < exports.length; i++) {
    const e = exports[i];
    await db.execute(sql`
      INSERT INTO export_history (report_type, report_label, exported_by, district_id, format, parameters, record_count, warning_count, file_name, created_at)
      VALUES (
        ${e.type}, ${e.label}, 'Ellen Donahue', ${districtId}, ${e.fmt},
        ${sql`${JSON.stringify({ districtId, dateRange: "2026-01-01..2026-04-15" })}::jsonb`},
        ${e.count}, ${e.warn},
        ${`${e.type}_${i}.${e.fmt} ${TAG}`},
        NOW() - (${i + 1} || ' days')::interval
      )
    `);
    inserted++;
  }
  console.log(`Export history: ${inserted} inserted.`);
}

async function tally(districtId: number) {
  const r = await db.execute(sql`
    WITH d_students AS (SELECT s.id FROM students s JOIN schools sc ON sc.id=s.school_id WHERE sc.district_id=${districtId} AND s.deleted_at IS NULL),
         affected AS (SELECT DISTINCT a.student_id FROM alerts a JOIN d_students ds ON ds.id=a.student_id WHERE a.resolved=false)
    SELECT (SELECT COUNT(*) FROM d_students) AS total,
           (SELECT COUNT(*) FROM affected)   AS non_compliant,
           ROUND(100.0 * (1 - (SELECT COUNT(*) FROM affected)::numeric / NULLIF((SELECT COUNT(*) FROM d_students),0)), 1) AS compliance_pct
  `);
  const t = r.rows[0] as { total: number; non_compliant: number; compliance_pct: string };
  console.log(`Compliance still ${t.compliance_pct}%  (${t.non_compliant} of ${t.total})`);
}

async function main() {
  const districtId = await getDistrictId();
  console.log(`Sweeping demo modules for district ${districtId}...`);
  await seedAgenciesAndContracts(districtId);
  await seedCptMappings(districtId);
  await seedMedicaidClaims(districtId);
  await seedCompensatoryDiversity(districtId);
  await seedParentMessageVariety(districtId);
  await seedShareLinks(districtId);
  await seedSignatureRequests(districtId);
  await seedTransitionPlans(districtId);
  await seedExportHistory(districtId);
  await tally(districtId);
}

main().catch((e) => { console.error(e); process.exit(1); });
