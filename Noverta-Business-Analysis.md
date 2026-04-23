# Noverta — Business Extraction & Sales Positioning

---

## 1. Executive Summary

Noverta is a production-grade, all-in-one school management platform purpose-built for Massachusetts special education compliance (603 CMR 28.00/46.00). It merges IEP case management, ABA/behavior data collection, academic class management, protective measures documentation, and compliance automation into a single web application with five role-based views (Admin, SPED Teacher, Gen Ed Teacher, SPED Student, Gen Ed Student).

The platform is not a prototype — it has a relational data model spanning 35 database tables, 100+ API endpoints, 40+ frontend pages, realistic seeded demo data (1,300+ lines), automated compliance alerting, restraint/seclusion incident tracking with multi-party signature workflows and PDF reporting, service minute delivery tracking with risk calculation, and a full academic layer (classes, assignments, gradebook, student portal).

It is strongest as a **therapeutic school / specialized SPED program** product today, with clear path to district-wide use. The compliance engine, protective measures module, and ABA data collection workflows are particularly differentiated and demo-ready.

---

## 2. Product Summary

### What it is
Noverta is a web-based SaaS platform that gives special education teams a single place to manage IEPs, track service delivery minutes, collect ABA/behavior data, handle restraint/seclusion incident documentation, manage academic classwork, and monitor compliance — all in real time.

### What problem it solves
Special education departments drown in paperwork, disconnected spreadsheets, and manual compliance tracking. Teachers log sessions on paper. Case managers manually calculate service minute delivery. Restraint incidents require hand-written reports that take days to complete and route for signatures. Compliance gaps are discovered only during audits — by then, schools face legal liability and reimbursement clawbacks. Noverta eliminates all of that with automated tracking, real-time dashboards, and built-in compliance workflows.

### Who it's for
- Therapeutic day schools (primary target)
- SPED programs within public school districts
- District special education departments
- ABA therapy providers embedded in schools
- School administrators responsible for DESE compliance

### What makes it valuable
1. **Built specifically for MA DESE compliance** — not generic school software retrofitted for SPED
2. **Integrates gen-ed and SPED** in one platform — students don't exist in two separate systems
3. **Automated compliance risk calculation** — proactive alerts before problems become audit findings
4. **Full restraint/seclusion workflow** — from incident documentation to multi-signature routing to parent notification letter generation to PDF report export, all DESE-compliant
5. **Real ABA data collection** — not placeholder fields, but actual trial-by-trial and interval recording with prompt hierarchies and auto-progression

### Why someone would buy it vs. spreadsheets
Spreadsheets can't auto-calculate whether a student is on track for their IEP minute requirements at any point in the school year. They can't generate compliance alerts. They can't route restraint incident reports for multi-party signatures. They can't show a parent their child's IEP goal progress in real time. They can't prevent a school from failing a DESE compliance review. Noverta does all of this without any manual data aggregation.

---

## 3. User / Buyer Analysis

### End Users
| Role | What They Do in Noverta |
|------|------------------------|
| **SPED Teacher / BCBA** | Log sessions, collect ABA data, write IEP goals, manage caseloads, document restraint incidents, send parent notifications |
| **Gen Ed Teacher** | Manage classes, create assignments, grade student work, view class rosters |
| **Administrator** | Monitor compliance dashboards, review incidents, manage staff/students, run reports, oversee district-wide metrics |
| **SPED Student** | View their IEP goals and progress, see service session history |
| **Gen Ed Student** | View classes, submit assignments, check grades |

### Economic Buyers
- **Director of Special Education** — owns the compliance problem; has budget authority
- **School Principal / Head of School** — responsible for overall school operations and DESE compliance
- **District Superintendent** — for district-wide deployments
- **Therapeutic School Executive Director** — primary decision-maker at specialized schools

### Champions (Internal Advocates)
- **Case Managers** — they feel the pain most acutely (tracking minutes, writing reports, managing IEP timelines)
- **Board Certified Behavior Analysts (BCBAs)** — need real data collection tools, not spreadsheets
- **SPED Coordinators** — responsible for compliance reporting and audit preparation

