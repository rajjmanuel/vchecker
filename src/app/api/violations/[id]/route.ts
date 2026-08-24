import { deleteViolation, getViolationById, listViolations, upsertViolation } from "@/lib/data";
import { fail, handleRoute, ok, readBody, requirePermission } from "@/lib/api";
import { writeLog } from "@/lib/audit";
import type { NewViolation } from "@/db/schema";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

type ViolationBody = {
  studentId?: number | string;
  category?: "Major" | "Minor";
  violationType?: string;
  incidentDate?: string;
  description?: string | null;
  actionTaken?: string | null;
  remarks?: string | null;
  status?: "Pending" | "Resolved" | "Escalated";
};

function cleanViolation(body: ViolationBody, reportedBy?: number): NewViolation {
  const studentId = Number(body.studentId);
  const category = body.category;
  const violationType = body.violationType?.trim();
  const incidentDate = body.incidentDate;
  if (!studentId || !category || !violationType || !incidentDate) {
    throw new Error("Student, category, violation type, and date of incident are required.");
  }
  return {
    studentId,
    category,
    violationType,
    incidentDate,
    description: body.description?.trim() || null,
    actionTaken: body.actionTaken?.trim() || null,
    remarks: body.remarks?.trim() || null,
    status: body.status ?? "Pending",
    reportedBy,
  };
}

export async function GET(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    await requirePermission("violations", "view");
    const id = Number((await params).id);
    const violation = await getViolationById(id);
    if (!violation) return fail("Violation record not found.", 404);
    return ok(violation);
  });
}

export async function PUT(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requirePermission("violations", "edit");
    const id = Number((await params).id);
    const body = await readBody<ViolationBody>(request);
    const updated = await upsertViolation(cleanViolation(body, user.id), id);
    await writeLog({ user, module: "Violations", action: "VIOLATION_UPDATED", description: `Updated violation record #${updated.id} (${updated.violationType}).` });
    return ok(updated);
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requirePermission("violations", "delete");
    const id = Number((await params).id);
    const existing = await getViolationById(id);
    if (!existing) return fail("Violation record not found.", 404);
    await deleteViolation(id);
    await writeLog({ user, module: "Violations", action: "VIOLATION_DELETED", description: `Deleted violation record #${id} (${existing.violationType}).` });
    return ok({ deleted: true });
  });
}
