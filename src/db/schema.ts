import {
  boolean,
  date,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  longtext,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const userRoleEnum = mysqlEnum("user_role", ["super_admin", "staff", "faculty"]);
export const studentStatusEnum = mysqlEnum("student_status", ["Active", "Inactive", "Archived"]);
export const violationCategoryEnum = mysqlEnum("violation_category", ["Major", "Minor"]);
export const violationStatusEnum = mysqlEnum("violation_status", ["Pending", "Resolved", "Escalated"]);

export type PermissionAction = "view" | "add" | "edit" | "delete" | "import" | "export";
export type PermissionModule = "students" | "violations" | "reports" | "logs";
export type PermissionMap = Record<PermissionModule, Partial<Record<PermissionAction, boolean>>>;

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  fullName: varchar("full_name", { length: 160 }).notNull(),
  username: varchar("username", { length: 80 }).notNull().unique(),
  email: varchar("email", { length: 160 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: mysqlEnum("role", ["super_admin", "staff", "faculty"]).notNull().default("staff"),
  permissions: json("permissions").$type<PermissionMap>().notNull().default({
    students: { view: true },
    violations: { view: true },
    reports: { view: true, export: true },
    logs: {},
  }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const students = mysqlTable("students", {
  id: int("id").autoincrement().primaryKey(),
  studentNumber: varchar("student_number", { length: 40 }).unique(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  middleName: varchar("middle_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  gradeLevel: varchar("grade_level", { length: 50 }).notNull(),
  section: varchar("section", { length: 80 }).notNull(),
  status: mysqlEnum("status", ["Active", "Inactive", "Archived"]).notNull().default("Active"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const violations = mysqlTable("violations", {
  id: int("id").autoincrement().primaryKey(),
  studentId: int("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "cascade" }),
  category: mysqlEnum("category", ["Major", "Minor"]).notNull(),
  violationType: varchar("violation_type", { length: 160 }).notNull(),
  incidentDate: date("incident_date", { mode: "string" }).notNull(),
  description: text("description"),
  actionTaken: text("action_taken"),
  remarks: text("remarks"),
  status: mysqlEnum("status", ["Pending", "Resolved", "Escalated"]).notNull().default("Pending"),
  reportedBy: int("reported_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const activityLogs = mysqlTable("activity_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").references(() => users.id, { onDelete: "set null" }),
  username: varchar("username", { length: 80 }).notNull(),
  role: varchar("role", { length: 40 }).notNull(),
  module: varchar("module", { length: 80 }).notNull(),
  action: varchar("action", { length: 80 }).notNull(),
  description: text("description").notNull(),
  ipAddress: varchar("ip_address", { length: 80 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const systemSettings = mysqlTable("system_settings", {
  id: int("id").autoincrement().primaryKey(),
  schoolName: varchar("school_name", { length: 220 }).notNull().default("National College of Science & Technology"),
  appSubtitle: varchar("app_subtitle", { length: 120 }).notNull().default("VIOLATION RECORDS"),
  loginTitle: varchar("login_title", { length: 120 }).notNull().default("Vchecker"),
  footerNotice: varchar("footer_notice", { length: 220 }).notNull().default("Confidential — Authorized Personnel Only"),
  primaryColor: varchar("primary_color", { length: 20 }).notNull().default("#0f8b74"),
  accentColor: varchar("accent_color", { length: 20 }).notNull().default("#14a7b5"),
  sidebarColor: varchar("sidebar_color", { length: 20 }).notNull().default("#0d1b27"),
  fontFamily: varchar("font_family", { length: 120 }).notNull().default("Inter"),
  sessionHours: int("session_hours").notNull().default(12),
  logoDataUrl: longtext("logo_data_url"),
  faviconDataUrl: longtext("favicon_data_url"),
  loginImageDataUrl: longtext("login_image_data_url"),
  dashboardImageDataUrl: longtext("dashboard_image_data_url"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;
export type Violation = typeof violations.$inferSelect;
export type NewViolation = typeof violations.$inferInsert;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type SystemSettings = typeof systemSettings.$inferSelect;