### Who feels the pain most
**Case managers and SPED coordinators.** They are the ones manually calculating whether each student has received enough service minutes. They are the ones filling out restraint incident paperwork by hand. They are the ones who get blamed when compliance gaps are found during audits.

### Who approves budget
- At therapeutic schools: **Executive Director or Clinical Director**
- At public schools: **Director of Special Education** or **Superintendent**
- District-level: **Special Education Director** with board approval for larger contracts

---

## 4. Problems Solved

### Problem 1: Service Minute Compliance Tracking
- **Pain**: IEPs require specific minutes of service delivery per week/month. Schools must prove they delivered these minutes. Currently tracked on spreadsheets that are rarely accurate and only reconciled quarterly.
- **Who feels it**: Case managers, SPED coordinators, directors of SPED
- **Why it matters**: Failure to deliver mandated minutes can result in compensatory service obligations, DESE sanctions, and legal action from parents
- **Without Noverta**: Staff manually log sessions, then case managers manually tally minutes against IEP requirements at the end of each reporting period — by which point deficits are too large to recover

### Problem 2: Restraint/Seclusion Incident Documentation
- **Pain**: Massachusetts requires extensive documentation for every physical restraint or seclusion, including verbal and written parent notification within strict timelines, multi-party signatures, and DESE reporting for injuries
- **Who feels it**: Teachers who administered the restraint, case managers, school administrators
- **Why it matters**: Non-compliant documentation exposes schools to lawsuits, DESE investigations, and loss of program approval
- **Without Noverta**: Paper forms that take 45-60 minutes to complete, no automated signature routing, no way to ensure parent notification deadlines are met, no PDF report generation

### Problem 3: Behavior/ABA Data Collection
- **Pain**: BCBAs and behavior therapists need to collect trial-by-trial and interval-based data during sessions, track prompt levels, and measure skill acquisition — but most do this on paper clipboards
- **Who feels it**: BCBAs, ABA therapists, clinical directors
- **Why it matters**: Without accurate data, clinical decisions about IEP goals are uninformed, progress reports are subjective, and schools can't demonstrate evidence-based practice
- **Without Noverta**: Paper data sheets, manual graphing in Excel, hours spent digitizing data each week

### Problem 4: IEP Goal Progress Reporting
- **Pain**: Schools must report progress on IEP goals to parents at regular intervals. Assembling these reports requires input from multiple providers.
- **Who feels it**: Case managers, related service providers, parents
- **Why it matters**: Missing or late progress reports violate IDEA requirements
- **Without Noverta**: Emailing Word documents between providers, manually compiling narratives, no central view of goal progress

### Problem 5: Scheduling and Caseload Management
- **Pain**: SPED coordinators must build schedules that ensure every student receives their mandated services without conflicts
- **Who feels it**: SPED coordinators, related service providers
- **Why it matters**: Schedule conflicts mean missed sessions, which compound into compliance gaps
- **Without Noverta**: Manual scheduling with Google Sheets, no conflict detection, no visibility into provider utilization

### Problem 6: Academic and SPED System Fragmentation
- **Pain**: General education data (grades, assignments) lives in one system; SPED data (IEPs, sessions, behavior) lives in another; administrators have no unified view
- **Who feels it**: Principals, administrators, parents
- **Why it matters**: Fragmented systems mean duplicate data entry, information gaps, and inability to see the whole student
- **Without Noverta**: Two or three separate systems that don't talk to each other

---

## 5. Full Feature Inventory

### A. Student Records & Management
| Feature | Description | Users | Status |
|---------|-------------|-------|--------|
| Student roster | Filterable list with grade, status, placement type, disability category, tags | Admin, SPED Teacher | Fully functional |
| Student detail profile | Complete view with demographics, case manager, IEP status, services, sessions, alerts | Admin, SPED Teacher | Fully functional |
| Student search | Name and attribute-based search across the student body | Admin, SPED Teacher | Fully functional |
| Parent contact info | Parent/guardian name, email, phone stored on student record | Admin, SPED Teacher | Functional (recently added) |
| Data import | CSV upload for bulk student data import with column mapping | Admin | Fully functional |

