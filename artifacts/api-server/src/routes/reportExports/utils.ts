import { type Request } from "express";
import PDFDocument from "pdfkit";
import { db } from "@workspace/db";
import { studentsTable, exportHistoryTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getPublicMeta } from "../../lib/clerkClaims";
import { getEnforcedDistrictId } from "../../middlewares/auth";
import type { AuthedRequest } from "../../middlewares/auth";

export interface ExportScope {
  enforcedDistrictId: number | null;
  enforcedSchoolId: number | null;
  isPlatformAdmin: boolean;
}

export interface BufferedPDFDoc {
  bufferedPageRange(): { start: number; count: number };
}

export interface ReportFilters {
  startDate?: string;
  endDate?: string;
  schoolId?: number;
  providerId?: number;
  serviceTypeId?: number;
  complianceStatus?: string;
}

export function escapeCSV(val: unknown): string {
  const str = String(val ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCSV(headers: string[], rows: unknown[][]): string {
  return [
    headers.map(escapeCSV).join(","),
    ...rows.map(r => r.map(escapeCSV).join(",")),
  ].join("\n");
}

export function resolveExportScope(req: Request): ExportScope | { error: string; status: number } {
  const { platformAdmin } = getPublicMeta(req);
  if (platformAdmin) {
    return { enforcedDistrictId: null, enforcedSchoolId: null, isPlatformAdmin: true };
  }
  const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (districtId == null) {
    return { error: "Access denied: your account is not assigned to a district", status: 403 };
  }
  return { enforcedDistrictId: districtId, enforcedSchoolId: null, isPlatformAdmin: false };
}

export function assertCSVHeaders(actual: readonly string[], canonical: readonly string[]): void {
  if (actual.length !== canonical.length) {
    throw new Error(`CSV header count mismatch: expected ${canonical.length}, got ${actual.length}`);
  }
  for (let i = 0; i < canonical.length; i++) {
    if (actual[i] !== canonical[i]) {
      throw new Error(`CSV header mismatch at position ${i}: expected "${canonical[i]}", got "${actual[i]}"`);
    }
  }
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return String(d);
  }
}

export function daysUntil(dateStr: string | null | undefined): number | "" {
  if (!dateStr) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export const PDF_COLORS = { EMERALD: "#059669", GRAY_DARK: "#111827", GRAY_MID: "#6b7280", GRAY_LIGHT: "#e5e7eb" };

export function initPdfDoc(): InstanceType<typeof PDFDocument> {
  return new PDFDocument({ size: "LETTER", margins: { top: 50, bottom: 60, left: 60, right: 60 }, bufferPages: true });
}

export function pdfHeader(doc: InstanceType<typeof PDFDocument>, title: string, subtitle: string) {
  doc.fontSize(18).font("Helvetica-Bold").fillColor(PDF_COLORS.GRAY_DARK).text(title, { align: "center" });
  doc.moveDown(0.2);
  doc.fontSize(9).font("Helvetica").fillColor(PDF_COLORS.GRAY_MID).text(subtitle, { align: "center" });
  doc.moveDown(0.2);
  doc.fontSize(8).fillColor(PDF_COLORS.GRAY_MID).text(`Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, { align: "center" });
  doc.moveDown(0.5);
  doc.moveTo(60, doc.y).lineTo(552, doc.y).strokeColor(PDF_COLORS.GRAY_LIGHT).lineWidth(1).stroke();
  doc.moveDown(0.4);
}

export function pdfSectionTitle(doc: InstanceType<typeof PDFDocument>, title: string) {
  doc.moveDown(0.4);
  doc.fontSize(12).font("Helvetica-Bold").fillColor(PDF_COLORS.EMERALD).text(title);
  doc.moveTo(60, doc.y + 2).lineTo(552, doc.y + 2).strokeColor("#d1fae5").lineWidth(1).stroke();
  doc.moveDown(0.3);
  doc.fontSize(9).font("Helvetica").fillColor(PDF_COLORS.GRAY_DARK);
}

export function pdfTableRow(doc: InstanceType<typeof PDFDocument>, cols: { text: string; width: number; bold?: boolean; align?: "left" | "right" | "center" }[], y: number) {
  let x = 60;
  for (const col of cols) {
    doc.font(col.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(8.5)
      .fillColor(PDF_COLORS.GRAY_DARK)
      .text(col.text, x, y, { width: col.width, align: col.align ?? "left" });
    x += col.width;
  }
}

export function pdfTableHeader(doc: InstanceType<typeof PDFDocument>, cols: { text: string; width: number }[]) {
  const y = doc.y;
  let x = 60;
  doc.rect(60, y - 2, 492, 14).fill("#f3f4f6");
  for (const col of cols) {
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(PDF_COLORS.GRAY_MID)
      .text(col.text.toUpperCase(), x, y, { width: col.width });
    x += col.width;
  }
  doc.y = y + 16;
}

export function pdfFooters(doc: InstanceType<typeof PDFDocument>, reportName: string) {
  const pageCount = (doc as unknown as BufferedPDFDoc).bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fontSize(7).fillColor(PDF_COLORS.GRAY_MID)
      .text(`Trellis — ${reportName} | Page ${i + 1} of ${pageCount} | Confidential`, 60, 762, { align: "center", width: 492 });
  }
}

export function districtCondition(enforcedDistrictId: number | null) {
  if (enforcedDistrictId === null) return undefined;
  return sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${enforcedDistrictId})`;
}

export function recordExport(req: Request, opts: { reportType: string; reportLabel: string; format: string; fileName: string; recordCount: number; parameters?: Record<string, unknown> }) {
  const { platformAdmin } = getPublicMeta(req);
  const districtId = platformAdmin ? null : getEnforcedDistrictId(req as unknown as AuthedRequest);
  const exportedBy = (req as unknown as AuthedRequest).userId ?? "system";
  db.insert(exportHistoryTable).values({
    reportType: opts.reportType,
    reportLabel: opts.reportLabel,
    exportedBy,
    districtId,
    format: opts.format,
    fileName: opts.fileName,
    recordCount: opts.recordCount,
    parameters: opts.parameters ?? null,
  }).catch(e => console.error("Failed to record export history:", e));
}

export const ROLE_LABELS: Record<string, string> = { bcba: "BCBA", provider: "Provider", para: "Paraprofessional", sped_teacher: "SPED Teacher", case_manager: "Case Manager", coordinator: "Coordinator", admin: "Admin" };
