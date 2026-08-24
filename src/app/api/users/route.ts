import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users, type PermissionMap } from "@/db/schema";
import { hashPassword, requireUser } from "@/lib/auth";
import { DEFAULT_STAFF_PERMISSIONS, FACULTY_PERMISSIONS, normalizePermissions, SUPER_ADMIN_PERMISSIONS } from "@/lib/constants";
import { listUsers } from "@/lib/data";
import { fail, handleRoute, ok, readBody } from "@/lib/api";
import { writeLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

type UserBody = {
  fullName?: string;
  username?: string;
  email?: string;
  password?: string;
  role?: "super_admin" | "staff" | "faculty";
  permissions?: PermissionMap;
};

function requireSuperAdmin(user: Awaited<ReturnType<typeof requireUser>>) {
  if (user.role !== "super_admin") throw new Response("Forbidden", { status: 403 });
}

export async function GET() {
  return handleRoute(async () => {
    const user = await requireUser();
    requireSuperAdmin(user);
    const rows = await listUsers();
    return ok(rows.map(({ passwordHash: _passwordHash, ...row }) => row));
  });
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser();
    requireSuperAdmin(user);
    const body = await readBody<UserBody>(request);
    const fullName = body.fullName?.trim();
    const username = body.username?.trim().toLowerCase();
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    const role = body.role ?? "staff";
    if (!fullName || !username || !email) return fail("Full name, username, and email are required.");
    if (username.length < 3) return fail("Username must be at least 3 characters.");
    if (!email.includes("@")) return fail("Valid email is required.");
    if (password.length < 8) return fail("Password must be at least 8 characters.");

    const [{ id: createdId }] = await db
      .insert(users)
      .values({
        fullName,
        username,
        email,
        passwordHash: hashPassword(password),
        role,
        permissions: role === "super_admin" ? SUPER_ADMIN_PERMISSIONS : normalizePermissions(body.permissions ?? (role === "faculty" ? FACULTY_PERMISSIONS : DEFAULT_STAFF_PERMISSIONS), role),
      })
      .$returningId();
    const [created] = await db.select().from(users).where(eq(users.id, createdId)).limit(1);
    await writeLog({ user, module: "User Management", action: "USER_CREATED", description: `Created ${role === "super_admin" ? "Super Admin" : "Staff"} account ${created.username}.` });
    const { passwordHash: _passwordHash, ...safe } = created;
    return ok(safe, { status: 201 });
  });
}