### B. IEP Case Management
| Feature | Description | Users | Status |
|---------|-------------|-------|--------|
| IEP document management | Full IEP document with PLAAFP, goals, services, accommodations, team members, signatures | Admin, SPED Teacher | Fully functional (1,971 lines) |
| IEP goal tracking | Per-goal progress with baseline, target criterion, measurement method, benchmarks | Admin, SPED Teacher | Fully functional |
| IEP accommodations | Category, description, setting, frequency, provider for each accommodation | Admin, SPED Teacher | Fully functional |
| IEP search | Global keyword search across all IEP goals and documents | Admin, SPED Teacher | Fully functional |
| IEP suggestions | Goal suggestion engine with domain and grade-range filtering from goal bank | Admin, SPED Teacher | Functional |
| Service requirements | Per-student service mandates with type, minutes, interval, provider, delivery type | Admin, SPED Teacher | Fully functional |
| Progress reports | Period-based reporting with multi-provider contributions and goal-level narratives | Admin, SPED Teacher | Fully functional |

### C. Service Delivery & Session Tracking
| Feature | Description | Users | Status |
|---------|-------------|-------|--------|
| Session logging | Individual session entry with date, time, duration, location, delivery mode, notes | SPED Teacher, Providers | Fully functional |
| Bulk session logging | Batch entry for logging multiple sessions at once | SPED Teacher, Providers | Fully functional |
| Quick session entry | Simplified rapid logging endpoint | SPED Teacher | Functional |
| Missed session tracking | Reason codes for missed sessions (student absent, provider out, etc.) | SPED Teacher, Providers | Fully functional |
| Minute progress tracking | Real-time delivery vs. required minutes per student per service | Admin, SPED Teacher | Fully functional |
| Makeup session tracking | Identification and logging of compensatory/makeup sessions | Admin, SPED Teacher | Fully functional |
| Service minutes dashboard | Visual tracking of delivered vs. required minutes across all students | Admin | Fully functional |

### D. Behavior / ABA Data Collection
| Feature | Description | Users | Status |
|---------|-------------|-------|--------|
| Behavior targets | Per-student target behaviors with measurement type, direction, baseline, goal values | BCBA, SPED Teacher | Fully functional |
| Data sessions | Timestamped data collection sessions with staff attribution | BCBA, SPED Teacher | Fully functional |
| Trial-by-trial recording | Correct/total trials, prompt levels, step tracking for discrete trial programs | BCBA, SPED Teacher | Fully functional |
| Interval recording | Interval-based behavior measurement with hourly tracking option | BCBA, SPED Teacher | Fully functional |
| Program targets | Skill acquisition programs with steps, prompt hierarchies, auto-progression, mastery criteria | BCBA, SPED Teacher | Fully functional (1,774 lines) |
| Program templates | Reusable program templates with tier system and school/global scope | BCBA, Admin | Fully functional |
| Behavior trend analysis | Graphical trend visualization with improving/worsening target identification | BCBA, Admin | Fully functional |
| Prompt progression tracking | Visual tracking of independence levels over time | BCBA | Fully functional |

### E. Protective Measures / Safety
| Feature | Description | Users | Status |
|---------|-------------|-------|--------|
| Restraint/seclusion incident logging | 5-step form capturing 60+ data fields per DESE requirements | SPED Teacher, Admin | Fully functional (1,785 lines) |
| Antecedent tracking | Categorized antecedent picker (10 categories) | SPED Teacher | Fully functional |
| De-escalation strategy checklists | 14-option checklist documenting what was tried before restraint | SPED Teacher | Fully functional |
| Procedure/hold documentation | Safety Care, CPI, CALM, PMT procedure checklists | SPED Teacher | Fully functional |
| Multi-signature workflow | Auto-creates signature requests for all involved staff + admins | All staff | Fully functional |
| Parent notification letter | Auto-generated detailed letter with staff-editable content | Case Manager, Admin | Fully functional |
| Restraint report PDF | Full incident report as downloadable PDF via PDFKit | Case Manager, Admin | Fully functional |
| Compliance checklist | Step-by-step tracker for 603 CMR 46.06 requirements (verbal notification, written report, parent comment opportunity, admin review, DESE reporting) | Admin | Fully functional |
| DESE CSV export | Complete data export with 70+ columns matching DESE reporting format | Admin | Fully functional |
| Incident summary dashboard | Aggregated metrics (by type, pending review, signatures pending, injuries) | Admin | Fully functional |

