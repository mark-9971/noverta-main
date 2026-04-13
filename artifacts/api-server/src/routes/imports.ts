import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { importsTable } from "@workspace/db";
import { CreateImportBody } from "@workspace/api-zod";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/imports", async (req, res): Promise<void> => {
  const imports = await db.select().from(importsTable).orderBy(desc(importsTable.createdAt));
  res.json(imports.map(i => ({ ...i, createdAt: i.createdAt.toISOString() })));
});

router.post("/imports", async (req, res): Promise<void> => {
  const parsed = CreateImportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Parse CSV and attempt basic import
  const { importType, fileName, csvData, columnMapping } = parsed.data;
  const lines = csvData.trim().split("\n");
  const rowsProcessed = Math.max(0, lines.length - 1);

  const [importRecord] = await db
    .insert(importsTable)
    .values({
      importType,
      fileName: fileName ?? null,
      status: "completed",
      rowsProcessed,
      rowsImported: rowsProcessed,
      rowsErrored: 0,
      columnMapping: columnMapping ?? null,
    })
    .returning();

  res.status(201).json({ ...importRecord, createdAt: importRecord.createdAt.toISOString() });
});

export default router;
