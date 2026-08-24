import { deleteStudent, deleteStudentViolations, getStudentById, upsertStudent } from "@/lib/data";
import { fail, handleRoute, ok, readBody, requirePermission } from "@/lib/api";
import { writeLog } from "@/lib/audit";
import { GRADE_LEVELS } from "@/lib/constants";
import type { NewStudent } from "@/db/schema";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

type StudentBody = {
  studentNumber?: string;
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  gradeLevel?: string;
  section?: string;
  status?: "Active" | "Inactive" | "Archived";
  notes?: string | null;
};

function cleanStudent(body: StudentBody): NewStudent {
  const studentNumber = body.studentNumber?.trim();
  const firstName = body.firstName?.trim();
  const lastName = body.lastName?.trim();
  const gradeLevel = body.gradeLevel?.trim();
  const section = body.section?.trim();
  if (!firstName || !lastName || !gradeLevel || !section) {
    throw new Error("First name, last name, grade/year level, and section are required.");
  }
  if (studentNumber && !/^\d+(-\d+)*$/.test(studentNumber)) {
    throw new Error("Student number can only contain numbers, with optional dashes (e.g. 202600001 or 2026-00001).");
  }
  if (!GRADE_LEVELS.includes(gradeLevel)) {
    throw new Error("Only Grade 11 and Grade 12 students are supported by this system.");
  }
  return {
    studentNumber: studentNumber || null,
    firstName,
    middleName: body.middleName?.trim() || null,
    lastName,
    gradeLevel,
    section,
    status: body.status ?? "Active",
    notes: body.notes?.trim() || null,
  };
}

export async function GET(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requirePermission("students", "view");
    const id = Number((await params).id);
    const student = await getStudentById(id);
    if (!student) return fail("Student record not found.", 404);
    await writeLog({ user, module: "Students", action: "STUDENT_VIEWED", description: `Viewed the record of ${student.firstName} ${student.lastName} (${student.studentNumber}).` });
    return ok(student);
  });
}

export async function PUT(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requirePermission("students", "edit");
    const id = Number((await params).id);
    const body = await readBody<StudentBody>(request);
    const updated = await upsertStudent(cleanStudent(body), id);
    await writeLog({ user, module: "Students", action: "STUDENT_UPDATED", description: `Updated student ${updated.firstName} ${updated.lastName} (${updated.studentNumber}).` });
    return ok(updated);
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requirePermission("students", "delete");
    const id = Number((await params).id);
    const existing = await getStudentById(id);
    if (!existing) return fail("Student record not found.", 404);
    await deleteStudent(id);
    await writeLog({ user, module: "Students", action: "STUDENT_DELETED", description: `Deleted student ${existing.firstName} ${existing.lastName} (${existing.studentNumber}).` });
    return ok({ deleted: true });
  });
}

export async function POST(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requirePermission("students", "delete");
    if (user.role !== "super_admin") throw new Response("Forbidden", { status: 403 });
    const id = Number((await params).id);
    const existing = await getStudentById(id);
    if (!existing) return fail("Student record not found.", 404);
    const deletedCount = await deleteStudentViolations(id);
    await writeLog({ user, module: "Students", action: "STUDENT_VIOLATIONS_RESET", description: `Reset ${deletedCount} violation record(s) for ${existing.firstName} ${existing.lastName} (${existing.studentNumber}).` });
    return ok({ deletedCount });
  });
}
