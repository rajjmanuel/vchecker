"use client";

import { CSSProperties, FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import type * as React from "react";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Clock3,
  Download,
  Edit3,
  Eye,
  FileDown,
  FileSpreadsheet,
  FileText,
  Home,
  ImagePlus,
  Lock,
  LogOut,
  Menu,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  UserCog,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  DEFAULT_STAFF_PERMISSIONS,
  DEFAULT_SETTINGS,
  FACULTY_PERMISSIONS,
  GRADE_LEVELS,
  MAJOR_VIOLATION_TYPES,
  normalizePermissions,
  MINOR_VIOLATION_TYPES,
  PERMISSION_LABELS,
  PERMISSION_MODULES,
  STUDENT_STATUSES,
  SUPER_ADMIN_PERMISSIONS,
  VIOLATION_STATUSES,
} from "@/lib/constants";
import type { PermissionAction, PermissionMap, PermissionModule } from "@/db/schema";

type Role = "super_admin" | "staff" | "faculty";
type PageKey = "dashboard" | "students" | "violations" | "reports" | "logs" | "users" | "settings";

type SettingsRecord = {
  id?: number;
  schoolName: string;
  appSubtitle: string;
  loginTitle: string;
  footerNotice: string;
  primaryColor: string;
  accentColor: string;
  sidebarColor: string;
  fontFamily: string;
  sessionHours: number;
  logoDataUrl?: string | null;
  faviconDataUrl?: string | null;
  loginImageDataUrl?: string | null;
  dashboardImageDataUrl?: string | null;
};

type CurrentUser = {
  id: number;
  fullName: string;
  username: string;
  email: string;
  role: Role;
  permissions: PermissionMap;
};

type Student = {
  id: number;
  studentNumber: string | null;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  gradeLevel: string;
  section: string;
  status: "Active" | "Inactive" | "Archived";
  notes?: string | null;
  majorCount?: number;
  minorCount?: number;
  totalViolations?: number;
  violations?: Violation[];
};

type Violation = {
  id: number;
  studentId: number;
  category: "Major" | "Minor";
  violationType: string;
  incidentDate: string;
  description?: string | null;
  actionTaken?: string | null;
  remarks?: string | null;
  status: "Pending" | "Resolved" | "Escalated";
  student?: Student;
  reporter?: { id: number; fullName: string; username: string } | null;
  createdAt?: string;
};

type LogEntry = {
  id: number;
  username: string;
  role: string;
  module: string;
  action: string;
  description: string;
  ipAddress?: string | null;
  createdAt: string | number;
};

type ManagedUser = {
  id: number;
  fullName: string;
  username: string;
  email: string;
  role: Role;
  permissions: PermissionMap;
  isActive: boolean;
  createdAt?: string;
};

type DashboardData = {
  stats: {
    totalStudents: number;
    studentsWithViolations: number;
    totalViolations: number;
    majorViolations: number;
    minorViolations: number;
    violationsThisMonth: number;
    percentageWithViolations: number;
  };
  majorMinor: { name: string; value: number }[];
  monthly: { label: string; Major: number; Minor: number }[];
  byType: { name: string; value: number }[];
  byGrade: { name: string; value: number }[];
  recent: Violation[];
  common: { name: string; value: number }[];
};

type ReportData = {
  rows: Violation[];
  summary: { name: string; value: number }[];
  total: number;
  major: number;
  minor: number;
  communityService: {
    minorLabel: string;
    majorLabel: string;
    minimumTotal: string;
  };
};

type ApiResponse<T> = { ok: true; data: T } | { ok: false; message: string; details?: unknown };

const emptyDashboard: DashboardData = {
  stats: {
    totalStudents: 0,
    studentsWithViolations: 0,
    totalViolations: 0,
    majorViolations: 0,
    minorViolations: 0,
    violationsThisMonth: 0,
    percentageWithViolations: 0,
  },
  majorMinor: [],
  monthly: [],
  byType: [],
  byGrade: [],
  recent: [],
  common: [],
};

const navItems: { key: PageKey; label: string; icon: ReactNode; superOnly?: boolean }[] = [
  { key: "dashboard", label: "Dashboard", icon: <Home size={18} /> },
  { key: "students", label: "Student Records", icon: <UserRound size={18} /> },
  { key: "violations", label: "Violations", icon: <AlertTriangle size={18} /> },
  { key: "reports", label: "Reports", icon: <FileText size={18} /> },
  { key: "logs", label: "Activity Logs", icon: <Clock3 size={18} /> },
  { key: "users", label: "User Management", icon: <UserCog size={18} />, superOnly: true },
  { key: "settings", label: "System Settings", icon: <Settings size={18} />, superOnly: true },
];

const reportTabs = [
  { key: "major", title: "Major Violation Report", desc: "All major violations with per-type breakdown" },
  { key: "minor", title: "Minor Violation Report", desc: "All minor violations with per-type breakdown" },
  { key: "date", title: "Violations by Date Range", desc: "Monthly distribution within a period" },
  { key: "grade", title: "Violations by Grade / Year Level", desc: "Counts per grade level" },
  { key: "section", title: "Violations by Section", desc: "Counts per section" },
  { key: "type", title: "Violations by Violation Type", desc: "Counts per violation type" },
  { key: "staff", title: "Violations by Staff / Reporter", desc: "Counts per reporting personnel" },
  { key: "history", title: "Student Violation History", desc: "Complete history for one student" },
] as const;

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "Request failed." : payload.message || "Request failed.");
  }
  return payload.data;
}

function swalSuccess(message: string) {
  return Swal.fire({
    icon: "success",
    title: "Success",
    text: message,
    timer: 3500,
    timerProgressBar: true,
    showConfirmButton: false,
    showCloseButton: true,
  });
}

function swalError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Something went wrong.");
  return Swal.fire({
    icon: "error",
    title: "Error",
    text: message,
    timer: 4500,
    timerProgressBar: true,
    showConfirmButton: false,
    showCloseButton: true,
  });
}

async function swalConfirm(title: string, text: string) {
  const result = await Swal.fire({
    icon: "warning",
    title,
    text,
    showCancelButton: true,
    confirmButtonText: "Yes, continue",
    cancelButtonText: "Cancel",
    confirmButtonColor: "#0f8b74",
    cancelButtonColor: "#64748b",
  });
  return result.isConfirmed;
}

function roleLabel(role: Role | string) {
  if (role === "super_admin") return "Super Admin";
  if (role === "faculty") return "Faculty";
  return "Staff";
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "SA";
}

function studentName(student?: Pick<Student, "firstName" | "lastName"> | null) {
  return student ? `${student.lastName}, ${student.firstName}` : "Unknown student";
}

function displayStudent(student?: Student | null) {
  return student ? `${student.lastName}, ${student.firstName} · ${student.studentNumber || "No student no."} · ${student.gradeLevel} ${student.section}` : "—";
}

function formatDate(date: string | undefined) {
  if (!date) return "—";
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(date: string | number | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function toQuery(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && value !== "All" && value !== "All modules") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

function downloadCsv(filename: string, rows: Array<Record<string, string | number | null | undefined>>) {
  const headers = Object.keys(rows[0] || { Empty: "" });
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header] ?? "";
          return `"${String(value).replaceAll('"', '""')}"`;
        })
        .join(","),
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function parseStudentsCsv(text: string) {
  const [headerLine, ...lines] = text.split(/\r?\n/).filter((line) => line.trim());
  const headers = headerLine.split(",").map((h) => h.trim().toLowerCase());
  return lines.map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row = Object.fromEntries(headers.map((h, index) => [h, values[index] || ""]));
    return {
      studentNumber: row.studentnumber || row.student_number || row.number || row["student number"],
      firstName: row.firstname || row.first_name || row["first name"],
      middleName: row.middlename || row.middle_name || row["middle name"] || null,
      lastName: row.lastname || row.last_name || row["last name"],
      gradeLevel: row.gradelevel || row.grade_level || row.grade || row["grade / year level"],
      section: row.section,
      status: (row.status || "Active") as "Active" | "Inactive" | "Archived",
      notes: row.notes || null,
    };
  });
}

function hasPermission(user: CurrentUser | null, module: PermissionModule, action: PermissionAction) {
  if (!user) return false;
  if (user.role === "super_admin") return true;
  return Boolean(user.permissions?.[module]?.[action]);
}

function fontStack(fontFamily?: string) {
  if (fontFamily === "Poppins") return "Poppins, Inter, Arial, sans-serif";
  if (fontFamily === "Arial") return "Arial, Inter, sans-serif";
  if (fontFamily === "Verdana") return "Verdana, Inter, sans-serif";
  return "Inter, Poppins, Arial, sans-serif";
}

function adjustColor(hex: string, amount: number) {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0x0000ff) + amount));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

type Pager<T> = {
  paged: T[];
  page: number;
  setPage: (page: number) => void;
  rowsPerPage: number;
  setRowsPerPage: (rows: number) => void;
  total: number;
  from: number;
  to: number;
  totalPages: number;
};

function usePaged<T>(rows: T[]): Pager<T> {
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * rowsPerPage;
  return {
    paged: rows.slice(start, start + rowsPerPage),
    page: safePage,
    setPage,
    rowsPerPage,
    setRowsPerPage,
    total: rows.length,
    from: rows.length ? start + 1 : 0,
    to: Math.min(start + rowsPerPage, rows.length),
    totalPages,
  };
}

function PaginationBar({ pager }: { pager: Pager<unknown> }) {
  const { page, totalPages } = pager;
  const startPage = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, i) => startPage + i);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm text-slate-500">
      <span>Showing <b>{pager.from}–{pager.to}</b> of <b>{pager.total}</b></span>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">Rows
          <select className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal normal-case" value={pager.rowsPerPage} onChange={(e) => { pager.setRowsPerPage(Number(e.target.value)); pager.setPage(1); }}>
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div className="flex gap-1">
          <Button variant="ghost" disabled={page <= 1} onClick={() => pager.setPage(page - 1)}>Prev</Button>
          {pages.map((n) => <Button key={n} variant={n === page ? "primary" : "ghost"} onClick={() => pager.setPage(n)}>{n}</Button>)}
          <Button variant="ghost" disabled={page >= totalPages} onClick={() => pager.setPage(page + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}

function Card({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <section className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", className)} style={style}>{children}</section>;
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("grid gap-2", className)}>
      <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function inputClass(extra?: string) {
  return cn(
    "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10",
    extra,
  );
}

function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  className,
  disabled,
  form,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "danger" | "ghost" | "soft";
  className?: string;
  disabled?: boolean;
  form?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      form={form}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-primary text-white hover:bg-primary/90",
        variant === "secondary" && "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
        variant === "danger" && "border border-red-100 bg-white text-red-700 hover:bg-red-50",
        variant === "ghost" && "text-slate-700 hover:bg-slate-100",
        variant === "soft" && "bg-teal-50 text-teal-800 hover:bg-teal-100",
        className,
      )}
    >
      {children}
    </button>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  tone = "neutral",
}: {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  tone?: "view" | "edit" | "danger" | "neutral";
}) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={onClick}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-lg border transition",
          tone === "view" && "border-teal-100 bg-teal-50 text-teal-700 hover:bg-teal-100",
          tone === "edit" && "border-slate-200 bg-white text-slate-700 hover:bg-slate-100",
          tone === "danger" && "border-red-100 bg-white text-red-600 hover:bg-red-50",
          tone === "neutral" && "border-slate-200 bg-white text-slate-700 hover:bg-slate-100",
        )}
      >
        {icon}
      </button>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-bold text-white opacity-0 shadow-lg transition group-hover:opacity-100">
        {label}
      </span>
    </span>
  );
}

function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "red" | "amber" | "blue" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-extrabold",
        tone === "slate" && "bg-slate-100 text-slate-700",
        tone === "green" && "bg-emerald-100 text-emerald-800",
        tone === "red" && "bg-red-100 text-red-700",
        tone === "amber" && "bg-amber-100 text-amber-800",
        tone === "blue" && "bg-blue-100 text-blue-800",
      )}
    >
      {children}
    </span>
  );
}

function Modal({
  title,
  subtitle,
  children,
  footer,
  onClose,
  maxWidth = "max-w-2xl",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  maxWidth?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-slate-950/45 px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-10" onMouseDown={onClose}>
      <div className={cn("mx-auto w-full rounded-xl bg-white shadow-2xl", maxWidth)} onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-200 px-4 py-4 sm:px-6">
          <div>
            <h3 className="text-lg font-extrabold text-slate-950">{title}</h3>
            {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <div className="px-4 py-5 sm:px-6">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-4 sm:px-6">{footer}</div> : null}
      </div>
    </div>
  );
}

function EmptyLogo({ small = false }: { small?: boolean }) {
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-lg border border-yellow-300 bg-slate-900 text-[10px] font-black text-yellow-300",
        small ? "h-9 w-9" : "h-12 w-12",
      )}
    >
      NCST
    </div>
  );
}

function LoadingScreen({ settings }: { settings?: SettingsRecord }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-100" style={settings ? { fontFamily: fontStack(settings.fontFamily) } : undefined}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-xl">
        {settings?.logoDataUrl ? (
          <img src={settings.logoDataUrl} alt="Logo" className="mx-auto max-h-16 max-w-32 rounded-2xl object-contain" />
        ) : (
          <div className="mx-auto w-fit"><EmptyLogo /></div>
        )}
        <p className="mt-4 text-lg font-black text-slate-950">{settings?.schoolName || "Violation Records"}</p>
        <p className="text-xs font-bold tracking-widest text-slate-400">{settings?.appSubtitle || "VIOLATION RECORDS"}</p>
        <RefreshCw className="mx-auto mt-5 animate-spin text-primary" size={30} />
        <p className="mt-4 font-bold text-slate-900">Loading violation records system...</p>
        <p className="text-sm text-slate-500">Please wait while records are secured.</p>
      </div>
    </main>
  );
}

