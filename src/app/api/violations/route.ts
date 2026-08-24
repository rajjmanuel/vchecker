import { getSearchParams, handleRoute, ok, readBody, requirePermission } from "@/lib/api";
import { getStudentById, listViolations, upsertViolation } from "@/lib/data";
import { writeLog } from "@/lib/audit";
import type { NewViolation } from "@/db/schema";

export const dynamic = "force-dynamic";

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

export async function GET(request: Request) {
  return handleRoute(async () => {
    await requirePermission("violations", "view");
    return ok(await listViolations(getSearchParams(request)));
  });
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await requirePermission("violations", "add");
    const body = await readBody<ViolationBody>(request);
    const created = await upsertViolation(cleanViolation(body, user.id));
    const student = await getStudentById(created.studentId);
    await writeLog({
      user,
      module: "Violations",
      action: "VIOLATION_ADDED",
      description: student
        ? `Recorded a ${created.category.toLowerCase()} violation (${created.violationType}) for ${student.firstName} ${student.lastName} (${student.studentNumber}).`
        : `Recorded a ${created.category.toLowerCase()} violation (${created.violationType}).`,
    });
    return ok(created, { status: 201 });
  });
}
