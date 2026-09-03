import "server-only";

import { and, asc, count, desc, eq, gte, inArray, like, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activityLogs,
  students,
  systemSettings,
  users,
  violations,
  type NewStudent,
  type NewViolation,
  type PermissionMap,
  type Student,
  type SystemSettings,
  type User,
  type Violation,
} from "@/db/schema";
import { DEFAULT_SETTINGS } from "@/lib/constants";

export type StudentWithCounts = Student & {
  majorCount: number;
  minorCount: number;
  totalViolations: number;
};

export type ViolationWithStudent = Violation & {
  student: Student;
  reporter?: Pick<User, "id" | "fullName" | "username"> | null;
};

export type AppBootstrap = {
  needsSetup: boolean;
  currentUser: null | {
    id: number;
    fullName: string;
    username: string;
    email: string;
    role: User["role"];
    permissions: PermissionMap;
  };
  settings: SystemSettings;
};

export async function ensureSettings() {
  const [existing] = await db.select().from(systemSettings).orderBy(asc(systemSettings.id)).limit(1);
  if (existing) return existing;
  const [{ id: createdId }] = await db
    .insert(systemSettings)
    .values({
      schoolName: DEFAULT_SETTINGS.schoolName,
      appSubtitle: DEFAULT_SETTINGS.appSubtitle,
      loginTitle: DEFAULT_SETTINGS.loginTitle,
      footerNotice: DEFAULT_SETTINGS.footerNotice,
      primaryColor: DEFAULT_SETTINGS.primaryColor,
      accentColor: DEFAULT_SETTINGS.accentColor,
      sidebarColor: DEFAULT_SETTINGS.sidebarColor,
      fontFamily: DEFAULT_SETTINGS.fontFamily,
      sessionHours: DEFAULT_SETTINGS.sessionHours,
    })
    .$returningId();
  const [created] = await db.select().from(systemSettings).where(eq(systemSettings.id, createdId)).limit(1);
  return created;
}