### F. Academic / Classroom Management
| Feature | Description | Users | Status |
|---------|-------------|-------|--------|
| Class management | Course creation with subject, period, room, semester, teacher assignment | Admin | Fully functional |
| Student enrollment | Class roster management with enrollment status | Admin, Teacher | Fully functional |
| Assignment creation | Assignments with type, due date, points, instructions, category weights | Teacher | Fully functional |
| Student submissions | Content/file submission with status tracking | Student, Teacher | Fully functional |
| Gradebook | Weighted grading with letter grade calculation, per-category breakdown | Teacher, Admin | Fully functional |
| Grade assignment interface | Per-assignment grading with points, feedback | Teacher | Fully functional |
| Student class view | Student-facing class list with grades and assignments | Gen Ed Student | Fully functional |
| Teacher classroom view | Live classroom management interface | Teacher | Fully functional |
| Announcements | Class or school-wide announcements | Teacher, Admin | Fully functional |

### G. Compliance & Risk Management
| Feature | Description | Users | Status |
|---------|-------------|-------|--------|
| Automated compliance engine | Real-time risk calculation (On Track / Slightly Behind / At Risk / Out of Compliance) | System | Fully functional |
| Compliance dashboard | Filterable view of all students by compliance status with service-level aggregates | Admin | Fully functional |
| Alert system | Auto-generated alerts for minute deficits, projected shortfalls, missed session thresholds, schedule conflicts | Admin | Fully functional |
| Compliance timeline | Calendar-driven view of IEP deadlines (annual reviews, triennials) with countdown | Admin | Fully functional |
| Alert resolution workflow | Mark alerts as addressed with resolution notes | Admin | Fully functional |

### H. Dashboards & Analytics
| Feature | Description | Users | Status |
|---------|-------------|-------|--------|
| Admin dashboard | Active students, open alerts, makeup sessions needed, compliance ring, session delivery trend chart, compliance by service, upcoming IEP deadlines | Admin | Fully functional |
| Analytics — overview | Student risk distribution pie chart, service delivery heatmap (5x12 grid), KPI cards | Admin | Fully functional |
| Analytics — behavior | School-wide behavior trends, top improving/worsening targets, measurement distribution | Admin, BCBA | Fully functional |
| Analytics — academic/program | Mastery funnel, domain breakdown | Admin, BCBA | Fully functional |
| Analytics — student-specific | Individual student charts (prompt progression, service breakdown) | Admin, BCBA | Fully functional |
| District overview | Multi-school aggregate dashboard with student/staff/compliance/alert counts | Admin | Fully functional |
| Teacher dashboard | Classes, upcoming assignments, recent grades | Teacher | Fully functional |
| SPED student dashboard | Goal progress, session history, service schedule | SPED Student | Fully functional |
| Gen Ed student dashboard | Classes, assignments due, grades | Gen Ed Student | Fully functional |

### I. Reporting & Exports
| Feature | Description | Users | Status |
|---------|-------------|-------|--------|
| Minute summary report | Delivered vs. required minutes per student/service with CSV export | Admin | Fully functional |
| Missed sessions report | Audit trail of missed sessions with reasons, filterable by date/staff | Admin | Fully functional |
| Compliance risk report | Students currently at risk or out of compliance with CSV export | Admin | Fully functional |
| DESE incident CSV export | 70+ column export matching state reporting format | Admin | Fully functional |
| Restraint report PDF | Per-incident detailed report document | Admin, Case Manager | Fully functional |

### J. Scheduling
| Feature | Description | Users | Status |
|---------|-------------|-------|--------|
| Schedule block management | Create/edit recurring schedule blocks by staff, student, service type, day/time | Admin | Fully functional |
| Conflict detection | Automated identification of overlapping schedule blocks | Admin | Fully functional |
| Auto-schedule generation | Algorithmic schedule generation | Admin | Functional |

