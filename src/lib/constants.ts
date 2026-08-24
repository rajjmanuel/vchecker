import type { PermissionMap } from "@/db/schema";

export const DEFAULT_SETTINGS = {
  schoolName: "National College of Science & Technology",
  appSubtitle: "VIOLATION RECORDS",
  loginTitle: "Vchecker",
  footerNotice: "Confidential — Authorized Personnel Only",
  primaryColor: "#0f8b74",
  accentColor: "#14a7b5",
  sidebarColor: "#0d1b27",
  fontFamily: "Inter",
  sessionHours: 12,
};

export const GRADE_LEVELS = ["Grade 11", "Grade 12"];

export const SECTIONS = [
  "STEM 111-01",
  "STEM 112-01",
  "ABM 111-01",
  "HUMSS 111-01",
  "ICT 111-01",
  "GAS 111-01",
];

export const STUDENT_STATUSES = ["Active", "Inactive", "Archived"] as const;
export const VIOLATION_CATEGORIES = ["Major", "Minor"] as const;
export const VIOLATION_STATUSES = ["Pending", "Resolved", "Escalated"] as const;

export const MAJOR_VIOLATION_TYPES = [
  "Bullying",
  "Vandalism",
  "Illegal Substances/Weapons",
  "Disrespect to Personnel",
  "Sexual Misconduct",
  "Physical Assault",
  "Negative Representation of NCST",
  "Harrassment",
  "Stealing",
  "Threatening Behavior",
  "Vandalism of Property",
  "Class Disruption",
  "Gambling on Campus",
  "Unauthorized Groups",
  "Repeated Offenses",
  "Frequent Rule Violations",
  "Possession of Pornography",
  "Scandalous Behavior",
  "Cheating During Exams",
  "Document Tampering",
  "Smoking Violation",
  "Unauthorized Use of NCST Name",
];

export const MINOR_VIOLATION_TYPES = [
  "Improper Haircut",
  "Tardiness",
  "Verbal Threats",
  "Littering Offense",
  "Improper Conduct",
  "Uniform Non-Compliance",
  "Dress Code Violation",
  "Obscene Material",
  "Failure to Notify Parents",
  "Unauthorized Presence",
  "Profane Language",
  "Classroom Disruption",
  "Unauthorized Device Use",
  "Misconduct at Events",
  "Religious Disrespect",
  "Unauthorized Sales Activity",
  "Inappropriate Affection",
  "Class Absence",
  "Other",
];

export const DEFAULT_STAFF_PERMISSIONS: PermissionMap = {
  students: { view: true, add: false, edit: false, delete: false, import: false, export: true },
  violations: { view: true, add: true, edit: true, delete: false, export: true },
  reports: { view: true, export: true },
  logs: { view: false },
};

export const FACULTY_PERMISSIONS: PermissionMap = {
  students: { view: true, export: true },
  violations: { view: true, export: true },
  reports: { view: true, export: true },
  logs: { view: false },
};

export function normalizePermissions(value: PermissionMap | string | null | undefined, role: "staff" | "faculty" = "staff"): PermissionMap {
  const defaults = role === "faculty" ? FACULTY_PERMISSIONS : DEFAULT_STAFF_PERMISSIONS;
  let parsed: Partial<PermissionMap> = {};
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as Partial<PermissionMap>;
    } catch {
      parsed = {};
    }
  } else if (value && typeof value === "object") {
    parsed = value;
  }

  return {
    students: { ...defaults.students, ...(parsed.students || {}) },
    violations: { ...defaults.violations, ...(parsed.violations || {}) },
    reports: { ...defaults.reports, ...(parsed.reports || {}) },
    logs: { ...defaults.logs, ...(parsed.logs || {}) },
  };
}

export const SUPER_ADMIN_PERMISSIONS: PermissionMap = {
  students: { view: true, add: true, edit: true, delete: true, import: true, export: true },
  violations: { view: true, add: true, edit: true, delete: true, export: true },
  reports: { view: true, export: true },
  logs: { view: true, export: true },
};

export const PERMISSION_LABELS = [
  { key: "view", label: "View" },
  { key: "add", label: "Add" },
  { key: "edit", label: "Edit" },
  { key: "delete", label: "Delete" },
  { key: "import", label: "Import" },
  { key: "export", label: "Export" },
] as const;

export const PERMISSION_MODULES = [
  { key: "students", label: "Student Records" },
  { key: "violations", label: "Violations" },
  { key: "reports", label: "Reports" },
  { key: "logs", label: "Activity Logs" },
] as const;