export async function getDashboardData() {
  const allStudents = await db.select().from(students);
  const allViolations = await db.select().from(violations);
  const totalStudents = allStudents.length;
  const majorViolations = allViolations.filter((v) => v.category === "Major").length;
  const minorViolations = allViolations.filter((v) => v.category === "Minor").length;
  const studentIdsWithViolations = new Set(allViolations.map((v) => v.studentId));
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const violationsThisMonth = allViolations.filter((v) => v.incidentDate.startsWith(monthKey)).length;

  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return {
      key,
      label: date.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      Major: 0,
      Minor: 0,
    };
  });
  for (const violation of allViolations) {
    const key = violation.incidentDate.slice(0, 7);
    const bucket = months.find((m) => m.key === key);
    if (bucket) bucket[violation.category as "Major" | "Minor"] += 1;
  }

  const byType = Object.entries(
    allViolations.reduce<Record<string, number>>((acc, violation) => {
      acc[violation.violationType] = (acc[violation.violationType] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const byGrade = Object.entries(
    allViolations.reduce<Record<string, number>>((acc, violation) => {
      const student = allStudents.find((s) => s.id === violation.studentId);
      if (!student) return acc;
      acc[student.gradeLevel] = (acc[student.gradeLevel] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name, value }));

  const recent = allViolations
    .slice()
    .sort((a, b) => `${b.incidentDate}${b.id}`.localeCompare(`${a.incidentDate}${a.id}`))
    .slice(0, 5)
    .map((violation) => ({
      ...violation,
      student: allStudents.find((student) => student.id === violation.studentId) ?? null,
    }))
    .filter((item) => item.student !== null);

  const common = byType.slice(0, 5);

  return {
    stats: {
      totalStudents,
      studentsWithViolations: studentIdsWithViolations.size,
      totalViolations: allViolations.length,
      majorViolations,
      minorViolations,
      violationsThisMonth,
      percentageWithViolations: totalStudents ? Math.round((studentIdsWithViolations.size / totalStudents) * 100) : 0,
    },
    majorMinor: [
      { name: "Major", value: majorViolations },
      { name: "Minor", value: minorViolations },
    ],
    monthly: months,
    byType,
    byGrade,
    recent,
    common,
  };
}

export type StudentFilters = {
  search?: string;
  gradeLevel?: string;
  section?: string;
  status?: string;
};

export async function listStudents(filters: StudentFilters = {}) {
  const conditions = [];
  if (filters.search) {
    const q = `%${filters.search}%`;
    conditions.push(
      or(like(students.studentNumber, q), like(students.firstName, q), like(students.lastName, q)),
    );
  }
  if (filters.gradeLevel && filters.gradeLevel !== "All") conditions.push(eq(students.gradeLevel, filters.gradeLevel));
  if (filters.section && filters.section !== "All") conditions.push(eq(students.section, filters.section));
  if (filters.status && filters.status !== "All") conditions.push(eq(students.status, filters.status as "Active" | "Inactive" | "Archived"));

  const rows = await db
    .select({
      id: students.id,
      studentNumber: students.studentNumber,
      firstName: students.firstName,
      middleName: students.middleName,
      lastName: students.lastName,
      gradeLevel: students.gradeLevel,
      section: students.section,
      status: students.status,
      notes: students.notes,
      createdAt: students.createdAt,
      updatedAt: students.updatedAt,
      totalViolations: count(violations.id),
      majorCount: sql<number>`sum(case when ${violations.category} = 'Major' then 1 else 0 end)`,
      minorCount: sql<number>`sum(case when ${violations.category} = 'Minor' then 1 else 0 end)`,
    })
    .from(students)
    .leftJoin(violations, eq(students.id, violations.studentId))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(students.id)
    .orderBy(asc(students.lastName), asc(students.firstName));

  return rows.map((row) => ({
    ...row,
    totalViolations: Number(row.totalViolations),
    majorCount: Number(row.majorCount),
    minorCount: Number(row.minorCount),
  })) as StudentWithCounts[];
}

export async function getStudentById(id: number) {
  const [student] = await db.select().from(students).where(eq(students.id, id)).limit(1);
  if (!student) return null;
  const studentViolations = await db
    .select()
    .from(violations)
    .where(eq(violations.studentId, id))
    .orderBy(desc(violations.incidentDate), desc(violations.id));
  return {
    ...student,
    violations: studentViolations,
    majorCount: studentViolations.filter((v) => v.category === "Major").length,
    minorCount: studentViolations.filter((v) => v.category === "Minor").length,
  };
}

export async function studentNumberExists(studentNumber: string, excludeId?: number) {
  const [row] = await db.select({ id: students.id }).from(students).where(eq(students.studentNumber, studentNumber)).limit(1);
  return Boolean(row && row.id !== excludeId);
}

export async function upsertStudent(input: NewStudent, id?: number) {
  if (input.studentNumber && await studentNumberExists(input.studentNumber, id)) {
    throw new Error(`Student number ${input.studentNumber} is already in use by another student record.`);
  }
  if (id) {
    await db
      .update(students)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(students.id, id))
    const [updated] = await db.select().from(students).where(eq(students.id, id)).limit(1);
    return updated;
  }
  const [{ id: createdId }] = await db.insert(students).values(input).$returningId();
  const [created] = await db.select().from(students).where(eq(students.id, createdId)).limit(1);
  return created;
}

export async function deleteStudent(id: number) {
  await db.delete(students).where(eq(students.id, id));
}

export type ViolationFilters = {
  search?: string;
  category?: string;
  violationType?: string;
  from?: string;
  to?: string;
  gradeLevel?: string;
  section?: string;
  status?: string;
};

export async function listViolations(filters: ViolationFilters = {}) {
  const conditions = [];
  if (filters.search) {
    const q = `%${filters.search}%`;
    conditions.push(
      or(
        like(students.studentNumber, q),
        like(students.firstName, q),
        like(students.lastName, q),
        like(violations.violationType, q),
      ),
    );
  }
  if (filters.category && filters.category !== "All") conditions.push(eq(violations.category, filters.category as "Major" | "Minor"));
  if (filters.violationType && filters.violationType !== "All" && filters.violationType !== "All types") conditions.push(eq(violations.violationType, filters.violationType));
  if (filters.from) conditions.push(gte(violations.incidentDate, filters.from));
  if (filters.to) conditions.push(lte(violations.incidentDate, filters.to));
  if (filters.gradeLevel && filters.gradeLevel !== "All") conditions.push(eq(students.gradeLevel, filters.gradeLevel));
  if (filters.section && filters.section !== "All") conditions.push(eq(students.section, filters.section));
  if (filters.status && filters.status !== "All") conditions.push(eq(violations.status, filters.status as "Pending" | "Resolved" | "Escalated"));

  const rows = await db
    .select({ violation: violations, student: students, reporter: users })
    .from(violations)
    .innerJoin(students, eq(violations.studentId, students.id))
    .leftJoin(users, eq(violations.reportedBy, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(violations.incidentDate), desc(violations.id));

  return rows.map((row) => ({ ...row.violation, student: row.student, reporter: row.reporter })) as ViolationWithStudent[];
}

export async function getViolationById(id: number) {
  const rows = await listViolations({});
  return rows.find((row) => row.id === id) ?? null;
}

export async function upsertViolation(input: NewViolation, id?: number) {
  if (id) {
    await db
      .update(violations)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(violations.id, id))
    const [updated] = await db.select().from(violations).where(eq(violations.id, id)).limit(1);
    return updated;
  }
  const [{ id: createdId }] = await db.insert(violations).values(input).$returningId();
  const [created] = await db.select().from(violations).where(eq(violations.id, createdId)).limit(1);
  return created;
}

export async function deleteViolation(id: number) {
  await db.delete(violations).where(eq(violations.id, id));
}

export async function deleteStudentViolations(studentId: number) {
  const existing = await db.select({ id: violations.id }).from(violations).where(eq(violations.studentId, studentId));
  if (existing.length) await db.delete(violations).where(eq(violations.studentId, studentId));
  return existing.length;
}

export async function deleteAllViolations() {
  const existing = await db.select({ id: violations.id }).from(violations);
  if (existing.length) await db.delete(violations);
  return existing.length;
}

export async function searchStudents(q: string) {
  if (!q.trim()) return [];
  const searchPattern = `%${q.trim()}%`;
  return db
    .select()
    .from(students)
    .where(or(like(students.studentNumber, searchPattern), like(students.firstName, searchPattern), like(students.lastName, searchPattern)))
    .orderBy(asc(students.lastName), asc(students.firstName))
    .limit(10);
}

export type LogFilters = {
  search?: string;
  module?: string;
  from?: string;
  to?: string;
};

function communityServiceRecommendation(minor: number, major: number) {
  const minorHours = minor * 2;
  const majorHours = major === 1 ? 6 : major === 2 ? 10 : major >= 3 ? null : 0;
  const minorLabel = minorHours ? `${minor}× Minor Violation${minor === 1 ? "" : "s"} — ${minorHours} hours Community Service` : "None";
  const majorLabel = majorHours === null
    ? "3× or More Major Violations — 15+ hours Community Service (Case-Based)"
    : majorHours
      ? `${major === 1 ? "1× Major Violation" : "2× Major Violations"} — ${majorHours} hours Community Service`
      : "None";
  const minimumTotal = majorHours === null ? `${15 + minorHours}+ hours (Case-Based)` : `${minorHours + majorHours} hours`;
  return { minorLabel, majorLabel, minimumTotal };
}

export async function listLogs(filters: LogFilters = {}) {
  const conditions = [];
  if (filters.search) {
    const q = `%${filters.search}%`;
    conditions.push(or(like(activityLogs.username, q), like(activityLogs.description, q), like(activityLogs.action, q)));
  }
  if (filters.module && filters.module !== "All modules") conditions.push(eq(activityLogs.module, filters.module));
  if (filters.from) conditions.push(gte(activityLogs.createdAt, new Date(`${filters.from}T00:00:00+08:00`)));
  if (filters.to) conditions.push(lte(activityLogs.createdAt, new Date(`${filters.to}T23:59:59+08:00`)));

  return db
    .select()
    .from(activityLogs)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(activityLogs.createdAt), desc(activityLogs.id))
    .limit(200);
}

export async function listUsers() {
  return db.select().from(users).orderBy(desc(users.role), asc(users.fullName));
}

export async function updateSettings(input: Partial<SystemSettings>) {
  const settings = await ensureSettings();
  await db
    .update(systemSettings)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(systemSettings.id, settings.id))
  const [updated] = await db.select().from(systemSettings).where(eq(systemSettings.id, settings.id)).limit(1);
  return updated;
}

export async function getReportData(type: string, filters: ViolationFilters & { studentId?: string }) {
  let rows = await listViolations(filters);
  if (type === "major") rows = rows.filter((row) => row.category === "Major");
  if (type === "minor") rows = rows.filter((row) => row.category === "Minor");
  if (filters.studentId) rows = rows.filter((row) => row.studentId === Number(filters.studentId));

  if (type === "history" && !filters.studentId) {
    return { rows: [], summary: [], total: 0, major: 0, minor: 0, communityService: communityServiceRecommendation(0, 0) };
  }

  const summaryKey =
    type === "grade"
      ? (row: ViolationWithStudent) => row.student.gradeLevel
      : type === "section"
        ? (row: ViolationWithStudent) => row.student.section
        : type === "date"
          ? (row: ViolationWithStudent) => row.incidentDate.slice(0, 7)
          : type === "staff"
            ? (row: ViolationWithStudent) => row.reporter?.fullName || "Unassigned"
            : (row: ViolationWithStudent) => row.violationType;

  const summary = Object.entries(
    rows.reduce<Record<string, number>>((acc, row) => {
      const key = summaryKey(row);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  return {
    rows,
    summary,
    total: rows.length,
    major: rows.filter((row) => row.category === "Major").length,
    minor: rows.filter((row) => row.category === "Minor").length,
    communityService: communityServiceRecommendation(
      rows.filter((row) => row.category === "Minor").length,
      rows.filter((row) => row.category === "Major").length,
    ),
  };
}

const DEMO_STUDENTS: Array<{ studentNumber: string; firstName: string; lastName: string; gradeLevel: string; section: string }> = [
  { studentNumber: "2026-00001", firstName: "Bin", lastName: "Khalid", gradeLevel: "Grade 12", section: "STEM 111-01" },
  { studentNumber: "2026-00002", firstName: "Maria", lastName: "Santos", gradeLevel: "Grade 11", section: "STEM 111-01" },
  { studentNumber: "2026-00003", firstName: "Juan", lastName: "Dela Cruz", gradeLevel: "Grade 12", section: "ABM 111-01" },
  { studentNumber: "2026-00004", firstName: "Angela", lastName: "Reyes", gradeLevel: "Grade 11", section: "HUMSS 111-01" },
  { studentNumber: "2026-00005", firstName: "Carlo", lastName: "Mendoza", gradeLevel: "Grade 12", section: "ICT 111-01" },
  { studentNumber: "2026-00006", firstName: "Sofia", lastName: "Garcia", gradeLevel: "Grade 11", section: "STEM 112-01" },
  { studentNumber: "2026-00007", firstName: "Miguel", lastName: "Torres", gradeLevel: "Grade 12", section: "GAS 111-01" },
  { studentNumber: "2026-00008", firstName: "Hannah", lastName: "Flores", gradeLevel: "Grade 11", section: "ABM 111-01" },
  { studentNumber: "2026-00009", firstName: "Paolo", lastName: "Ramos", gradeLevel: "Grade 12", section: "STEM 111-01" },
  { studentNumber: "2026-00010", firstName: "Lia", lastName: "Villanueva", gradeLevel: "Grade 11", section: "ICT 111-01" },
];

const DEMO_VIOLATIONS: Array<{ studentNumber: string; category: "Major" | "Minor"; type: string; daysAgo: number; status: "Pending" | "Resolved" | "Escalated"; description?: string; action?: string }> = [
  { studentNumber: "2026-00001", category: "Major", type: "Physical Assault", daysAgo: 60, status: "Pending", description: "Physical altercation inside the classroom.", action: "Pending disciplinary review." },
  { studentNumber: "2026-00001", category: "Minor", type: "Tardiness", daysAgo: 250, status: "Resolved", description: "Late for the first period.", action: "Verbal warning issued." },
  { studentNumber: "2026-00002", category: "Minor", type: "Tardiness", daysAgo: 5, status: "Resolved", action: "Advisory conducted." },
  { studentNumber: "2026-00002", category: "Minor", type: "Uniform Non-Compliance", daysAgo: 40, status: "Resolved" },
  { studentNumber: "2026-00002", category: "Major", type: "Bullying", daysAgo: 320, status: "Resolved", action: "Parent conference completed." },
  { studentNumber: "2026-00003", category: "Major", type: "Cheating During Exams", daysAgo: 15, status: "Escalated", description: "Caught using notes during midterm exam." },
  { studentNumber: "2026-00003", category: "Minor", type: "Littering Offense", daysAgo: 120, status: "Resolved" },
  { studentNumber: "2026-00003", category: "Minor", type: "Tardiness", daysAgo: 300, status: "Resolved" },
  { studentNumber: "2026-00004", category: "Minor", type: "Improper Haircut", daysAgo: 8, status: "Resolved" },
  { studentNumber: "2026-00004", category: "Minor", type: "Tardiness", daysAgo: 75, status: "Resolved" },
  { studentNumber: "2026-00005", category: "Major", type: "Vandalism", daysAgo: 30, status: "Pending", description: "Defaced classroom chairs." },
  { studentNumber: "2026-00005", category: "Minor", type: "Unauthorized Device Use", daysAgo: 200, status: "Resolved" },
  { studentNumber: "2026-00005", category: "Major", type: "Harrassment", daysAgo: 130, status: "Resolved", action: "Written warning and counseling." },
  { studentNumber: "2026-00006", category: "Minor", type: "Tardiness", daysAgo: 12, status: "Pending" },
  { studentNumber: "2026-00006", category: "Minor", type: "Class Absence", daysAgo: 95, status: "Resolved" },
  { studentNumber: "2026-00006", category: "Major", type: "Disrespect to Personnel", daysAgo: 280, status: "Resolved" },
  { studentNumber: "2026-00007", category: "Major", type: "Bullying", daysAgo: 45, status: "Escalated", description: "Repeated bullying of a classmate." },
  { studentNumber: "2026-00007", category: "Major", type: "Stealing", daysAgo: 160, status: "Resolved", action: "Item returned; parent notified." },
  { studentNumber: "2026-00008", category: "Minor", type: "Dress Code Violation", daysAgo: 22, status: "Resolved" },
  { studentNumber: "2026-00009", category: "Major", type: "Illegal Substances/Weapons", daysAgo: 90, status: "Escalated", description: "Found with prohibited substance." },
  { studentNumber: "2026-00009", category: "Minor", type: "Profane Language", daysAgo: 210, status: "Resolved" },
  { studentNumber: "2026-00010", category: "Minor", type: "Tardiness", daysAgo: 3, status: "Resolved" },
  { studentNumber: "2026-00010", category: "Minor", type: "Littering Offense", daysAgo: 50, status: "Pending" },
];

export async function ensureDemoData(userId?: number) {
  const existingStudents = await db.select().from(students);
  if (existingStudents.length) return;

  const [existingActivity] = await db.select({ id: activityLogs.id }).from(activityLogs).limit(1);
  if (existingActivity) return;

  const byNumber = new Map(existingStudents.map((student) => [student.studentNumber, student]));
  for (const demo of DEMO_STUDENTS) {
    if (!byNumber.has(demo.studentNumber)) {
      const [{ id: createdId }] = await db.insert(students).values({ ...demo, status: "Active" }).$returningId();
      const [created] = await db.select().from(students).where(eq(students.id, createdId)).limit(1);
      byNumber.set(demo.studentNumber, created);
    }
  }

  const rows = DEMO_VIOLATIONS.map((item) => {
    const student = byNumber.get(item.studentNumber);
    if (!student) return null;
    return {
      studentId: student.id,
      category: item.category,
      violationType: item.type,
      incidentDate: new Date(Date.now() - item.daysAgo * 86400000).toISOString().slice(0, 10),
      description: item.description ?? null,
      actionTaken: item.action ?? null,
      status: item.status,
      reportedBy: userId ?? null,
    } as NewViolation;
  }).filter((row): row is NewViolation => row !== null);

  if (rows.length) await db.insert(violations).values(rows);
}

export async function bulkCreateStudents(items: NewStudent[]) {
  if (!items.length) return [];
  const ids = await db.insert(students).values(items).$returningId();
  return db.select().from(students).where(inArray(students.id, ids.map(({ id }) => id)));
}

export async function deleteUsers(ids: number[]) {
  if (!ids.length) return;
  await db.delete(users).where(inArray(users.id, ids));
}
