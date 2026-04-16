import { Router, type IRouter } from "express";
import { db, importsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/imports", async (req, res): Promise<void> => {
  try {
    const imports = await db.select().from(importsTable).orderBy(desc(importsTable.createdAt));
    res.json(imports.map(i => ({ ...i, createdAt: i.createdAt.toISOString(), updatedAt: i.updatedAt.toISOString() })));
  } catch (e: any) {
    console.error("GET /imports error:", e);
    res.status(500).json({ error: "Failed to fetch import history" });
  }
});

router.get("/imports/templates/:type", async (req, res): Promise<void> => {
  const { type } = req.params;
  const templates: Record<string, { headers: string[]; sampleRow: string[] }> = {
    students: {
      headers: ["first_name", "last_name", "external_id", "grade", "placement_type", "notes"],
      sampleRow: ["Jane", "Doe", "STU-2025-001", "3", "gen_ed", "Transfer from Lincoln ES"],
    },
    service_requirements: {
      headers: ["student_external_id", "student_first_name", "student_last_name", "service_type", "required_minutes", "interval_type", "delivery_type", "start_date", "end_date", "notes"],
      sampleRow: ["STU-2025-001", "Jane", "Doe", "Speech-Language Therapy", "60", "monthly", "direct", "2025-09-01", "2026-06-15", "Per IEP amendment 2/2025"],
    },
    sessions: {
      headers: ["student_external_id", "student_first_name", "student_last_name", "service_type", "session_date", "duration_minutes", "status", "is_makeup", "start_time", "end_time", "notes"],
      sampleRow: ["STU-2025-001", "Jane", "Doe", "Speech-Language Therapy", "2025-10-15", "30", "completed", "false", "09:00", "09:30", "Articulation drill"],
    },
    aspen_students: {
      headers: ["Student ID", "First Name", "Last Name", "Grade Level", "Disability", "Case Manager", "School", "IEP Start Date", "IEP End Date"],
      sampleRow: ["12345", "Jane", "Doe", "03", "SLD", "Smith, John", "Lincoln ES", "09/01/2025", "06/15/2026"],
    },
    esped_services: {
      headers: ["Student ID", "Student Name", "Service Area", "Service Type", "Frequency", "Duration (min)", "Start Date", "End Date", "Provider"],
      sampleRow: ["12345", "Doe, Jane", "Speech", "Direct", "2x weekly", "30", "09/01/2025", "06/15/2026", "Wilson, Sarah"],
    },
    goals_data_tall: {
      headers: ["student_id", "student_first_name", "student_last_name", "goal_name", "goal_type", "measurement_type", "target_direction", "baseline", "date", "value", "notes"],
      sampleRow: ["STU-001", "Jane", "Doe", "Hitting - Physical Aggression", "behavior", "frequency", "decrease", "8", "2024-09-06", "6", "Morning session"],
    },
    goals_data_wide: {
      headers: ["student_id", "student_first_name", "student_last_name", "goal_name", "goal_type", "measurement_type", "target_direction", "baseline", "2024-09-06", "2024-09-13", "2024-09-20", "2024-09-27"],
      sampleRow: ["STU-001", "Jane", "Doe", "Identifying Colors", "skill", "percent", "increase", "20", "40", "55", "70", "80"],
    },
  };

  const tmpl = templates[type];
  if (!tmpl) {
    res.status(404).json({ error: `Unknown template type: ${type}` });
    return;
  }

  const csv = [tmpl.headers.join(","), tmpl.sampleRow.join(",")].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=trellis_${type}_template.csv`);
  res.send(csv);
});

export default router;
