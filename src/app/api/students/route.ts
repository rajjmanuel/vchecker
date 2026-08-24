import { bulkCreateStudents, listStudents, studentNumberExists, upsertStudent } from "@/lib/data";
import { handleRoute, ok, readBody, getSearchParams, fail, requirePermission } from "@/lib/api";
import { writeLog } from "@/lib/audit";
import { GRADE_LEVELS } from "@/lib/constants";
import type { NewStudent } from "@/db/schema";

export const dynamic = "force-dynamic";

type StudentBody = {
  studentNumber?: string;
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  gradeLevel?: string;
  section?: string;
  status?: "Active" | "Inactive" | "Archived";
  notes?: string | null;
  students?: StudentBody[];
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

export async function GET(request: Request) {
  return handleRoute(async () => {
    await requirePermission("students", "view");
    const filters = getSearchParams(request);
    return ok(await listStudents(filters));
  });
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = await readBody<StudentBody>(request);
    if (Array.isArray(body.students)) {
      const user = await requirePermission("students", "import");
      const items = body.students.map((student) => cleanStudent(student));
      if (!items.length) return fail("No valid student rows found.");
      for (const item of items) {
        if (item.studentNumber && await studentNumberExists(item.studentNumber)) {
          throw new Error(`Import failed: student number ${item.studentNumber} already exists.`);
        }
      }
      const created = await bulkCreateStudents(items);
      await writeLog({ user, module: "Students", action: "STUDENTS_IMPORTED", description: `Imported ${created.length} student record(s).` });
      return ok(created, { status: 201 });
    }
    const user = await requirePermission("students", "add");
    const created = await upsertStudent(cleanStudent(body));
    await writeLog({ user, module: "Students", action: "STUDENT_CREATED", description: `Added student ${created.firstName} ${created.lastName} (${created.studentNumber}).` });
    return ok(created, { status: 201 });
  });
}