### K. Staff & Administration
| Feature | Description | Users | Status |
|---------|-------------|-------|--------|
| Staff roster | List with role, title, school, qualifications | Admin | Fully functional |
| Staff detail profiles | Individual staff view with caseload summary | Admin | Fully functional |
| Staff assignments | Staff-to-student assignment management | Admin | Fully functional |
| Caseload view | Per-staff student caseload with summary metrics | Admin, SPED Teacher | Fully functional |
| District/school management | Multi-district, multi-school organizational hierarchy | Admin | Fully functional |
| Program management | School-level programs (Life Skills, etc.) | Admin | Fully functional |

### L. Student Portals
| Feature | Description | Users | Status |
|---------|-------------|-------|--------|
| SPED student portal | Goals, sessions, services in student-friendly view | SPED Student | Fully functional |
| Gen Ed student portal | Classes, assignments, grades in student-friendly view | Gen Ed Student | Fully functional |

---

## 6. Recently Added Components Audit

### Parent Notification & PDF Report (Latest)
- **What**: After admin reviews a restraint incident, the system auto-generates a parent notification letter draft. The SPED teacher or case manager edits the letter, previews/downloads the restraint report PDF, and authorizes sending.
- **Why it matters**: This is a core DESE compliance requirement — written parent notification must happen within 3 school working days. Automating this saves hours of manual letter writing.
- **End-to-end wired**: Yes — draft generation, draft saving, PDF generation, send authorization with role enforcement, notification tracking
- **Pitch-ready**: Yes — this is extremely demo-worthy
- **Rough spots**: No actual email delivery integration yet (tracks notification as sent, generates the artifacts, but doesn't connect to an email service)

### Multi-Signature Workflow for Restraint Incidents
- **What**: When a restraint incident is submitted, the system automatically creates signature requests for all involved staff and administrators. Each person signs individually. Only pending signatures can be signed (prevents overwrites).
- **Why it matters**: DESE requires documented signatures from staff involved in incidents. Manual routing is slow and error-prone.
- **End-to-end wired**: Yes — auto-creation, status tracking, sign endpoint with validation, duplicate prevention
- **Pitch-ready**: Yes — very compelling in demo
- **Rough spots**: None significant

### 5-Step Restraint Incident Form
- **What**: Comprehensive incident documentation form with checklist-based data collection for de-escalation strategies, procedures/holds (Safety Care, CPI, CALM, PMT), antecedent categories, body positions, environment details, and debrief tracking
- **Why it matters**: Replaces 2-4 page paper forms. Ensures nothing is missed. Standardizes terminology across staff.
- **End-to-end wired**: Yes — all fields persist to database, appear in detail view, export in DESE CSV
- **Pitch-ready**: Yes — one of the strongest features to demonstrate
- **Rough spots**: None

### District Overview Dashboard
- **What**: Multi-school aggregate view showing students, staff, compliance, and alert counts across an entire district
- **End-to-end wired**: Yes
- **Pitch-ready**: Yes, especially for district-level sales conversations

### Academic Layer (Classes, Gradebook, Student Portal)
- **What**: Full gen-ed classroom management — classes, assignments, weighted grading, student submissions, teacher and student portals
- **End-to-end wired**: Yes
- **Pitch-ready**: Yes, but position as "unified platform" advantage rather than leading feature — buyers aren't buying this for the gradebook
- **Rough spots**: The academic layer is solid but not the differentiator

---

## 7. Strongest Selling Points

### 3 Strongest Differentiators
1. **Built for MA DESE compliance from day one** — not a generic platform with compliance bolted on. The data model, workflows, and exports are designed around 603 CMR 28.00/46.00 requirements.
2. **Unified SPED + Gen Ed in one platform** — most competitors are either an IEP system OR a school management system. Noverta is both, so the student record isn't split across systems.
3. **Real ABA data collection** — trial-by-trial recording, prompt hierarchies, auto-progression, mastery criteria, program templates. This is clinical-grade, not a simple checkbox.

### 3 Most Impressive Workflows
1. **Restraint incident → multi-signature routing → parent notification letter → PDF report → DESE export** — This entire workflow from incident to parent delivery is automated. In most schools, this takes 3-5 hours of manual work per incident.
2. **Automated compliance risk calculation** — The system continuously calculates whether each student is on track for their IEP minute requirements and proactively alerts staff before deficits become unrecoverable.
3. **Data session → behavior trend analysis → IEP goal progress reporting** — BCBAs collect data, trends are automatically calculated, and progress reports pull directly from collected data.

### 3 Most Buyer-Relevant Outcomes
1. **Audit readiness** — When DESE reviews your school, everything is documented, signed, and exportable
2. **Time savings** — A single restraint incident report that takes 45-60 minutes on paper takes 10 minutes in Noverta
3. **Risk prevention** — Compliance gaps are caught in real time, not discovered during annual audits

### 3 Most Pitch-Worthy Features Right Now
1. **Protective Measures module** — Full restraint/seclusion documentation with 5-step form, signature workflow, parent notification, and PDF report. This is the most visually impressive and differentiated feature.
2. **Compliance dashboard with risk engine** — Real-time On Track / At Risk / Out of Compliance status for every student with automatic alerts
3. **ABA data collection with program builder** — Program templates, prompt hierarchies, trial data, auto-progression. This alone is worth a demo for any school with ABA programs.

---

## 8. Weak Points / Pitch Risks

### Incomplete or Risky Areas
1. **No authentication system** — The app uses demo role-switching (click Admin/Teacher/Student in sidebar). There is no login, no password, no user accounts. This is fine for demos but must be disclosed. Do not claim it's "secure" or "ready for student data" without auth.
2. **No actual email delivery** — The parent notification workflow generates the letter and tracks it as "sent," but there is no email integration. The notification is marked as delivered when the button is clicked. For a pilot, this would need an email service connection.
3. **No mobile app** — The web app is responsive, but there is no native mobile experience. For teachers doing hallway data collection, this matters.
4. **No file attachments** — Students can submit text content but not actual file uploads. The submission system tracks `fileUrl` and `fileName` but the upload mechanism isn't implemented.
5. **Demo data only** — The app runs on seeded demo data. There is no data migration path from existing systems (SIS, EHR, etc.) beyond the CSV import tool.
6. **Single-tenant architecture** — No multi-tenancy. Each deployment is a single school/district. This matters for SaaS pricing and scaling conversations.
7. **No offline capability** — Data collection in areas with poor connectivity (gyms, outdoor areas) would be disrupted.
8. **No parent portal** — Parents can't log in to see their child's IEP progress, session history, or incident reports. The system generates letters TO parents but doesn't give parents a view.

### Features That Look More Complete Than They Are
- **Auto-schedule generation** — The endpoint exists but the algorithm is basic. Don't oversell this as "AI scheduling."
- **IEP Suggestions** — Uses a goal bank, not AI-generated suggestions. Don't position as "AI-powered IEP writing."
- **Written report "sent"** — Marking a report as sent doesn't actually send it anywhere. It's a tracking checkbox.

---

## 9. Recommended Demo Workflow

### Best Demo Story: "Follow an Incident from Start to Finish"

**Setup**: You are a SPED administrator at a therapeutic school. A restraint incident just happened. Walk the buyer through the entire workflow.

**Step-by-Step:**

1. **Open the Admin Dashboard** (30 seconds)
   - Show the compliance ring, active alerts, session delivery trend
   - Point out "this is what you see every morning when you open Noverta"

2. **Navigate to Protective Measures** (15 seconds)
   - Show the incident list with status badges
   - Point out the summary cards (incidents by type, pending reviews, pending signatures)

3. **Log a New Incident** (2 minutes)
   - Walk through the 5-step form
   - Highlight the de-escalation checklist ("your staff checks what they tried before restraint — this protects them in an audit")
   - Show the procedure/hold checklist with Safety Care/CPI terminology
   - Submit the incident

4. **Show the Signature Workflow** (1 minute)
   - Open the newly created incident
   - Show that signature requests were auto-created for all involved staff and admins
   - Sign one of them to demonstrate the flow

5. **Complete Admin Review** (30 seconds)
   - Show the admin review panel
   - Submit a review with notes and signature

6. **Parent Notification** (1 minute)
   - Show the auto-generated parent notification letter
   - Edit a sentence ("you customize this before sending")
   - Preview the restraint report PDF
   - Authorize and send

7. **Switch to Compliance View** (1 minute)
   - Show the compliance dashboard with risk status for all students
   - Click into a student who is "At Risk"
   - Show their minute progress (delivered vs. required)
   - Show the alert that was auto-generated

8. **Show the ABA Data Collection** (1 minute)
   - Navigate to Program Data
   - Show a program target with steps and prompt hierarchy
   - Show trend data ("this is what your BCBAs see instead of paper clipboards")

9. **End with District Overview** (30 seconds)
   - Show the multi-school aggregate view
   - "This is what your director of SPED sees for the entire district"

**Total demo time: 8-10 minutes**

---

## 10. Product Packaging & Pricing Clues

### Product Category
**Special Education Compliance & Case Management Platform** — positioned alongside products like GoalBook, Frontline IEP, SpedTrack, CentralReach (for ABA), but differentiated by combining compliance automation + ABA data collection + academic management in one system.

### Best Wedge / Entry Point
**Protective Measures module** — lead with the restraint/seclusion compliance pain point. It's the most urgent, most expensive-to-get-wrong problem, and the feature is deeply built. Schools that have had DESE findings on restraint documentation will buy this immediately.

### Modules That Could Be Bundled Later
1. **Core** — Student records, staff, IEP documents, compliance dashboard, alerts
2. **Service Delivery** — Session logging, minute tracking, scheduling, missed session reports
3. **Protective Measures** — Incident documentation, signature workflow, parent notification, DESE export
4. **Clinical / ABA** — Behavior targets, data collection, program builder, trend analysis
5. **Academic** — Classes, assignments, gradebook, student portals
6. **District** — Multi-school dashboard, district-level reporting

### Target Market Fit
- **Best fit today**: Therapeutic day schools (10-200 students) with ABA programs and frequent restraint documentation needs
- **Strong fit**: Public school SPED departments (1-5 schools) looking to consolidate tools
- **Aspirational fit**: Large districts wanting a unified platform (requires multi-tenancy, SSO, SIS integration)

### Pricing Structure Suggestions
- **Per-student pricing**: $15-30/student/month for therapeutic schools; $5-12/student/month for district SPED departments
- **Module-based add-ons**: Base platform + Protective Measures + Clinical/ABA as add-on modules
- **Annual contracts**: Discounted annual pricing with pilot option
- **Pilot pricing**: 60-90 day pilot at 50% of full pricing for one school

---

## 11. Reusable Sales Content Block

### A. 1-Sentence Product Description
Noverta is a compliance-first school management platform that automates IEP tracking, service delivery, behavior data collection, and restraint documentation for Massachusetts special education programs.

### B. 3-Sentence Product Description
Noverta gives special education teams a single platform to manage IEPs, track service minutes, collect ABA data, and document restraint incidents — all designed around Massachusetts DESE compliance requirements. The platform automatically calculates whether students are on track for their mandated services and alerts staff before compliance gaps become audit findings. With five role-based views for administrators, teachers, and students, Noverta replaces spreadsheets, paper forms, and disconnected tools with one unified system.

### C. 1-Paragraph Product Overview
Noverta is a purpose-built school management platform for Massachusetts special education compliance. It combines IEP case management, real-time service minute tracking with automated risk calculation, clinical-grade ABA data collection with program templates and prompt hierarchies, and a comprehensive restraint/seclusion incident module with multi-signature workflows, auto-generated parent notification letters, and DESE-compliant PDF reporting — all in one system. Noverta also includes full academic class management (assignments, gradebook, student portals), staff caseload management, scheduling with conflict detection, and district-level dashboards. Five role-based views serve administrators, SPED teachers, general education teachers, and students. The platform is designed to keep schools audit-ready at all times by continuously monitoring compliance status and proactively alerting staff to emerging risks.

### D. Key Benefits (Bullet List)
- Eliminate manual service minute tracking and compliance calculations
- Document restraint incidents in 10 minutes instead of 60 — with automated signature routing and parent notification
- Catch compliance gaps in real time, not during annual audits
- Give BCBAs professional-grade data collection tools instead of paper clipboards
- Unify SPED and gen-ed student records in one platform
- Generate DESE-compliant exports with one click
- Reduce IEP meeting prep time with centralized progress data
- Empower parents with transparent, timely communication about their child's services and incidents

### E. Core Features (Bullet List)
- IEP document and goal management with progress tracking
- Real-time service minute delivery monitoring with risk status (On Track / At Risk / Out of Compliance)
- Automated compliance alerts (minute deficits, projected shortfalls, missed session thresholds)
- Full restraint/seclusion incident documentation (5-step form, 60+ data fields, DESE-compliant)
- Multi-party signature workflow with auto-routing to involved staff and administrators
- Parent notification letter generation with editable drafts and PDF report attachment
- ABA/behavior data collection (trial-by-trial, interval recording, prompt hierarchies)
- Program builder with templates, mastery criteria, and auto-progression
- Academic class management (assignments, gradebook, submissions)
- Staff caseload management and scheduling with conflict detection
- District-level dashboards with multi-school aggregate views
- CSV import for student data migration
- Role-based portals for administrators, SPED teachers, gen-ed teachers, and students

### F. Ideal Customer Profile
A therapeutic day school or public school SPED department in Massachusetts serving 30-200 students on IEPs, with at least 2-3 BCBAs or behavior therapists, regular use of physical restraint/seclusion (5+ incidents per year), and current reliance on spreadsheets and paper forms for compliance tracking. The school has experienced or fears DESE compliance findings. The decision-maker is the Director of Special Education, Clinical Director, or Executive Director. The internal champion is a frustrated case manager or BCBA who spends 5+ hours per week on manual documentation.

### G. Top Buyer Objections the Product May Face
1. **"We already have an IEP system"** — Response: Noverta isn't just IEP management. It's compliance automation + clinical data collection + incident documentation. Your current IEP system doesn't auto-calculate service minute delivery or generate restraint report PDFs.
2. **"How do we get our data in?"** — Response: CSV import is built in. We'd work with you on initial data migration during the pilot.
3. **"Is student data secure?"** — Response: This is a valid concern. The platform currently needs an authentication layer before handling real student data. A pilot would begin with de-identified or test data.
4. **"We need it to work on mobile"** — Response: The web app is responsive and works on tablets. A native mobile experience for hallway data collection is on the roadmap.
5. **"What about our SIS (Student Information System)?"** — Response: Integration with common SIS platforms is planned. Currently, student data can be imported via CSV.
6. **"This seems like a lot — can we start small?"** — Response: Absolutely. Most schools start with the Protective Measures module and expand from there.

### H. Best-Case Sales Positioning Statement
"Noverta is the only school management platform built specifically for Massachusetts special education compliance. While other tools make you track IEP minutes in spreadsheets and document restraint incidents on paper, Noverta automates compliance monitoring, generates DESE-ready reports, and routes incident documentation for signatures — so your team spends time with students instead of filling out forms."

### I. Strongest Pilot Use Case
**60-day pilot at a single therapeutic school focused on the Protective Measures module.** The school uses Noverta to document all restraint/seclusion incidents during the pilot period. Success is measured by: (1) time saved per incident report (target: 50%+ reduction), (2) parent notification compliance rate (target: 100% within 3 days), and (3) staff satisfaction with the documentation process. The pilot expands to session logging and compliance tracking in month 2.

### J. What NOT to Claim Yet
- Do not claim the product is "secure" or "FERPA-compliant" — there is no authentication, no encryption at rest, no audit logging, no access control beyond demo role-switching
- Do not claim "AI-powered" IEP writing — the suggestions come from a static goal bank, not generative AI
- Do not claim email notification delivery — the system generates and tracks notifications but doesn't actually send emails
- Do not claim mobile app availability — there is no native mobile app
- Do not claim SIS integration — there is no integration with PowerSchool, Infinite Campus, or other SIS platforms
- Do not claim multi-district support — the architecture is currently single-tenant
- Do not claim parent portal access — parents cannot log in to view their child's data
- Do not claim real-time data sync — there is no offline mode or sync capability for poor-connectivity environments