function LoginPage({
  settings,
  needsSetup,
  onDone,
}: {
  settings: SettingsRecord;
  needsSetup: boolean;
  onDone: () => Promise<void>;
}) {
  const [form, setForm] = useState({ fullName: "System Administrator", username: "admin", email: "admin@school.edu", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiFetch(needsSetup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        body: JSON.stringify(needsSetup ? form : { username: form.username, password: form.password }),
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen grid-cols-1 bg-slate-100 lg:grid-cols-[520px_1fr]" style={{ fontFamily: fontStack(settings.fontFamily) }}>
      <section className="grid place-items-center px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
          <div className="mb-8 flex items-center justify-center gap-3 text-left">
            {settings.logoDataUrl ? <img src={settings.logoDataUrl} alt="Logo" className="max-h-14 max-w-32 rounded-xl object-contain" /> : <EmptyLogo />}
            <div>
              <h2 className="text-xl font-black" style={{ color: "rgb(47, 124, 170)" }}>{needsSetup ? "Create First Super Admin" : "Sign in"}</h2>
              <p className="text-sm font-medium text-slate-500">{needsSetup ? "Setup begins here on the login page." : settings.schoolName}</p>
            </div>
          </div>
          <div className="grid gap-4">
            {needsSetup ? (
              <>
                <Field label="Full Name">
                  <input className={inputClass()} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
                </Field>
                <Field label="Email">
                  <input className={inputClass()} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </Field>
              </>
            ) : null}
            <Field label="Username or Email">
              <input className={inputClass()} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="username" />
            </Field>
            <Field label="Password">
              <input className={inputClass()} type="password" value={form.password} onChange={(e) => { setForm({ ...form, password: e.target.value }); setError(""); }} autoComplete={needsSetup ? "new-password" : "current-password"} placeholder="Minimum 8 characters" />
            </Field>
            {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
            <Button type="submit" className="mt-2 h-12 w-full" disabled={loading}>
              <ShieldCheck size={18} /> {loading ? "Please wait..." : needsSetup ? "Create Super Admin" : "Sign In"}
            </Button>
          </div>
          <div className="mt-5 rounded-lg bg-slate-100 px-4 py-3 text-sm italic text-slate-600">Developed by: Rajj</div>
          <p className="mt-4 text-center text-xs text-slate-500">{settings.footerNotice}</p>
        </form>
      </section>
      <section
        className="relative hidden overflow-hidden bg-slate-900 text-white lg:block"
        style={{ backgroundColor: settings.sidebarColor || DEFAULT_SETTINGS.sidebarColor }}
      >
        {settings.loginImageDataUrl ? <img src={settings.loginImageDataUrl} alt="Login" className="absolute inset-0 h-full w-full object-contain opacity-[0.14]" style={{ mixBlendMode: 'screen' }} /> : null}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/75 via-slate-900/70 to-teal-950/75" />
        <div className="relative z-10 flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-4">
            {settings.logoDataUrl ? <img src={settings.logoDataUrl} alt="Logo" className="max-h-14 max-w-32 rounded-xl object-contain" /> : <EmptyLogo />}
            <div>
              <h1 className="max-w-md text-2xl font-black leading-tight">{settings.schoolName}</h1>
              <p className="mt-1 text-sm font-bold tracking-widest text-teal-200">{settings.appSubtitle}</p>
            </div>
          </div>
          <div className="max-w-2xl">
            <Badge tone="green">Secure Disciplinary Records</Badge>
            {settings.loginTitle ? <h1 className="mt-6 text-6xl font-black leading-none tracking-tight">{settings.loginTitle}</h1> : null}
            <h2 className="mt-6 text-4xl font-black leading-tight">Manage student violations easily and efficiently.</h2>
            <p className="mt-5 text-lg text-slate-300">Designed for authorized personnel only with role-based permissions and immutable activity trails.</p>
          </div>
          <p className="text-sm text-slate-400">{settings.footerNotice} · Session timeout {settings.sessionHours || 12}h</p>
        </div>
      </section>
    </main>
  );
}

function DonutChart({ data }: { data: { name: string; value: number }[] }) {
  const major = data.find((d) => d.name === "Major")?.value ?? 0;
  const minor = data.find((d) => d.name === "Minor")?.value ?? 0;
  const total = major + minor;
  const majorPct = total ? (major / total) * 100 : 0;
  return (
    <div className="grid h-64 place-items-center">
      <div
        className="h-44 w-44 rounded-full"
        style={{ background: total ? `conic-gradient(#c7352b 0 ${majorPct}%, #f2a23a ${majorPct}% 100%)` : "conic-gradient(#e2e8f0 0 100%)" }}
      >
        <div className="grid h-full w-full place-items-center rounded-full p-7">
          <div className="h-full w-full rounded-full bg-white" />
        </div>
      </div>
      <div className="mt-3 flex gap-5 text-xs text-slate-600">
        <span className="inline-flex items-center gap-2"><i className="h-3 w-3 bg-red-700" /> Major</span>
        {minor ? <span className="inline-flex items-center gap-2"><i className="h-3 w-3 bg-amber-500" /> Minor</span> : null}
      </div>
    </div>
  );
}

function LineChart({ data }: { data: DashboardData["monthly"] }) {
  const max = Math.max(4, ...data.flatMap((d) => [d.Major, d.Minor]));
  const points = (key: "Major" | "Minor") =>
    data
      .map((d, index) => {
        const x = 30 + (index * 740) / Math.max(1, data.length - 1);
        const y = 190 - (d[key] * 160) / max;
        return `${x},${y}`;
      })
      .join(" ");
  return (
    <div className="h-64 w-full overflow-hidden">
      <svg viewBox="0 0 820 230" className="h-full w-full">
        {[0, 1, 2, 3, 4].map((tick) => (
          <g key={tick}>
            <line x1="30" x2="790" y1={190 - tick * 40} y2={190 - tick * 40} stroke="#dbe4ee" strokeDasharray="4 5" />
            <text x="8" y={194 - tick * 40} fontSize="11" fill="#51627a">{Math.round((max / 4) * tick)}</text>
          </g>
        ))}
        <polyline fill="none" stroke="#c7352b" strokeWidth="3" points={points("Major")} />
        <polyline fill="none" stroke="#f2a23a" strokeWidth="3" points={points("Minor")} />
        {data.map((d, index) => {
          const x = 30 + (index * 740) / Math.max(1, data.length - 1);
          return (
            <text key={d.label} x={x} y="215" textAnchor="middle" fontSize="11" fill="#51627a">
              {d.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function HorizontalBar({ data }: { data: { name: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="grid gap-4 py-6">
      {(data.length ? data : [{ name: "No data yet", value: 0 }]).map((item) => (
        <div key={item.name} className="grid grid-cols-[190px_1fr_40px] items-center gap-3 text-sm">
          <span className="truncate text-right text-slate-700">{item.name}</span>
          <div className="h-4 rounded-r bg-slate-100">
            <div className="h-4 rounded-r bg-cyan-600" style={{ width: `${item.value ? Math.max(6, (item.value / max) * 100) : 0}%` }} />
          </div>
          <span className="font-bold text-slate-700">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function VerticalBar({ data }: { data: { name: string; value: number }[] }) {
  const max = Math.max(4, ...data.map((d) => d.value));
  return (
    <div className="flex h-64 items-end gap-8 border-b border-dashed border-slate-200 px-10 py-6">
      {(data.length ? data : [{ name: "No data", value: 0 }]).map((item) => (
        <div key={item.name} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
          <div className="w-10 rounded-t bg-blue-800" style={{ height: `${item.value ? Math.max(14, (item.value / max) * 190) : 1}px` }} />
          <span className="text-xs text-slate-600">{item.name}</span>
        </div>
      ))}
    </div>
  );
}

function DashboardPage({ dashboard, setActive }: { dashboard: DashboardData; setActive: (key: PageKey) => void }) {
  const stats = [
    { label: "Total Students", value: dashboard.stats.totalStudents, icon: <UserRound size={22} />, tone: "blue" },
    { label: "Students with Violations", value: dashboard.stats.studentsWithViolations, sub: `${dashboard.stats.percentageWithViolations}% of all students`, icon: <UserRound size={22} />, tone: "amber" },
    { label: "Total Violations", value: dashboard.stats.totalViolations, icon: <AlertTriangle size={22} />, tone: "teal" },
    { label: "Major Violations", value: dashboard.stats.majorViolations, icon: <AlertTriangle size={22} />, tone: "red" },
    { label: "Minor Violations", value: dashboard.stats.minorViolations, icon: <Clock3 size={22} />, tone: "slate" },
    { label: "Violations This Month", value: dashboard.stats.violationsThisMonth, icon: <Calendar size={22} />, tone: "blue" },
  ];
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black text-slate-950">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Overview of student records and disciplinary activity</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stats.map((item) => (
          <Card key={item.label} className="flex items-center gap-4 p-5">
            <div className={cn("grid h-12 w-12 place-items-center rounded-lg", item.tone === "red" && "bg-red-100 text-red-700", item.tone === "amber" && "bg-amber-100 text-amber-700", item.tone === "teal" && "bg-teal-100 text-teal-700", item.tone === "blue" && "bg-blue-100 text-blue-800", item.tone === "slate" && "bg-slate-100 text-slate-700")}>{item.icon}</div>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-slate-500">{item.label}</p>
              <p className="text-3xl font-black text-slate-950">{item.value}</p>
              {item.sub ? <p className="text-xs text-slate-500">{item.sub}</p> : null}
            </div>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-5"><h2 className="font-black">Major vs Minor Violations</h2><DonutChart data={dashboard.majorMinor} /></Card>
        <Card className="p-5"><h2 className="font-black">Violations by Month (12 months)</h2><LineChart data={dashboard.monthly} /></Card>
        <Card className="p-5"><h2 className="font-black">Violations by Type (top 8)</h2><HorizontalBar data={dashboard.byType} /></Card>
        <Card className="p-5"><h2 className="font-black">Violations by Grade / Year Level</h2><VerticalBar data={dashboard.byGrade} /></Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-black">Recent Violations</h2><button onClick={() => setActive("violations")} className="text-sm font-bold text-primary">View all →</button></div>
          <div className="grid gap-3">
            {dashboard.recent.length ? dashboard.recent.map((violation) => (
              <div key={violation.id} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Badge tone={violation.category === "Major" ? "red" : "amber"}>{violation.category}</Badge>
                  <div>
                    <p className="font-bold text-slate-950">{violation.violationType}</p>
                    <p className="text-xs text-slate-500">{displayStudent(violation.student)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-500"><span>{formatDate(violation.incidentDate)}</span><Badge>{violation.status}</Badge></div>
              </div>
            )) : <p className="text-sm text-slate-500">No violations recorded yet.</p>}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 font-black">Most Common Violations</h2>
          <div className="grid gap-3">
            {dashboard.common.length ? dashboard.common.map((item, index) => (
              <div key={item.name} className="flex items-center justify-between text-sm"><span><b className="mr-3 rounded-full bg-slate-100 px-2 py-1 text-xs">{index + 1}</b>{item.name}</span><b className="text-primary">{item.value}</b></div>
            )) : <p className="text-sm text-slate-500">No common violations yet.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function StudentFormModal({ student, onClose, onSave }: { student?: Student | null; onClose: () => void; onSave: (payload: Partial<Student>) => Promise<void> }) {
  const [form, setForm] = useState({
    studentNumber: student?.studentNumber || "",
    firstName: student?.firstName || "",
    lastName: student?.lastName || "",
    gradeLevel: student?.gradeLevel || GRADE_LEVELS[0],
    section: student?.section || "STEM 111-01",
    status: student?.status || "Active",
  });
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (form.studentNumber.trim() && !/^\d+(-\d+)*$/.test(form.studentNumber.trim())) {
      void swalError(new Error("Student number can only contain numbers, with optional dashes (e.g. 202600001 or 2026-00001)."));
      return;
    }
    setLoading(true);
    try {
      await onSave(form as Partial<Student>);
      onClose();
    } catch {
      // error toast is shown by the parent handler
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal title={student ? "Edit Student" : "Add Student"} subtitle="Internal student record management — confidential" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="student-form" disabled={loading}>{student ? "Save Changes" : "Add Student"}</Button></>}>
      <form id="student-form" onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <Field label="Student Number (optional)"><input className={inputClass()} placeholder="Optional, e.g. 202600001 or 2026-00001" value={form.studentNumber} onChange={(e) => setForm({ ...form, studentNumber: e.target.value })} /></Field>
        <Field label="Status"><select className={inputClass()} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Student["status"] })}>{STUDENT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="First Name"><input className={inputClass()} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
        <Field label="Last Name"><input className={inputClass()} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
        <Field label="Grade / Year Level"><select className={inputClass()} value={form.gradeLevel} onChange={(e) => setForm({ ...form, gradeLevel: e.target.value })}>{GRADE_LEVELS.map((g) => <option key={g}>{g}</option>)}</select></Field>
        <Field label="Section"><input className={inputClass()} placeholder="e.g. STEM 111-01" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}

function StudentDetailsModal({ student, onClose, onResetViolations }: { student: Student; onClose: () => void; onResetViolations?: () => Promise<void> }) {
  const majorCount = student.majorCount ?? student.violations?.filter((v) => v.category === "Major").length ?? 0;
  const minorCount = student.minorCount ?? student.violations?.filter((v) => v.category === "Minor").length ?? 0;
  const minorHours = minorCount * 2;
  const majorHours = majorCount === 1 ? 6 : majorCount === 2 ? 10 : majorCount >= 3 ? null : 0;
  const communityServiceHours = majorHours === null ? `${15 + minorHours}+` : String(minorHours + majorHours);
  return (
    <Modal title="Student Record" subtitle={`${student.firstName} ${student.lastName} · ${student.studentNumber || "No student number"}`} onClose={onClose} maxWidth="max-w-4xl">
      <div className="grid gap-4">
        <Card className="border-t-4 border-t-teal-700 p-5">
          <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Student Record</p>
          <h2 className="mt-1 text-2xl font-black">{student.firstName} {student.lastName}</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
            <div><p className="text-xs font-bold uppercase text-slate-500">Student Number</p><p className="font-black text-primary">{student.studentNumber || "—"}</p></div>
            <div><p className="text-xs font-bold uppercase text-slate-500">Grade / Year</p><p className="font-black">{student.gradeLevel}</p></div>
            <div><p className="text-xs font-bold uppercase text-slate-500">Section</p><p className="font-black">{student.section}</p></div>
          </div>
        </Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Card className="border-blue-200 bg-blue-50 p-4 text-center"><p className="font-black uppercase text-blue-800">Total</p><p className="text-4xl font-black text-blue-800">{student.totalViolations ?? student.violations?.length ?? 0}</p></Card>
          <Card className="border-red-200 bg-red-50 p-4 text-center"><p className="font-black uppercase text-red-700">Major</p><p className="text-4xl font-black text-red-700">{majorCount}</p></Card>
          <Card className="border-amber-200 bg-amber-50 p-4 text-center"><p className="font-black uppercase text-amber-700">Minor</p><p className="text-4xl font-black text-amber-700">{minorCount}</p></Card>
          <Card className="border-teal-200 bg-teal-50 p-4 text-center"><p className="font-black uppercase text-teal-700">CS HRS</p><p className="text-4xl font-black text-teal-700">{communityServiceHours}</p><p className="text-[10px] font-bold leading-tight text-teal-700">(Community Service Hours)</p></Card>
        </div>
      </div>
      {onResetViolations ? <div className="mt-4 flex justify-end"><Button variant="danger" onClick={onResetViolations}>Reset All Violations</Button></div> : null}
      <Card className="mt-4 p-5">
        <h3 className="mb-4 font-black">Violation History</h3>
        {/* Mobile Card View */}
        <div className="md:hidden space-y-3">
          {student.violations?.length ? student.violations.map((v) => (
            <div key={v.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <Badge tone={v.category === "Major" ? "red" : "amber"}>{v.category}</Badge>
                <Badge>{v.status}</Badge>
              </div>
              <p className="font-bold text-slate-950 mb-2">{v.violationType}</p>
              <div className="space-y-2 text-xs">
                <div><p className="text-slate-500">Date</p><p className="font-bold">{formatDate(v.incidentDate)}</p></div>
                <div><p className="text-slate-500">Action Taken</p><p className="font-bold text-slate-700">{v.actionTaken || "—"}</p></div>
              </div>
            </div>
          )) : <p className="text-sm text-slate-500 text-center py-4">No violation history.</p>}
        </div>
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase tracking-wider text-slate-500"><tr><th className="p-3">Category</th><th>Violation Type</th><th>Date</th><th>Status</th><th>Action Taken</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {student.violations?.length ? student.violations.map((v) => <tr key={v.id}><td className="p-3"><Badge tone={v.category === "Major" ? "red" : "amber"}>{v.category}</Badge></td><td className="font-bold">{v.violationType}</td><td>{formatDate(v.incidentDate)}</td><td><Badge>{v.status}</Badge></td><td>{v.actionTaken || "—"}</td></tr>) : <tr><td colSpan={5} className="p-5 text-center text-slate-500">No violation history.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </Modal>
  );
}

function StudentImportModal({ onClose, onImport }: { onClose: () => void; onImport: (file: File) => Promise<void> }) {
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      void swalError(new Error("Please upload a CSV file using the template format."));
      return;
    }
    setFileName(file.name);
    setLoading(true);
    try {
      await onImport(file);
      onClose();
    } catch {
      // error toast is shown by the parent handler
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="Import Students"
      subtitle="Upload a CSV file or drag it into the box below"
      onClose={onClose}
      maxWidth="max-w-xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="soft"
            onClick={() =>
              downloadCsv("student-import-template.csv", [
                {
                  StudentNumber: "2026-00002",
                  FirstName: "Juan",
                  LastName: "Dela Cruz",
                  GradeLevel: "Grade 11",
                  Section: "STEM 111-01",
                  Status: "Active",
                },
              ])
            }
          >
            <FileDown size={16} /> Download Template
          </Button>
        </>
      }
    >
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFile(event.dataTransfer.files?.[0]);
        }}
        className={cn(
          "grid min-h-56 place-items-center rounded-xl border-2 border-dashed p-6 text-center transition",
          dragging ? "border-teal-600 bg-teal-50" : "border-slate-300 bg-slate-50",
        )}
      >
        <div>
          <Upload className="mx-auto text-primary" size={34} />
          <p className="mt-3 text-base font-black text-slate-950">Drag your CSV file here</p>
          <p className="mt-1 text-sm text-slate-500">or click the button below to choose a file</p>
          {fileName ? <p className="mt-2 text-sm font-bold text-primary">Selected: {fileName}</p> : null}
          <label className="mt-4 inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white hover:bg-primary/90">
            <Upload size={16} /> Choose CSV File
            <input className="hidden" type="file" accept=".csv,text/csv" onChange={(event) => void handleFile(event.target.files?.[0])} disabled={loading} />
          </label>
        </div>
      </div>
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <p className="font-black text-slate-900">Required columns:</p>
        <p className="mt-1 font-mono text-xs">StudentNumber (optional), FirstName, LastName, GradeLevel, Section, Status</p>
        <p className="mt-2 text-xs">GradeLevel must be <b>Grade 11</b> or <b>Grade 12</b>. Section can be any value entered by the admin.</p>
      </div>
    </Modal>
  );
}

function StudentsPage({
  students,
  filters,
  setFilters,
  applyFilters,
  resetFilters,
  onAdd,
  onEdit,
  onView,
  onDelete,
  onImport,
  currentUser,
  sections,
}: {
  students: Student[];
  filters: Record<string, string>;
  setFilters: (filters: Record<string, string>) => void;
  applyFilters: () => void;
  resetFilters: () => void;
  onAdd: () => void;
  onEdit: (student: Student) => void;
  onView: (student: Student) => void;
  onDelete: (student: Student) => void;
  onImport: () => void;
  currentUser: CurrentUser;
  sections: string[];
}) {
  const [violationSort, setViolationSort] = useState<"desc" | "asc">("desc");
  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) =>
      violationSort === "desc"
        ? (b.totalViolations ?? 0) - (a.totalViolations ?? 0) || a.lastName.localeCompare(b.lastName)
        : (a.totalViolations ?? 0) - (b.totalViolations ?? 0) || a.lastName.localeCompare(b.lastName),
    );
  }, [students, violationSort]);
  const pager = usePaged(sortedStudents);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-black">Student Records</h1><p className="text-sm text-slate-500">Internal student record management — confidential</p></div>
        <div className="flex gap-2">
          {hasPermission(currentUser, "students", "import") ? <Button variant="secondary" onClick={onImport}><Download size={16} />Import</Button> : null}
          {hasPermission(currentUser, "students", "export") ? <Button variant="secondary" onClick={() => downloadCsv("students.csv", students.map((s) => ({ StudentNumber: s.studentNumber, FirstName: s.firstName, LastName: s.lastName, GradeLevel: s.gradeLevel, Section: s.section, Status: s.status })))}><Upload size={16} />Export Filtered</Button> : null}
          {hasPermission(currentUser, "students", "add") ? <Button onClick={onAdd}><Plus size={16} />Add Student</Button> : null}
        </div>
      </div>
      <Card className="p-5">
        <div className="grid gap-3 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <Field label="Search"><input className={inputClass()} placeholder="Student number, first or last name..." value={filters.search || ""} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /></Field>
          <Field label="Grade / Year Level"><select className={inputClass()} value={filters.gradeLevel || "All"} onChange={(e) => setFilters({ ...filters, gradeLevel: e.target.value })}><option>All</option>{GRADE_LEVELS.map((g) => <option key={g}>{g}</option>)}</select></Field>
          <Field label="Section"><select className={inputClass()} value={filters.section || "All"} onChange={(e) => setFilters({ ...filters, section: e.target.value })}><option>All</option>{sections.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Status"><select className={inputClass()} value={filters.status || "All"} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option>All</option>{STUDENT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        </div>
        <div className="mt-3 flex items-center justify-between"><div className="flex gap-2"><Button onClick={applyFilters}>Apply Filters</Button><Button variant="secondary" onClick={resetFilters}>Reset</Button></div><p className="text-sm text-slate-500">{students.length} record(s)</p></div>
      </Card>
      <Card className="overflow-hidden">
        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-slate-100">
          {pager.paged.map((student) => (
            <div key={student.id} className="p-4 hover:bg-slate-50">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-950 truncate">{student.firstName} {student.lastName}</p>
                  <p className="text-xs text-slate-500">{student.studentNumber || "No Student Number"}</p>
                </div>
                <Badge tone={student.status === "Active" ? "green" : "slate"}>{student.status}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                <div><p className="text-slate-500">Grade</p><p className="font-bold">{student.gradeLevel}</p></div>
                <div><p className="text-slate-500">Section</p><p className="font-bold">{student.section}</p></div>
                <div><p className="text-slate-500">Violations</p><p className={cn("font-black", (student.totalViolations ?? 0) > 0 ? "text-red-700" : "text-slate-500")}>{student.totalViolations ?? 0}</p></div>
              </div>
              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <IconButton label="View" tone="view" icon={<Eye size={16} />} onClick={() => onView(student)} />
                {hasPermission(currentUser, "students", "edit") ? <IconButton label="Edit" tone="edit" icon={<Edit3 size={16} />} onClick={() => onEdit(student)} /> : null}
                {hasPermission(currentUser, "students", "delete") ? <IconButton label="Delete" tone="danger" icon={<Trash2 size={16} />} onClick={() => onDelete(student)} /> : null}
              </div>
            </div>
          ))}
          {!pager.paged.length ? <div className="p-8 text-center text-slate-500">No student records found. Try adjusting the filters.</div> : null}
        </div>
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase tracking-wider text-slate-500"><tr><th className="p-3">Student Number</th><th>First Name</th><th>Last Name</th><th>Grade / Year Level</th><th>Section</th><th>Status</th><th><button type="button" onClick={() => setViolationSort(violationSort === "desc" ? "asc" : "desc")} className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-primary" title="Sort by total violations">{violationSort === "desc" ? <ArrowDown size={13} /> : <ArrowUp size={13} />}Total Violations</button></th><th>Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {pager.paged.map((student) => (
                <tr key={student.id} className="hover:bg-slate-50"><td className="p-3 font-bold">{student.studentNumber || "—"}</td><td>{student.firstName}</td><td>{student.lastName}</td><td>{student.gradeLevel}</td><td>{student.section}</td><td><Badge tone={student.status === "Active" ? "green" : "slate"}>{student.status}</Badge></td><td><span className={cn("inline-flex min-w-8 items-center justify-center rounded-full px-2 py-1 text-xs font-black", (student.totalViolations ?? 0) > 0 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500")}>{student.totalViolations ?? 0}</span></td><td><div className="flex gap-2"><IconButton label="View" tone="view" icon={<Eye size={16} />} onClick={() => onView(student)} />{hasPermission(currentUser, "students", "edit") ? <IconButton label="Edit" tone="edit" icon={<Edit3 size={16} />} onClick={() => onEdit(student)} /> : null}{hasPermission(currentUser, "students", "delete") ? <IconButton label="Delete" tone="danger" icon={<Trash2 size={16} />} onClick={() => onDelete(student)} /> : null}</div></td></tr>
              ))}
              {!students.length ? <tr><td colSpan={8} className="p-8 text-center text-slate-500">No student records found. Try adjusting the filters.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      <PaginationBar pager={pager} />
    </div>
  );
}

function ViolationFormModal({ students, violation, onClose, onSave }: { students: Student[]; violation?: Violation | null; onClose: () => void; onSave: (payload: Partial<Violation>) => Promise<void> }) {
  const initialCategory = violation?.category || "Minor";
  const isCustomMinor = initialCategory === "Minor" && Boolean(violation?.violationType) && !MINOR_VIOLATION_TYPES.includes(violation?.violationType || "");
  const [category, setCategory] = useState<"Major" | "Minor">(initialCategory);
  const [query, setQuery] = useState(violation?.student ? `${violation.student.lastName}, ${violation.student.firstName}${violation.student.studentNumber ? ` (${violation.student.studentNumber})` : ""}` : "");
  const [customViolationType, setCustomViolationType] = useState(isCustomMinor ? violation?.violationType || "" : "");
  const [form, setForm] = useState({
    studentId: violation?.studentId || 0,
    violationType: isCustomMinor ? "Other" : violation?.violationType || "",
    incidentDate: violation?.incidentDate || todayIso(),
    description: violation?.description || "",
    actionTaken: violation?.actionTaken || "",
    remarks: violation?.remarks || "",
    status: violation?.status || "Pending",
  });
  const [loading, setLoading] = useState(false);
  const matches = students.filter((student) => displayStudent(student).toLowerCase().includes(query.toLowerCase())).slice(0, 6);
  const options = category === "Major" ? MAJOR_VIOLATION_TYPES : MINOR_VIOLATION_TYPES;
  const needsCustomViolationType = category === "Minor" && form.violationType === "Other";
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.studentId) {
      void swalError(new Error("Please select a student before recording the violation."));
      return;
    }
    if (!form.violationType) {
      void swalError(new Error("Please select a violation type. This field is required."));
      return;
    }
    if (!form.incidentDate) {
      void swalError(new Error("Please set the date of incident."));
      return;
    }
    setLoading(true);
    try {
      const finalViolationType = needsCustomViolationType ? customViolationType.trim() : form.violationType;
      if (needsCustomViolationType && !finalViolationType) {
        void swalError(new Error("Please specify the Other minor violation."));
        return;
      }
      await onSave({ ...form, category, violationType: finalViolationType });
      if (violation) {
        onClose();
      } else {
        setCategory("Minor");
        setQuery("");
        setCustomViolationType("");
        setForm({
          studentId: 0,
          violationType: "",
          incidentDate: todayIso(),
          description: "",
          actionTaken: "",
          remarks: "",
          status: "Pending",
        });
      }
    } catch {
      // error toast is shown by the parent handler
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal title={violation ? "Edit Violation" : "Record Violation"} subtitle="Link the violation to a student record" onClose={onClose} maxWidth="max-w-2xl" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="violation-form" disabled={loading}>{violation ? "Save Changes" : "Record Violation"}</Button></>}>
      <form id="violation-form" onSubmit={submit} className="grid gap-4">
        <Field label="Student *">
          <div className="relative">
            <input className={inputClass()} placeholder="Search student by name or number..." value={query} onChange={(e) => { setQuery(e.target.value); setForm({ ...form, studentId: 0 }); }} disabled={Boolean(form.studentId)} />
            {form.studentId ? (
              <button type="button" onClick={() => { setForm({ ...form, studentId: 0 }); setQuery(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600" title="Clear student selection">
                <X size={18} />
              </button>
            ) : null}
            {query && !form.studentId ? <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">{matches.map((student) => <button type="button" key={student.id} onClick={() => { setForm({ ...form, studentId: student.id }); setQuery(`${student.lastName}, ${student.firstName}${student.studentNumber ? ` (${student.studentNumber})` : ""}`); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-teal-50">{displayStudent(student)}</button>)}{!matches.length ? <p className="px-3 py-2 text-sm text-slate-500">No matching student.</p> : null}</div> : null}
          </div>
        </Field>
        <div className="grid gap-4 md:grid-cols-[190px_1fr]">
          <Field label="Violation Category *"><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => { setCategory("Minor"); setForm({ ...form, violationType: "" }); }} className={cn("h-11 rounded-lg border text-sm font-black", category === "Minor" ? "border-amber-700 bg-amber-700 text-white" : "border-slate-200 bg-white")}>Minor</button><button type="button" onClick={() => { setCategory("Major"); setCustomViolationType(""); setForm({ ...form, violationType: "" }); }} className={cn("h-11 rounded-lg border text-sm font-black", category === "Major" ? "border-red-700 bg-red-700 text-white" : "border-slate-200 bg-white")}>Major</button></div></Field>
          <Field label={`Violation Type (${category}) *`}><select className={inputClass()} value={form.violationType} onChange={(e) => setForm({ ...form, violationType: e.target.value })}><option value="">Select {category} Violation...</option>{options.map((type) => <option key={type}>{type}</option>)}</select></Field>
        </div>
        {needsCustomViolationType ? <Field label="Specify Other Minor Violation *"><input className={inputClass()} placeholder="Enter specific minor violation" value={customViolationType} onChange={(e) => setCustomViolationType(e.target.value)} /></Field> : null}
        <div className="grid gap-4 md:grid-cols-2"><Field label="Date of Incident *"><input type="date" className={inputClass()} value={form.incidentDate} onChange={(e) => setForm({ ...form, incidentDate: e.target.value })} /></Field><Field label="Status"><select className={inputClass()} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Violation["status"] })}>{VIOLATION_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field></div>
        <Field label="Description / Incident Details"><textarea className={inputClass("h-24 py-3")} placeholder="What happened?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Action Taken"><textarea className={inputClass("h-20 py-3")} placeholder="e.g. Parent notified, suspension, counseling" value={form.actionTaken} onChange={(e) => setForm({ ...form, actionTaken: e.target.value })} /></Field>
          <Field label="Remarks"><textarea className={inputClass("h-20 py-3")} placeholder="Additional remarks" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></Field>
        </div>
      </form>
    </Modal>
  );
}

function ViolationsPage({
  violations,
  students,
  filters,
  setFilters,
  applyFilters,
  resetFilters,
  onRecord,
  onEdit,
  onView,
  onDelete,
  onResetAll,
  currentUser,
  sections,
}: {
  violations: Violation[];
  students: Student[];
  filters: Record<string, string>;
  setFilters: (filters: Record<string, string>) => void;
  applyFilters: () => void;
  resetFilters: () => void;
  onRecord: () => void;
  onEdit: (violation: Violation) => void;
  onView: (violation: Violation) => void;
  onDelete: (violation: Violation) => void;
  onResetAll: () => void;
  currentUser: CurrentUser;
  sections: string[];
}) {
  const typeOptions = useMemo(() => ["All types", ...MAJOR_VIOLATION_TYPES, ...MINOR_VIOLATION_TYPES], []);
  const pager = usePaged(violations);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-black">Violations</h1><p className="text-sm text-slate-500">All disciplinary records across student files</p></div><div className="flex flex-wrap gap-2">{hasPermission(currentUser, "violations", "export") ? <Button variant="secondary" onClick={() => downloadCsv("violations.csv", violations.map((v) => ({ Student: displayStudent(v.student), Category: v.category, ViolationType: v.violationType, Date: v.incidentDate, Status: v.status })))}><Upload size={16} />Export Filtered</Button> : null}{currentUser.role === "super_admin" ? <Button variant="danger" onClick={onResetAll}><Trash2 size={16} />Reset All Violations</Button> : null}{hasPermission(currentUser, "violations", "add") ? <Button onClick={onRecord}><Plus size={16} />Record Violation</Button> : null}</div></div>
      <Card className="p-5">
        <div className="grid gap-3 lg:grid-cols-[2fr_1fr_1fr_1fr]"><Field label="Student (name or number)"><input className={inputClass()} placeholder="e.g. Dela Cruz or 2026-00125" value={filters.search || ""} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /></Field><Field label="Category"><select className={inputClass()} value={filters.category || "All"} onChange={(e) => setFilters({ ...filters, category: e.target.value })}><option>All</option><option>Major</option><option>Minor</option></select></Field><Field label="Violation Type"><select className={inputClass()} value={filters.violationType || "All types"} onChange={(e) => setFilters({ ...filters, violationType: e.target.value })}>{typeOptions.map((type) => <option key={type}>{type}</option>)}</select></Field><Field label="From"><input type="date" className={inputClass()} value={filters.from || ""} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></Field></div>
        <div className="mt-3 grid gap-3 lg:grid-cols-4"><Field label="To"><input type="date" className={inputClass()} value={filters.to || ""} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></Field><Field label="Grade / Year Level"><select className={inputClass()} value={filters.gradeLevel || "All"} onChange={(e) => setFilters({ ...filters, gradeLevel: e.target.value })}><option>All</option>{GRADE_LEVELS.map((g) => <option key={g}>{g}</option>)}</select></Field><Field label="Section"><select className={inputClass()} value={filters.section || "All"} onChange={(e) => setFilters({ ...filters, section: e.target.value })}><option>All</option>{sections.map((s) => <option key={s}>{s}</option>)}</select></Field><Field label="Status"><select className={inputClass()} value={filters.status || "All"} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option>All</option>{VIOLATION_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field></div>
        <div className="mt-3 flex items-center justify-between"><div className="flex gap-2"><Button onClick={applyFilters}>Apply Filters</Button><Button variant="secondary" onClick={resetFilters}>Reset</Button></div><p className="text-sm text-slate-500">{violations.length} record(s)</p></div>
      </Card>
      <Card className="overflow-hidden"><div className="md:hidden divide-y divide-slate-100">{pager.paged.map((violation) => <div key={violation.id} className="p-4 hover:bg-slate-50"><div className="flex items-start justify-between gap-2 mb-3"><div className="flex-1 min-w-0"><p className="font-bold text-slate-950"><b>{studentName(violation.student)}</b></p><p className="text-xs text-slate-500">{violation.student?.studentNumber || "No student no."} · {violation.student?.gradeLevel} {violation.student?.section}</p></div><Badge tone={violation.category === "Major" ? "red" : "amber"}>{violation.category}</Badge></div><div className="space-y-2 mb-3 text-sm"><div><p className="text-xs text-slate-500">Violation Type</p><p className="font-bold">{violation.violationType}</p></div><div className="flex items-center justify-between"><div><p className="text-xs text-slate-500">Date</p><p className="font-bold">{formatDate(violation.incidentDate)}</p></div><Badge>{violation.status}</Badge></div></div><div className="flex gap-2 pt-2 border-t border-slate-100"><IconButton label="View" tone="view" icon={<Eye size={16} />} onClick={() => onView(violation)} />{hasPermission(currentUser, "violations", "edit") ? <IconButton label="Edit" tone="edit" icon={<Edit3 size={16} />} onClick={() => onEdit(violation)} /> : null}{hasPermission(currentUser, "violations", "delete") ? <IconButton label="Delete" tone="danger" icon={<Trash2 size={16} />} onClick={() => onDelete(violation)} /> : null}</div></div>)}{!pager.paged.length ? <div className="p-8 text-center text-slate-500">No violation records found.</div> : null}</div><div className="hidden md:block overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-slate-50 text-xs font-black uppercase tracking-wider text-slate-500"><tr><th className="p-3">Student</th><th>Category</th><th>Violation Type</th><th>Date of Incident</th><th>Status</th><th>Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{pager.paged.map((violation) => <tr key={violation.id} className="hover:bg-slate-50"><td className="p-3"><b>{studentName(violation.student)}</b><p className="text-xs text-slate-500">{violation.student?.studentNumber || "No student no."} · {violation.student?.gradeLevel} {violation.student?.section}</p></td><td><Badge tone={violation.category === "Major" ? "red" : "amber"}>{violation.category}</Badge></td><td>{violation.violationType}</td><td>{formatDate(violation.incidentDate)}</td><td><Badge>{violation.status}</Badge></td><td><div className="flex gap-2"><IconButton label="View" tone="view" icon={<Eye size={16} />} onClick={() => onView(violation)} />{hasPermission(currentUser, "violations", "edit") ? <IconButton label="Edit" tone="edit" icon={<Edit3 size={16} />} onClick={() => onEdit(violation)} /> : null}{hasPermission(currentUser, "violations", "delete") ? <IconButton label="Delete" tone="danger" icon={<Trash2 size={16} />} onClick={() => onDelete(violation)} /> : null}</div></td></tr>)}{!violations.length ? <tr><td colSpan={6} className="p-8 text-center text-slate-500">No violation records found.</td></tr> : null}</tbody></table></div></Card>
      <PaginationBar pager={pager} />
    </div>
  );
}

function ViolationDetailsModal({ violation, onClose }: { violation: Violation; onClose: () => void }) {
  return (
    <Modal title="Violation Record" subtitle={`Record #${violation.id}`} onClose={onClose} maxWidth="max-w-3xl">
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4"><p className="text-xs font-bold uppercase text-slate-500">Student</p><p className="mt-1 font-black">{studentName(violation.student)}</p><p className="text-sm text-slate-500">{displayStudent(violation.student)}</p></Card>
        <Card className="p-4"><p className="text-xs font-bold uppercase text-slate-500">Violation</p><div className="mt-2 flex items-center gap-2"><Badge tone={violation.category === "Major" ? "red" : "amber"}>{violation.category}</Badge><b>{violation.violationType}</b></div><p className="mt-2 text-sm text-slate-500">{formatDate(violation.incidentDate)} · {violation.status}</p></Card>
      </div>
      <div className="mt-4 grid gap-4"><Card className="p-4"><p className="text-xs font-bold uppercase text-slate-500">Description / Incident Details</p><p className="mt-2 whitespace-pre-wrap text-sm">{violation.description || "—"}</p></Card><Card className="p-4"><p className="text-xs font-bold uppercase text-slate-500">Action Taken</p><p className="mt-2 whitespace-pre-wrap text-sm">{violation.actionTaken || "—"}</p></Card><Card className="p-4"><p className="text-xs font-bold uppercase text-slate-500">Remarks</p><p className="mt-2 whitespace-pre-wrap text-sm">{violation.remarks || "—"}</p></Card></div>
    </Modal>
  );
}

function ReportsPage({ students, reportType, setReportType, filters, setFilters, report, loadReport, sections }: { students: Student[]; reportType: string; setReportType: (type: string) => void; filters: Record<string, string>; setFilters: (filters: Record<string, string>) => void; report: ReportData; loadReport: () => void; sections: string[] }) {
  const selected = reportTabs.find((tab) => tab.key === reportType) || reportTabs[0];
  function switchReportType(type: string) {
    setReportType(type);
    if (type !== "history" && filters.studentId) setFilters({ ...filters, studentId: "" });
  }
  const [studentSearch, setStudentSearch] = useState(filters.studentSearch || "");
  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return students.slice(0, 8);
    const q = studentSearch.toLowerCase();
    return students.filter((s) => displayStudent(s).toLowerCase().includes(q)).slice(0, 8);
  }, [studentSearch, students]);
  const selectedStudent = students.find((student) => String(student.id) === filters.studentId);
  useEffect(() => {
    if (reportType === "history") loadReport();
  }, [reportType, filters.studentId]);
  const pager = usePaged(report.rows);
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={() => window.print()}><Printer size={16} />Print</Button><Button onClick={() => downloadCsv("violation-report.csv", report.rows.map((row) => ({ Student: displayStudent(row.student), GradeLevel: row.student?.gradeLevel, Section: row.student?.section, Category: row.category, ViolationType: row.violationType, Date: row.incidentDate, Description: row.description, ActionTaken: row.actionTaken, Remarks: row.remarks, Status: row.status })))}><FileSpreadsheet size={16} />Export to Excel</Button></div>
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[390px_minmax(0,1fr)]">
        <label className="grid gap-2 lg:hidden">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-500">Report Type</span>
          <select className={inputClass()} value={reportType} onChange={(event) => switchReportType(event.target.value)}>
            {reportTabs.map((tab) => <option key={tab.key} value={tab.key}>{tab.title}</option>)}
          </select>
        </label>
        <div className="hidden gap-2 lg:sticky lg:top-[82px] lg:z-10 lg:grid lg:max-h-[calc(100vh-100px)] lg:content-start lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pr-1">{reportTabs.map((tab) => {
          const isActive = reportType === tab.key;
          return (
            <button key={tab.key} onClick={() => switchReportType(tab.key)} className={cn("min-w-[220px] rounded-xl border p-3 text-left shadow-sm transition lg:min-w-0 lg:p-4", isActive ? "border-primary bg-primary text-white" : "border-slate-200 bg-white text-slate-950 hover:border-primary/30 hover:bg-primary/5")}>
              <p className="font-black">{tab.title}</p>
              <p className={cn("text-sm", isActive ? "text-teal-50" : "text-slate-500")}>{tab.desc}</p>
            </button>
          );
        })}</div>
        <div className="min-w-0 space-y-4">
          <Card className="min-w-0 p-5">
            {reportType === "history" ? (
              <div className="space-y-2">
                <Field label="Student">
                  <div className="relative">
                    <input className={inputClass()} placeholder="Type student name or number..." value={filters.studentId && selectedStudent ? displayStudent(selectedStudent) : studentSearch} onChange={(e) => { setStudentSearch(e.target.value); if (filters.studentId) setFilters({ ...filters, studentId: "" }); }} />
                    {studentSearch && !filters.studentId ? (
                      <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                        {filteredStudents.map((student) => (
                          <button key={student.id} type="button" onClick={() => { setFilters({ ...filters, studentId: String(student.id) }); setStudentSearch(""); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-teal-50">
                            {student.lastName}, {student.firstName}{student.studentNumber ? ` (${student.studentNumber})` : ""}
                          </button>
                        ))}
                        {!filteredStudents.length ? <p className="px-3 py-2 text-sm text-slate-500">No matching student.</p> : null}
                      </div>
                    ) : null}
                    {filters.studentId && selectedStudent ? (
                      <button type="button" onClick={() => { setFilters({ ...filters, studentId: "" }); setStudentSearch(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600" title="Clear student selection">
                        <X size={18} />
                      </button>
                    ) : null}
                  </div>
                </Field>
              </div>
            ) : (
              <>
                <Field label="Student (name or number, optional)"><input className={inputClass()} placeholder="Filter by student..." value={filters.search || ""} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /></Field>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <Field label="From"><input type="date" className={inputClass()} value={filters.from || ""} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></Field>
                  <Field label="To"><input type="date" className={inputClass()} value={filters.to || ""} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></Field>
                  <Field label="Grade / Year Level"><select className={inputClass()} value={filters.gradeLevel || "All"} onChange={(e) => setFilters({ ...filters, gradeLevel: e.target.value })}><option>All</option>{GRADE_LEVELS.map((g) => <option key={g}>{g}</option>)}</select></Field>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <Field label="Section"><select className={inputClass()} value={filters.section || "All"} onChange={(e) => setFilters({ ...filters, section: e.target.value })}><option>All</option>{sections.map((s) => <option key={s}>{s}</option>)}</select></Field>
                  <Field label="Status"><select className={inputClass()} value={filters.status || "All"} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option>All</option>{VIOLATION_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
                </div>
              </>
            )}
            {reportType !== "history" ? <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-slate-500">{reportType === "major" ? "This report is limited to Major violations." : reportType === "minor" ? "This report is limited to Minor violations." : "Choose filters then apply."}</p><Button onClick={loadReport}>Apply Filters</Button></div> : null}
          </Card>
          {reportType === "history" && selectedStudent ? (
            <Card className="border-t-4 border-t-teal-700 p-5 print:border-t-8">
              <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500 print:text-black">Student Record</p>
              <div className="flex flex-wrap items-center justify-between gap-4 print:flex">
                <div>
                  <h2 className="text-2xl font-black print:text-black">{selectedStudent.firstName} {selectedStudent.lastName}</h2>
                  <p className="font-bold text-primary print:text-black">{selectedStudent.studentNumber || "No student number"}</p>
                  <p className="text-sm print:text-black">{selectedStudent.gradeLevel} · {selectedStudent.section}</p>
                </div>
                <div className="flex gap-3 print:gap-6">
                  <Card className="border-2 border-red-200 bg-red-50 p-4 text-center print:bg-red-100">
                    <p className="text-xs font-black text-red-700 print:text-black">MAJOR</p>
                    <p className="text-4xl font-black text-red-700 print:text-5xl print:text-black">{report.major}</p>
                  </Card>
                  <Card className="border-2 border-amber-200 bg-amber-50 p-4 text-center print:bg-amber-100">
                    <p className="text-xs font-black text-amber-700 print:text-black">MINOR</p>
                    <p className="text-4xl font-black text-amber-700 print:text-5xl print:text-black">{report.minor}</p>
                  </Card>
                </div>
              </div>
              <div className="mt-5 border-t border-slate-200 pt-4 print:border-slate-400">
                <h3 className="text-sm font-black uppercase tracking-wider print:text-black">Community Service Recommendation</h3>
                <ul className="mt-2 space-y-1 text-sm print:text-black">
                  <li>• {report.communityService.minorLabel}</li>
                  <li>• {report.communityService.majorLabel}</li>
                </ul>
                <p className="mt-3 font-black print:text-black">Minimum Total: {report.communityService.minimumTotal}</p>
              </div>
            </Card>
          ) : null}
          <Card className="min-w-0 p-5"><div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-xl font-black">{selected.title}</h2><p className="text-sm text-slate-500">{report.total} record(s) · {report.major} major · {report.minor} minor</p></div><p className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">Summary</p>{/* Mobile Card View */}<div className="md:hidden space-y-2">{report.summary.length ? report.summary.map((item) => <div key={item.name} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3"><p className="font-bold text-slate-950">{item.name}</p><p className="font-black text-primary">{item.value}</p></div>) : <p className="text-sm text-slate-500 text-center py-4">No summary data.</p>}</div>{/* Desktop Table View */}<div className="hidden md:block max-w-full overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[520px] text-left text-sm"><thead className="bg-slate-50 text-xs font-black uppercase tracking-wider text-slate-500"><tr><th className="p-3">{reportType === "grade" ? "Grade / Year Level" : reportType === "section" ? "Section" : reportType === "staff" ? "Staff / Reporter" : reportType === "date" ? "Month" : "Violation Type"}</th><th>Count</th></tr></thead><tbody className="divide-y divide-slate-100">{report.summary.map((item) => <tr key={item.name}><td className="p-3 font-bold">{item.name}</td><td className="font-black">{item.value}</td></tr>)}{!report.summary.length ? <tr><td colSpan={2} className="p-5 text-center text-slate-500">No summary data.</td></tr> : null}</tbody></table></div></Card>
          {reportType !== "history" ? <Card className="min-w-0 p-5"><p className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">Details ({report.rows.length})</p>{/* Mobile Card View */}<div className="md:hidden divide-y divide-slate-100">{pager.paged.map((row) => <div key={row.id} className="p-3"><p className="font-bold text-slate-950 mb-2">{studentName(row.student)}</p><div className="space-y-1 text-xs"><div><span className="text-slate-500">Section</span><p className="font-bold">{row.student?.section}</p></div><div><span className="text-slate-500">Category</span><p className="font-bold">{row.category}</p></div><div><span className="text-slate-500">Type</span><p className="font-bold">{row.violationType}</p></div><div><span className="text-slate-500">Date</span><p className="font-bold">{formatDate(row.incidentDate)}</p></div></div></div>)}{!report.rows.length ? <div className="p-5 text-center text-slate-500 text-sm">No report details found.</div> : null}</div>{/* Desktop Table View */}<div className="hidden md:block max-w-full overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs font-black uppercase tracking-wider text-slate-500"><tr><th className="p-3">Student</th><th>Section</th><th>Violation Category</th><th>Violation Type</th><th>Date of Incident</th></tr></thead><tbody className="divide-y divide-slate-100">{pager.paged.map((row) => <tr key={row.id}><td className="p-3 font-bold">{studentName(row.student)}</td><td>{row.student?.section}</td><td>{row.category}</td><td>{row.violationType}</td><td>{formatDate(row.incidentDate)}</td></tr>)}{!report.rows.length ? <tr><td colSpan={5} className="p-5 text-center text-slate-500">No report details found.</td></tr> : null}</tbody></table></div></Card> : null}
          {reportType !== "history" ? <PaginationBar pager={pager} /> : null}
        </div>
      </div>
    </div>
  );
}

function LogsPage({ logs, filters, setFilters, applyFilters, resetFilters }: { logs: LogEntry[]; filters: Record<string, string>; setFilters: (filters: Record<string, string>) => void; applyFilters: () => void; resetFilters: () => void }) {
  const modules = ["All modules", "Authentication", "Students", "Violations", "Reports", "Activity Logs", "User Management", "System Settings"];
  const pager = usePaged(logs);
  return (
    <div className="space-y-4"><header><h1 className="text-2xl font-black">Activity Logs</h1><p className="text-sm text-slate-500">Immutable audit trail of user actions in this system</p></header><Card className="p-5"><div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr]"><Field label="Search (user or description)"><input className={inputClass()} placeholder="e.g. admin or 'edited the violation'" value={filters.search || ""} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /></Field><Field label="Module"><select className={inputClass()} value={filters.module || "All modules"} onChange={(e) => setFilters({ ...filters, module: e.target.value })}>{modules.map((m) => <option key={m}>{m}</option>)}</select></Field><Field label="From"><input type="date" className={inputClass()} value={filters.from || ""} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></Field><Field label="To"><input type="date" className={inputClass()} value={filters.to || ""} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></Field></div><div className="mt-3 flex items-center justify-between"><div className="flex gap-2"><Button onClick={applyFilters}>Apply Filters</Button><Button variant="secondary" onClick={resetFilters}>Reset</Button></div><p className="text-sm text-slate-500">{logs.length} log entry(ies) — read-only</p></div></Card><Card className="overflow-hidden"><div className="md:hidden divide-y divide-slate-100">{pager.paged.map((log) => <div key={log.id} className="p-4 hover:bg-slate-50"><div className="flex items-start justify-between gap-2 mb-3"><div className="flex-1 min-w-0"><p className="font-bold text-slate-950">{log.username}</p><p className="text-xs text-slate-500">{formatDateTime(log.createdAt)}</p></div><Badge tone={log.role === "Super Admin" ? "red" : "blue"}>{log.role}</Badge></div><div className="space-y-2 mb-3 text-sm"><div><p className="text-xs text-slate-500">Module</p><p className="font-bold">{log.module}</p></div><div><p className="text-xs text-slate-500">Action</p><p className="font-mono text-xs font-bold">{log.action}</p></div><div><p className="text-xs text-slate-500">Description</p><p className="text-sm">{log.description}</p></div><div><p className="text-xs text-slate-500">IP Address</p><p className="text-xs">{log.ipAddress || "�"}</p></div></div></div>)}{!pager.paged.length ? <div className="p-8 text-center text-slate-500">No log entries.</div> : null}</div><div className="hidden md:block overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-slate-50 text-xs font-black uppercase tracking-wider text-slate-500"><tr><th className="p-3">Date / Time</th><th>User</th><th>Role</th><th>Module</th><th>Action</th><th>Description</th><th>IP Address</th></tr></thead><tbody className="divide-y divide-slate-100">{pager.paged.map((log) => <tr key={log.id} className="hover:bg-slate-50"><td className="p-3">{formatDateTime(log.createdAt)}</td><td className="font-bold">{log.username}</td><td><Badge tone={log.role === "Super Admin" ? "red" : "blue"}>{log.role}</Badge></td><td>{log.module}</td><td className="font-mono text-xs font-bold">{log.action}</td><td>{log.description}</td><td className="font-mono text-xs">{log.ipAddress || "—"}</td></tr>)}{!logs.length ? <tr><td colSpan={7} className="p-8 text-center text-slate-500">No activity logs found.</td></tr> : null}</tbody></table></div></Card><PaginationBar pager={pager} /></div>
  );
}

function UserFormModal({ user, isSelf = false, onClose, onSave }: { user?: ManagedUser | null; isSelf?: boolean; onClose: () => void; onSave: (payload: Partial<ManagedUser> & { password?: string }) => Promise<void> }) {
  const roleLocked = Boolean(isSelf && user?.role === "super_admin");
  const initialRole = user?.role || "staff";
  const [form, setForm] = useState({ fullName: user?.fullName || "", username: user?.username || "", email: user?.email || "", password: "", role: initialRole, permissions: normalizePermissions(user?.permissions || (initialRole === "faculty" ? FACULTY_PERMISSIONS : DEFAULT_STAFF_PERMISSIONS), initialRole === "faculty" ? "faculty" : "staff") });
  const [loading, setLoading] = useState(false);
  function setPermission(module: PermissionModule, action: PermissionAction, checked: boolean) {
    setForm({ ...form, permissions: { ...form.permissions, [module]: { ...(form.permissions[module] || {}), [action]: checked } } });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      await onSave({ ...form, role: form.role as Role, permissions: form.role === "super_admin" ? SUPER_ADMIN_PERMISSIONS : form.permissions });
      onClose();
    } catch {
      // error toast is shown by the parent handler
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal title={user ? "Edit Account" : "Create Account"} subtitle="Staff accounts are created with configurable permissions" onClose={onClose} maxWidth="max-w-3xl" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="user-form" disabled={loading}>{user ? "Save Account" : "Create Account"}</Button></>}>
      <form id="user-form" onSubmit={submit} className="grid gap-4"><div className="grid gap-4 md:grid-cols-2"><Field label="Full Name"><input className={inputClass()} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field><Field label="Username"><input className={inputClass()} placeholder="lowercase, e.g. j.dela.cruz" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field><Field label="Email"><input className={inputClass()} type="email" placeholder="name@school.edu" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field><Field label={!user ? "Password" : isSelf ? "New Password (leave blank to keep current)" : "Password (managed via Reset Password)"}><input className={inputClass()} type="password" placeholder="Minimum 8 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} disabled={Boolean(user) && !isSelf} /></Field><Field label="Role"><select className={inputClass()} value={roleLocked ? "super_admin" : form.role} disabled={roleLocked} onChange={(e) => { const role = e.target.value as Role; setForm({ ...form, role, permissions: role === "faculty" ? FACULTY_PERMISSIONS : role === "staff" ? DEFAULT_STAFF_PERMISSIONS : SUPER_ADMIN_PERMISSIONS }); }}><option value="staff">Staff</option><option value="faculty">Faculty</option><option value="super_admin">Super Admin</option></select>{roleLocked ? <span className="mt-1 block text-xs text-slate-500">The Super Admin role is locked and cannot be changed.</span> : null}</Field></div><div><p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-500">Permissions</p><div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-xs font-black uppercase tracking-wider text-slate-500"><tr><th className="p-3">Module</th>{PERMISSION_LABELS.map((action) => <th key={action.key}>{action.label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{PERMISSION_MODULES.map((module) => <tr key={module.key}><td className="p-3 font-bold">{module.label}</td>{PERMISSION_LABELS.map((action) => { const facultyRestricted = form.role === "faculty" && module.key === "logs"; const disabled = form.role === "super_admin" || facultyRestricted || ((module.key === "reports" || module.key === "logs") && !["view", "export"].includes(action.key)) || (module.key === "logs" && action.key === "export"); return <td key={action.key}>{disabled && form.role !== "super_admin" ? <span className="text-slate-300">—</span> : <input type="checkbox" checked={form.role === "super_admin" ? true : Boolean(form.permissions[module.key]?.[action.key])} disabled={disabled} onChange={(e) => setPermission(module.key, action.key, e.target.checked)} />}</td>; })}</tr>)}</tbody></table></div><p className="mt-2 text-xs text-slate-500">Faculty defaults to View and Export. The administrator may grant additional permissions, but Activity Logs remain unavailable.</p></div></form>
    </Modal>
  );
}

function UsersPage({ users, currentUser, onCreate, onEdit, onResetPassword, onToggle, onDelete }: { users: ManagedUser[]; currentUser: CurrentUser; onCreate: () => void; onEdit: (user: ManagedUser) => void; onResetPassword: (user: ManagedUser) => void; onToggle: (user: ManagedUser) => void; onDelete: (user: ManagedUser) => void }) {
  const pager = usePaged(users);
  return (
    <div className="space-y-4"><div className="flex items-start justify-between gap-3"><div><h1 className="text-2xl font-black">User Management</h1><p className="text-sm text-slate-500">Create and manage Super Admin and Staff accounts</p></div><Button onClick={onCreate}><Plus size={16} />Create Account</Button></div><Card className="overflow-hidden"><div className="md:hidden divide-y divide-slate-100">{pager.paged.map((user) => <div key={user.id} className="p-4 hover:bg-slate-50"><div className="flex items-start justify-between gap-2 mb-3"><div className="flex-1 min-w-0"><p className="font-bold text-slate-950">{user.fullName}{user.id === currentUser.id ? <span className="ml-2 text-xs font-bold text-primary">(you)</span> : null}</p><p className="text-xs text-slate-500">@{user.username}</p></div><Badge tone={user.isActive ? "green" : "slate"}>{user.isActive ? "Active" : "Inactive"}</Badge></div><div className="space-y-2 mb-3 text-sm"><div><p className="text-xs text-slate-500">Email</p><p className="text-sm">{user.email}</p></div><div><p className="text-xs text-slate-500">Role</p><p><Badge tone={user.role === "super_admin" ? "red" : "blue"}>{roleLabel(user.role)}</Badge></p></div></div><div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100"><Button variant="soft" onClick={() => onEdit(user)}>Edit</Button><Button variant="secondary" onClick={() => onResetPassword(user)}>Reset Password</Button>{user.id !== currentUser.id ? <Button variant="secondary" onClick={() => onToggle(user)}>{user.isActive ? "Deactivate" : "Activate"}</Button> : null}{user.id !== currentUser.id ? <Button variant="danger" onClick={() => onDelete(user)}>Delete</Button> : null}</div></div>)}{!pager.paged.length ? <div className="p-8 text-center text-slate-500">No users found.</div> : null}</div><div className="hidden md:block overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-xs font-black uppercase tracking-wider text-slate-500"><tr><th className="p-3">User</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{pager.paged.map((user) => <tr key={user.id} className="hover:bg-slate-50"><td className="p-3"><b>{user.fullName}</b>{user.id === currentUser.id ? <span className="ml-2 text-xs font-bold text-primary">(you)</span> : null}<p className="text-xs text-slate-500">@{user.username}</p></td><td>{user.email}</td><td><Badge tone={user.role === "super_admin" ? "red" : "blue"}>{roleLabel(user.role)}</Badge></td><td><Badge tone={user.isActive ? "green" : "slate"}>{user.isActive ? "Active" : "Inactive"}</Badge></td><td><div className="flex flex-wrap gap-2"><Button variant="soft" onClick={() => onEdit(user)}>Edit</Button><Button variant="secondary" onClick={() => onResetPassword(user)}>Reset Password</Button>{user.id !== currentUser.id ? <Button variant="secondary" onClick={() => onToggle(user)}>{user.isActive ? "Deactivate" : "Activate"}</Button> : null}{user.id !== currentUser.id ? <Button variant="danger" onClick={() => onDelete(user)}>Delete</Button> : null}</div></td></tr>)}{!users.length ? <tr><td colSpan={5} className="p-8 text-center text-slate-500">No users found.</td></tr> : null}</tbody></table></div></Card><PaginationBar pager={pager} /></div>
  );
}

function SettingsPage({ settings, setSettings, onSave, onReset }: { settings: SettingsRecord; setSettings: (settings: SettingsRecord) => void; onSave: () => Promise<void>; onReset: () => Promise<void> }) {
  const [tab, setTab] = useState("Branding");
  const [loading, setLoading] = useState(false);
  function fileToDataUrl(field: keyof SettingsRecord, file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setSettings({ ...settings, [field]: reader.result as string });
    reader.readAsDataURL(file);
  }
  async function save() {
    setLoading(true);
    try { await onSave(); } finally { setLoading(false); }
  }
  const uploadRows: { label: string; desc: string; field: keyof SettingsRecord }[] = [
    { label: "System Logo", desc: "Shown in the sidebar, header and login page. Square works best.", field: "logoDataUrl" },
    { label: "Favicon", desc: "Small square icon for the browser tab.", field: "faviconDataUrl" },
    { label: "Login Page Image", desc: "Background of the login branding panel.", field: "loginImageDataUrl" },
    { label: "Dashboard Image", desc: "Banner shown at the top of the dashboard.", field: "dashboardImageDataUrl" },
  ];
  return (
    <div className="space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-black">System Settings</h1><p className="text-sm text-slate-500">Customize branding, appearance and typography — changes apply to all users</p></div><div className="flex gap-2"><Button variant="secondary" onClick={onReset}>Reset to Default Theme</Button><Button onClick={save} disabled={loading}>Save All Changes</Button></div></div><div className="flex gap-2">{["Branding", "Colors", "Typography", "Layout"].map((item) => <button key={item} onClick={() => setTab(item)} className={cn("rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold", tab === item ? "bg-teal-700 text-white" : "bg-white")}>{item}</button>)}</div><div className="grid gap-5 xl:grid-cols-[1fr_520px]"><Card className="p-5">{tab === "Branding" ? <div className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><Field label="School / Organization Name"><input className={inputClass()} value={settings.schoolName} onChange={(e) => setSettings({ ...settings, schoolName: e.target.value })} /></Field><Field label="Footer Notice"><input className={inputClass()} value={settings.footerNotice} onChange={(e) => setSettings({ ...settings, footerNotice: e.target.value })} /></Field></div>{uploadRows.map((row) => <div key={row.field} className="flex items-center justify-between border-t border-slate-200 py-4"><div className="flex items-center gap-4"><div className="grid h-14 w-14 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-xs font-black text-slate-500">{settings[row.field] ? <img src={String(settings[row.field])} alt="Preview" className="h-full w-full object-contain" /> : "EMPTY"}</div><div><p className="font-black">{row.label}</p><p className="text-sm text-slate-500">{row.desc}</p></div></div><label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold hover:bg-slate-50"><Upload size={16} />Upload<input className="hidden" type="file" accept="image/*" onChange={(e) => fileToDataUrl(row.field, e.target.files?.[0])} /></label></div>)}</div> : null}{tab === "Colors" ? <div className="grid gap-4 md:grid-cols-3"><Field label="Primary Color"><input className={inputClass("h-12 p-1")} type="color" value={settings.primaryColor} onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })} /></Field><Field label="Accent Color"><input className={inputClass("h-12 p-1")} type="color" value={settings.accentColor} onChange={(e) => setSettings({ ...settings, accentColor: e.target.value })} /></Field><Field label="Sidebar Color"><input className={inputClass("h-12 p-1")} type="color" value={settings.sidebarColor} onChange={(e) => setSettings({ ...settings, sidebarColor: e.target.value })} /></Field></div> : null}{tab === "Typography" ? <div className="grid gap-4 md:grid-cols-2"><Field label="Font Family"><select className={inputClass()} value={settings.fontFamily} onChange={(e) => setSettings({ ...settings, fontFamily: e.target.value })}><option>Inter</option><option>Poppins</option><option>Arial</option><option>Verdana</option></select></Field><Field label="App Subtitle"><input className={inputClass()} value={settings.appSubtitle} onChange={(e) => setSettings({ ...settings, appSubtitle: e.target.value })} /></Field></div> : null}{tab === "Layout" ? <div className="grid gap-4 md:grid-cols-2"><Field label="Session Timeout (hours)"><input className={inputClass()} type="number" min={1} max={24} value={settings.sessionHours} onChange={(e) => setSettings({ ...settings, sessionHours: Number(e.target.value) })} /></Field></div> : null}</Card><div><p className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">Live Preview</p><Card className="p-3"><div className="rounded-lg border border-slate-200 bg-slate-100 p-3"><div className="mb-2 flex items-center justify-between"><div className="h-5 w-5 rounded" style={{ backgroundColor: settings.accentColor }} /><div className="h-2 w-24 rounded bg-slate-300" /><div className="h-5 w-5 rounded-full bg-amber-400" /></div><div className="grid grid-cols-[70px_1fr] gap-3"><div className="rounded bg-slate-900 p-2"><div className="mb-2 h-6 rounded" style={{ backgroundColor: settings.accentColor }} />{[1, 2, 3, 4].map((i) => <div key={i} className="mb-2 h-4 rounded bg-slate-700" />)}</div><div><h3 className="font-black">{settings.schoolName}</h3><p className="mt-2 text-sm text-slate-500">Student records and violation tracking at a glance.</p><div className="mt-3 flex gap-2"><Badge tone="blue">Major: 12</Badge><Badge tone="amber">Minor: 34</Badge><Badge tone="blue">Resolved</Badge></div><div className="mt-3 rounded-lg bg-white p-3 shadow"><div className="h-2 w-4/5 rounded bg-slate-200" /><div className="mt-2 h-2 w-3/5 rounded bg-slate-200" /><button className="mt-3 rounded px-2 py-1 text-xs font-bold text-white" style={{ backgroundColor: settings.primaryColor }}>Add</button></div></div></div></div><p className="mt-3 text-xs text-slate-500">Preview reflects unsaved values. Click <b>Save All Changes</b> to apply system-wide.</p></Card></div></div></div>
  );
}

function SettingsPageDraft({ settings, onSave, onReset }: { settings: SettingsRecord; onSave: (settings: SettingsRecord) => Promise<void>; onReset: () => Promise<SettingsRecord | null> }) {
  const [tab, setTab] = useState("Branding");
  const [draft, setDraft] = useState<SettingsRecord>(settings);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  function fileToDataUrl(field: keyof SettingsRecord, file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const source = new Image();
      source.onload = () => {
        const isFavicon = field === "faviconDataUrl";
        const isLogo = field === "logoDataUrl";
        const outputType = isFavicon ? "image/png" : isLogo ? "image/webp" : "image/jpeg";
        const maxBytes = 58000;
        let maxDimension = isFavicon ? 256 : isLogo ? 1000 : 1800;
        let quality = isLogo ? 0.92 : 0.8;
        let dataUrl = "";
        while (maxDimension > 0) {
          const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(source.width * scale));
          canvas.height = Math.max(1, Math.round(source.height * scale));
          const context = canvas.getContext("2d");
          if (!context) return;
          context.drawImage(source, 0, 0, canvas.width, canvas.height);
          dataUrl = canvas.toDataURL(outputType, quality);
          if (dataUrl.length <= maxBytes || maxDimension <= 320) break;
          maxDimension = Math.floor(maxDimension * 0.75);
          quality = Math.max(0.55, quality - 0.05);
        }
        if (!dataUrl || dataUrl.length > maxBytes) return;
        setDraft((current) => ({ ...current, [field]: dataUrl }));
      };
      source.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function save() {
    setLoading(true);
    try {
      await onSave(draft);
    } finally {
      setLoading(false);
    }
  }

  async function reset() {
    const updated = await onReset();
    if (updated) setDraft({ ...DEFAULT_SETTINGS, ...updated });
  }

  const uploadRows: { label: string; desc: string; field: keyof SettingsRecord }[] = [
    { label: "System Logo", desc: "Shown in the sidebar, header and login page. Square works best.", field: "logoDataUrl" },
    { label: "Favicon", desc: "Small square icon for the browser tab.", field: "faviconDataUrl" },
    { label: "Login Page Image", desc: "Background of the login branding panel.", field: "loginImageDataUrl" },
    { label: "Dashboard Image", desc: "Banner shown at the top of the dashboard.", field: "dashboardImageDataUrl" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">System Settings</h1>
          <p className="text-sm text-slate-500">Customize branding, appearance and typography — changes apply only after saving</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={reset}>Reset to Default Theme</Button>
          <Button onClick={save} disabled={loading}>Save All Changes</Button>
        </div>
      </div>
      <div className="flex gap-2">
        {["Branding", "Colors", "Typography", "Layout"].map((item) => (
          <button key={item} onClick={() => setTab(item)} className={cn("rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold", tab === item ? "bg-primary text-white" : "bg-white")}>{item}</button>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_520px]">
        <Card className="p-5">
          {tab === "Branding" ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="School / Organization Name"><input className={inputClass()} value={draft.schoolName} onChange={(e) => setDraft({ ...draft, schoolName: e.target.value })} /></Field>
                <Field label="Footer Notice"><input className={inputClass()} value={draft.footerNotice} onChange={(e) => setDraft({ ...draft, footerNotice: e.target.value })} /></Field>
                <Field label="Login Page Title" className="md:col-span-2"><input className={inputClass()} placeholder="e.g. Vchecker" value={draft.loginTitle} onChange={(e) => setDraft({ ...draft, loginTitle: e.target.value })} /><span className="text-xs text-slate-500">Large title shown on the login branding panel.</span></Field>
              </div>
              {uploadRows.map((row) => (
                <div key={row.field} className="flex items-center justify-between border-t border-slate-200 py-4">
                  <div className="flex items-center gap-4">
                    <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-xs font-black text-slate-500">{draft[row.field] ? <img src={String(draft[row.field])} alt="Preview" className="h-full w-full object-contain" /> : "EMPTY"}</div>
                    <div><p className="font-black">{row.label}</p><p className="text-sm text-slate-500">{row.desc}</p></div>
                  </div>
                  <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold hover:bg-slate-50">
                    <Upload size={16} />Upload<input className="hidden" type="file" accept="image/*" onChange={(e) => fileToDataUrl(row.field, e.target.files?.[0])} />
                  </label>
                </div>
              ))}
            </div>
          ) : null}
          {tab === "Colors" ? (
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Primary Color"><input className={inputClass("h-12 p-1")} type="color" value={draft.primaryColor} onChange={(e) => setDraft({ ...draft, primaryColor: e.target.value })} /></Field>
              <Field label="Accent Color"><input className={inputClass("h-12 p-1")} type="color" value={draft.accentColor} onChange={(e) => setDraft({ ...draft, accentColor: e.target.value })} /></Field>
              <Field label="Sidebar Color"><input className={inputClass("h-12 p-1")} type="color" value={draft.sidebarColor} onChange={(e) => setDraft({ ...draft, sidebarColor: e.target.value })} /></Field>
            </div>
          ) : null}
          {tab === "Typography" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Font Family"><select className={inputClass()} value={draft.fontFamily} onChange={(e) => setDraft({ ...draft, fontFamily: e.target.value })}><option>Inter</option><option>Poppins</option><option>Arial</option><option>Verdana</option></select></Field>
              <Field label="App Subtitle"><input className={inputClass()} value={draft.appSubtitle} onChange={(e) => setDraft({ ...draft, appSubtitle: e.target.value })} /></Field>
            </div>
          ) : null}
          {tab === "Layout" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Session Timeout (hours)"><input className={inputClass()} type="number" min={1} max={24} value={draft.sessionHours} onChange={(e) => setDraft({ ...draft, sessionHours: Number(e.target.value) })} /></Field>
            </div>
          ) : null}
        </Card>
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">Live Preview</p>
          <Card className="p-3" style={{ fontFamily: fontStack(draft.fontFamily) }}>
            <div className="rounded-lg border border-slate-200 bg-slate-100 p-3">
              <div className="mb-2 flex items-center justify-between"><div className="h-5 w-5 rounded" style={{ backgroundColor: draft.accentColor }} /><div className="h-2 w-24 rounded bg-slate-300" /><div className="h-5 w-5 rounded-full bg-amber-400" /></div>
              <div className="grid grid-cols-[70px_1fr] gap-3"><div className="rounded bg-slate-900 p-2"><div className="mb-2 h-6 rounded" style={{ backgroundColor: draft.accentColor }} />{[1, 2, 3, 4].map((i) => <div key={i} className="mb-2 h-4 rounded bg-slate-700" />)}</div><div><h3 className="font-black">{draft.schoolName}</h3><p className="mt-2 text-sm text-slate-500">Student records and violation tracking at a glance.</p><div className="mt-3 flex gap-2"><Badge tone="blue">Major: 12</Badge><Badge tone="amber">Minor: 34</Badge><Badge tone="blue">Resolved</Badge></div><div className="mt-3 rounded-lg bg-white p-3 shadow"><div className="h-2 w-4/5 rounded bg-slate-200" /><div className="mt-2 h-2 w-3/5 rounded bg-slate-200" /><button className="mt-3 rounded px-2 py-1 text-xs font-bold text-white" style={{ backgroundColor: draft.primaryColor }}>Add</button></div></div></div>
            </div>
            <p className="mt-3 text-xs text-slate-500">Unsaved edits are shown here only. Click <b>Save All Changes</b> to apply system-wide.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function ViolationRecordsApp() {
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [settings, setSettings] = useState<SettingsRecord>({ ...DEFAULT_SETTINGS });
  const [active, setActive] = useState<PageKey>("dashboard");
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [students, setStudents] = useState<Student[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [report, setReport] = useState<ReportData>({ rows: [], summary: [], total: 0, major: 0, minor: 0, communityService: { minorLabel: "None", majorLabel: "None", minimumTotal: "0 hours" } });
  const [reportType, setReportType] = useState("major");
  const [studentFilters, setStudentFilters] = useState<Record<string, string>>({ status: "All", section: "All", gradeLevel: "All" });
  const [violationFilters, setViolationFilters] = useState<Record<string, string>>({ category: "All", violationType: "All types", gradeLevel: "All", section: "All", status: "All" });
  const [logFilters, setLogFilters] = useState<Record<string, string>>({ module: "All modules" });
  const [reportFilters, setReportFilters] = useState<Record<string, string>>({ gradeLevel: "All", section: "All", status: "All" });
  const [modal, setModal] = useState<{ type: string; payload?: unknown } | null>(null);
  const [headerQuery, setHeaderQuery] = useState("");
  const [headerSuggestions, setHeaderSuggestions] = useState<Student[]>([]);
  const [headerFocus, setHeaderFocus] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function resetWorkspaceState() {
    setActive("dashboard");
    setDashboard(emptyDashboard);
    setStudents([]);
    setAllStudents([]);
    setViolations([]);
    setLogs([]);
    setManagedUsers([]);
    setReport({ rows: [], summary: [], total: 0, major: 0, minor: 0, communityService: { minorLabel: "None", majorLabel: "None", minimumTotal: "0 hours" } });
    setStudentFilters({ status: "All", section: "All", gradeLevel: "All" });
    setViolationFilters({ category: "All", violationType: "All types", gradeLevel: "All", section: "All", status: "All" });
    setLogFilters({ module: "All modules" });
    setReportFilters({ gradeLevel: "All", section: "All", status: "All" });
    setModal(null);
    setHeaderQuery("");
    setHeaderSuggestions([]);
    setHeaderFocus(false);
    setSidebarOpen(false);
  }

  async function loadBootstrap() {
    setLoading(true);
    try {
      const data = await apiFetch<{ needsSetup: boolean; currentUser: CurrentUser | null; settings: SettingsRecord }>("/api/bootstrap");
      setNeedsSetup(data.needsSetup);
      setCurrentUser(data.currentUser);
      setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      if (data.currentUser) await loadCore(data.currentUser);
    } catch (error) {
      void swalError(error);
    } finally {
      setLoading(false);
    }
  }

  async function loadCore(user = currentUser) {
    if (!user) return;
    const [dash, studentRows, allStudentRows, violationRows] = await Promise.all([
      apiFetch<DashboardData>("/api/dashboard"),
      apiFetch<Student[]>(`/api/students${toQuery(studentFilters)}`),
      apiFetch<Student[]>("/api/students"),
      apiFetch<Violation[]>(`/api/violations${toQuery(violationFilters)}`),
    ]);
    setDashboard(dash);
    setStudents(studentRows);
    setAllStudents(allStudentRows);
    setViolations(violationRows);
    if (hasPermission(user, "logs", "view")) setLogs(await apiFetch<LogEntry[]>(`/api/logs${toQuery(logFilters)}`));
    if (user.role === "super_admin") setManagedUsers(await apiFetch<ManagedUser[]>("/api/users"));
    await loadReport(false);
  }

  async function loadStudents() {
    setStudents(await apiFetch<Student[]>(`/api/students${toQuery(studentFilters)}`));
  }

  async function loadAllStudents() {
    setAllStudents(await apiFetch<Student[]>("/api/students"));
  }

  async function loadViolations() {
    setViolations(await apiFetch<Violation[]>(`/api/violations${toQuery(violationFilters)}`));
  }

  async function loadLogs() {
    setLogs(await apiFetch<LogEntry[]>(`/api/logs${toQuery(logFilters)}`));
  }

  async function loadUsers() {
    setManagedUsers(await apiFetch<ManagedUser[]>("/api/users"));
  }

  async function loadReport(showErrors = true) {
    try {
      const type = reportType;
      const { studentId: _historyStudentId, ...nonHistoryFilters } = reportFilters;
      const filters = type === "history" ? reportFilters : nonHistoryFilters;
      const data = await apiFetch<ReportData>(`/api/reports${toQuery({ type, ...filters })}`);
      setReport(data);
    } catch (error) {
      if (showErrors) void swalError(error);
    }
  }

  useEffect(() => {
    void loadBootstrap();
  }, []);

  useEffect(() => {
    if (currentUser && reportType !== "history") void loadReport(false);
  }, [reportType]);

  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    if (settings.faviconDataUrl) {
      link.type = "image/png";
      link.href = settings.faviconDataUrl;
    }
  }, [settings.faviconDataUrl]);

  useEffect(() => {
    if (!headerQuery.trim() || !currentUser) {
      setHeaderSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      apiFetch<Student[]>(`/api/search/students?q=${encodeURIComponent(headerQuery)}`)
        .then(setHeaderSuggestions)
        .catch(() => setHeaderSuggestions([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [headerQuery, currentUser]);

  async function refreshAfterMutation() {
    await Promise.all([apiFetch<DashboardData>("/api/dashboard").then(setDashboard), loadStudents(), loadAllStudents(), loadViolations()]);
    if (currentUser?.role === "super_admin") await loadUsers();
    if (currentUser && hasPermission(currentUser, "logs", "view")) await loadLogs();
    await loadReport(false);
  }

  async function saveStudent(payload: Partial<Student>) {
    try {
      const editing = modal?.type === "editStudent" ? (modal.payload as Student) : null;
      await apiFetch(editing ? `/api/students/${editing.id}` : "/api/students", { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) });
      void swalSuccess(editing ? "Student updated successfully." : "Student added successfully.");
      await refreshAfterMutation();
    } catch (error) {
      void swalError(error);
      throw error;
    }
  }

  async function viewStudent(student: Student) {
    try {
      const full = await apiFetch<Student>(`/api/students/${student.id}`);
      setModal({ type: "viewStudent", payload: full });
      if (currentUser && hasPermission(currentUser, "logs", "view")) await loadLogs();
    } catch (error) {
      void swalError(error);
    }
  }

  async function deleteStudentRecord(student: Student) {
    if (!(await swalConfirm("Delete student?", `This will delete ${student.firstName} ${student.lastName} and linked violations.`))) return;
    try {
      await apiFetch(`/api/students/${student.id}`, { method: "DELETE" });
      void swalSuccess("Student deleted successfully.");
      await refreshAfterMutation();
    } catch (error) {
      void swalError(error);
    }
  }

  async function resetStudentViolations(student: Student) {
    if (!(await swalConfirm("Reset all violations?", `This will permanently delete all violation records for ${student.firstName} ${student.lastName}. This cannot be undone.`))) return;
    try {
      const result = await apiFetch<{ deletedCount: number }>(`/api/students/${student.id}`, { method: "POST" });
      void swalSuccess(`${result.deletedCount} violation record(s) reset successfully.`);
      await refreshAfterMutation();
      await viewStudent(student);
    } catch (error) {
      void swalError(error);
    }
  }

  async function importStudentsFile(file: File) {
    try {
      const text = await file.text();
      const rows = parseStudentsCsv(text);
      await apiFetch("/api/students", { method: "POST", body: JSON.stringify({ students: rows }) });
      void swalSuccess("Students imported successfully.");
      await refreshAfterMutation();
    } catch (error) {
      void swalError(error);
      throw error;
    }
  }

  async function saveViolation(payload: Partial<Violation>) {
    try {
      const editing = modal?.type === "editViolation" ? (modal.payload as Violation) : null;
      await apiFetch(editing ? `/api/violations/${editing.id}` : "/api/violations", { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) });
      void swalSuccess(editing ? "Violation updated successfully." : "Violation recorded successfully.");
      await refreshAfterMutation();
    } catch (error) {
      void swalError(error);
      throw error;
    }
  }

  async function viewViolation(violation: Violation) {
    try {
      const full = await apiFetch<Violation>(`/api/violations/${violation.id}`);
      setModal({ type: "viewViolation", payload: full });
    } catch (error) {
      void swalError(error);
    }
  }

  async function deleteViolationRecord(violation: Violation) {
    if (!(await swalConfirm("Delete violation?", `Delete record #${violation.id} (${violation.violationType})?`))) return;
    try {
      await apiFetch(`/api/violations/${violation.id}`, { method: "DELETE" });
      void swalSuccess("Violation deleted successfully.");
      await refreshAfterMutation();
    } catch (error) {
      void swalError(error);
    }
  }

  async function resetAllViolations() {
    if (!(await swalConfirm("Reset all violations?", "This will permanently delete every violation record for every student. This cannot be undone."))) return;
    try {
      const result = await apiFetch<{ deletedCount: number }>("/api/violations/reset-all", { method: "POST" });
      void swalSuccess(`${result.deletedCount} violation record(s) reset successfully.`);
      await refreshAfterMutation();
    } catch (error) {
      void swalError(error);
    }
  }

  async function saveUser(payload: Partial<ManagedUser> & { password?: string }) {
    try {
      const editing = modal?.type === "editUser" ? (modal.payload as ManagedUser) : null;
      await apiFetch(editing ? `/api/users/${editing.id}` : "/api/users", { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) });
      void swalSuccess(editing ? "Account updated successfully." : "Account created successfully.");
      await loadUsers();
      if (currentUser && hasPermission(currentUser, "logs", "view")) await loadLogs();
    } catch (error) {
      void swalError(error);
      throw error;
    }
  }

  async function resetPassword(user: ManagedUser) {
    const result = await Swal.fire({ title: "Reset Password", input: "password", inputLabel: `New password for ${user.username}`, inputPlaceholder: "Minimum 8 characters", showCancelButton: true, confirmButtonColor: "#0f8b74" });
    if (!result.isConfirmed) return;
    try {
      await apiFetch(`/api/users/${user.id}`, { method: "PUT", body: JSON.stringify({ action: "reset_password", password: result.value }) });
      void swalSuccess("Password reset successfully.");
      await loadUsers();
    } catch (error) {
      void swalError(error);
    }
  }

  async function toggleUser(user: ManagedUser) {
    if (!(await swalConfirm(user.isActive ? "Deactivate account?" : "Activate account?", `${user.username} will be ${user.isActive ? "deactivated" : "activated"}.`))) return;
    try {
      await apiFetch(`/api/users/${user.id}`, { method: "PUT", body: JSON.stringify({ action: "toggle_status" }) });
      void swalSuccess("Account status updated.");
      await loadUsers();
    } catch (error) {
      void swalError(error);
    }
  }

  async function deleteUser(user: ManagedUser) {
    if (!(await swalConfirm("Delete account?", `Delete ${user.username}? This cannot be undone.`))) return;
    try {
      await apiFetch(`/api/users/${user.id}`, { method: "DELETE" });
      void swalSuccess("Account deleted successfully.");
      await loadUsers();
    } catch (error) {
      void swalError(error);
    }
  }

  async function saveSettings(nextSettings: SettingsRecord) {
    try {
      const updated = await apiFetch<SettingsRecord>("/api/settings", { method: "PUT", body: JSON.stringify(nextSettings) });
      setSettings({ ...DEFAULT_SETTINGS, ...updated });
      void swalSuccess("System settings saved successfully.");
      if (currentUser && hasPermission(currentUser, "logs", "view")) await loadLogs();
    } catch (error) {
      void swalError(error);
      throw error;
    }
  }

  async function resetSettings(): Promise<SettingsRecord | null> {
    if (!(await swalConfirm("Reset theme?", "This will restore default colors, branding text, and remove uploaded images."))) return null;
    try {
      const updated = await apiFetch<SettingsRecord>("/api/settings", { method: "PUT", body: JSON.stringify({ reset: true }) });
      setSettings({ ...DEFAULT_SETTINGS, ...updated });
      void swalSuccess("Default theme restored.");
      return updated;
    } catch (error) {
      void swalError(error);
      return null;
    }
  }

  async function logout() {
    if (!(await swalConfirm("Sign out?", "Your current secure session will be ended."))) return;
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      resetWorkspaceState();
      setCurrentUser(null);
      await loadBootstrap();
    } catch (error) {
      void swalError(error);
    }
  }

  if (loading) return <LoadingScreen settings={settings} />;
  if (!currentUser) return <LoginPage settings={settings} needsSetup={needsSetup} onDone={async () => { resetWorkspaceState(); await loadBootstrap(); }} />;

  const visibleNav = navItems.filter((item) => !item.superOnly || currentUser.role === "super_admin").filter((item) => {
    if (item.key === "logs") return hasPermission(currentUser, "logs", "view");
    return true;
  });

  const uniqueSections = Array.from(new Set(allStudents.map((student) => student.section).filter(Boolean))).sort();

  const renderPage = () => {
    if (active === "dashboard") return <DashboardPage dashboard={dashboard} setActive={setActive} />;
    if (active === "students") return <StudentsPage students={students} filters={studentFilters} setFilters={setStudentFilters} applyFilters={() => void loadStudents()} resetFilters={() => { setStudentFilters({ status: "All", section: "All", gradeLevel: "All" }); setTimeout(() => void loadStudents(), 0); }} onAdd={() => setModal({ type: "addStudent" })} onEdit={(student) => setModal({ type: "editStudent", payload: student })} onView={viewStudent} onDelete={deleteStudentRecord} onImport={() => setModal({ type: "importStudents" })} currentUser={currentUser} sections={uniqueSections} />;
    if (active === "violations") return <ViolationsPage violations={violations} students={students} filters={violationFilters} setFilters={setViolationFilters} applyFilters={() => void loadViolations()} resetFilters={() => { setViolationFilters({ category: "All", violationType: "All types", gradeLevel: "All", section: "All", status: "All" }); setTimeout(() => void loadViolations(), 0); }} onRecord={() => setModal({ type: "addViolation" })} onEdit={(violation) => setModal({ type: "editViolation", payload: violation })} onView={viewViolation} onDelete={deleteViolationRecord} onResetAll={resetAllViolations} currentUser={currentUser} sections={uniqueSections} />;
    if (active === "reports") return <ReportsPage students={allStudents} reportType={reportType} setReportType={setReportType} filters={reportFilters} setFilters={setReportFilters} report={report} loadReport={() => void loadReport()} sections={uniqueSections} />;
    if (active === "logs") return <LogsPage logs={logs} filters={logFilters} setFilters={setLogFilters} applyFilters={() => void loadLogs()} resetFilters={() => { setLogFilters({ module: "All modules" }); setTimeout(() => void loadLogs(), 0); }} />;
    if (active === "users") return <UsersPage users={managedUsers} currentUser={currentUser} onCreate={() => setModal({ type: "addUser" })} onEdit={(user) => setModal({ type: "editUser", payload: user })} onResetPassword={resetPassword} onToggle={toggleUser} onDelete={deleteUser} />;
    if (active === "settings") return <SettingsPageDraft settings={settings} onSave={saveSettings} onReset={resetSettings} />;
    return null;
  };

  return (
    <div className="min-h-screen overflow-x-clip bg-slate-100 text-slate-950" style={{ fontFamily: fontStack(settings.fontFamily), ['--primary-color' as string]: settings.primaryColor, ['--primary-color-dark' as string]: adjustColor(settings.primaryColor, -20), ['--accent-color' as string]: settings.accentColor, ['--sidebar-color' as string]: settings.sidebarColor } as React.CSSProperties}>
      {sidebarOpen ? <div className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden" onClick={() => setSidebarOpen(false)} /> : null}
      <aside className={cn("fixed inset-y-0 left-0 z-40 flex w-60 flex-col text-white shadow-xl transition-transform duration-200 lg:translate-x-0", sidebarOpen ? "translate-x-0" : "-translate-x-full")} style={{ backgroundColor: settings.sidebarColor }}>
        <div className="flex h-[72px] items-center gap-3 border-b border-white/10 px-5">
          {settings.logoDataUrl ? <img src={settings.logoDataUrl} alt="Logo" className="max-h-10 max-w-24 rounded-lg object-contain" /> : <EmptyLogo small />}
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{settings.schoolName}</p><p className="text-xs font-bold tracking-wider text-slate-400">{settings.appSubtitle}</p></div>
          <button onClick={() => setSidebarOpen(false)} className="rounded-lg p-1 text-slate-300 hover:bg-white/10 lg:hidden" aria-label="Close menu"><X size={18} /></button>
        </div>
        <nav className="flex-1 space-y-2 overflow-y-auto p-3 pt-4">{visibleNav.map((item) => <button key={item.key} onClick={() => { setActive(item.key); setSidebarOpen(false); }} className={cn("flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-black transition", active === item.key ? "bg-primary text-white" : "text-slate-200 hover:bg-white/10")}>{item.icon}{item.label}</button>)}</nav>
        <div className="border-t border-white/10 p-4 text-xs text-slate-400">{settings.footerNotice}</div>
      </aside>
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-[66px] items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 lg:px-8">
          <button onClick={() => setSidebarOpen(true)} className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-100 lg:hidden" aria-label="Open menu" title="Menu"><Menu size={20} /></button>
          <div className="relative w-full max-w-[420px]">
            <Search className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400" size={18} />
            <input
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
              placeholder="Search students (number or name)..."
              value={headerQuery}
              onChange={(e) => setHeaderQuery(e.target.value)}
              onFocus={() => setHeaderFocus(true)}
              onBlur={() => setTimeout(() => setHeaderFocus(false), 150)}
              onKeyDown={(e) => { if (e.key === "Enter") { setStudentFilters({ ...studentFilters, search: headerQuery }); setActive("students"); setHeaderFocus(false); setTimeout(() => void loadStudents(), 0); } }}
            />
            {headerFocus && headerQuery.trim() ? (
              <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {headerSuggestions.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    onMouseDown={() => { setHeaderQuery(""); setHeaderFocus(false); void viewStudent(student); }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="font-bold text-slate-950">{student.lastName}, {student.firstName}</span>
                    <span className="ml-2 text-xs text-slate-500">{student.studentNumber || "No student no."} · {student.gradeLevel} {student.section}</span>
                  </button>
                ))}
                {!headerSuggestions.length ? <p className="px-3 py-2 text-sm text-slate-500">No matching student.</p> : null}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-3"><button onClick={logout} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Logout" aria-label="Logout"><LogOut size={18} /></button><div className="hidden text-right sm:block"><p className="text-sm font-black">{currentUser.fullName}</p><p className="text-xs text-slate-500">{roleLabel(currentUser.role)}</p></div><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-black text-white">{initials(currentUser.fullName)}</div></div>
        </header>
        <main className="min-h-[calc(100vh-66px)] px-4 py-7 lg:px-8">
          {settings.dashboardImageDataUrl && active === "dashboard" ? <div className="mb-5 h-40 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><img src={settings.dashboardImageDataUrl} alt="Dashboard banner" className="h-full w-full object-cover" /></div> : null}
          {renderPage()}
          <footer className="py-8 text-center text-xs text-slate-500">{settings.footerNotice} · Session timeout {settings.sessionHours}h</footer>
        </main>
      </div>
      {modal?.type === "addStudent" ? <StudentFormModal onClose={() => setModal(null)} onSave={saveStudent} /> : null}
      {modal?.type === "editStudent" ? <StudentFormModal student={modal.payload as Student} onClose={() => setModal(null)} onSave={saveStudent} /> : null}
      {modal?.type === "viewStudent" ? <StudentDetailsModal student={modal.payload as Student} onClose={() => setModal(null)} onResetViolations={currentUser.role === "super_admin" ? () => resetStudentViolations(modal.payload as Student) : undefined} /> : null}
      {modal?.type === "importStudents" ? <StudentImportModal onClose={() => setModal(null)} onImport={importStudentsFile} /> : null}
      {modal?.type === "addViolation" ? <ViolationFormModal students={allStudents} onClose={() => setModal(null)} onSave={saveViolation} /> : null}
      {modal?.type === "editViolation" ? <ViolationFormModal students={allStudents} violation={modal.payload as Violation} onClose={() => setModal(null)} onSave={saveViolation} /> : null}
      {modal?.type === "viewViolation" ? <ViolationDetailsModal violation={modal.payload as Violation} onClose={() => setModal(null)} /> : null}
      {modal?.type === "addUser" ? <UserFormModal onClose={() => setModal(null)} onSave={saveUser} /> : null}
      {modal?.type === "editUser" ? <UserFormModal user={modal.payload as ManagedUser} isSelf={(modal.payload as ManagedUser).id === currentUser.id} onClose={() => setModal(null)} onSave={saveUser} /> : null}
    </div>
  );
}
