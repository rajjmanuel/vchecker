import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type PermissionMap } from "@/db/schema";
import { hashPassword, requireUser } from "@/lib/auth";
import { DEFAULT_STAFF_PERMISSIONS, FACULTY_PERMISSIONS, normalizePermissions, SUPER_ADMIN_PERMISSIONS } from "@/lib/constants";
import { fail, handleRoute, ok, readBody } from "@/lib/api";
import { writeLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

type UserBody = {
  fullName?: string;
  username?: string;
  email?: string;
  password?: string;
  role?: "super_admin" | "staff" | "faculty";
  permissions?: PermissionMap;
  isActive?: boolean;
  action?: "reset_password" | "toggle_status";
};

async function requireSuperAdmin() {
  const user = await requireUser();
  if (user.role !== "super_admin") throw new Response("Forbidden", { status: 403 });
  return user;
}

export async function PUT(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireSuperAdmin();
    const id = Number((await params).id);
    const body = await readBody<UserBody>(request);
    const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!existing) return fail("User not found.", 404);

    if (body.action === "reset_password") {
      if (!body.password || body.password.length < 8) return fail("New password must be at least 8 characters.");
      await db.update(users).set({ passwordHash: hashPassword(body.password), updatedAt: new Date() }).where(eq(users.id, id));
      const [updated] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      await writeLog({ user: actor, module: "User Management", action: "PASSWORD_RESET", description: `Reset password for ${updated.username}.` });
      const { passwordHash: _passwordHash, ...safe } = updated;
      return ok(safe);
    }

    if (body.action === "toggle_status") {
      if (id === actor.id) return fail("You cannot deactivate your own account.");
      await db.update(users).set({ isActive: !existing.isActive, updatedAt: new Date() }).where(eq(users.id, id));
      const [updated] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      await writeLog({ user: actor, module: "User Management", action: updated.isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED", description: `${updated.isActive ? "Activated" : "Deactivated"} account ${updated.username}.` });
      const { passwordHash: _passwordHash, ...safe } = updated;
      return ok(safe);
    }

    const fullName = body.fullName?.trim();
    const username = body.username?.trim().toLowerCase();
    const email = body.email?.trim().toLowerCase();
    const role = existing.role === "super_admin" && id === actor.id ? "super_admin" : body.role ?? existing.role;
    const newPassword = body.password?.trim();
    if (newPassword && newPassword.length < 8) return fail("New password must be at least 8 characters.");
    if (!fullName || !username || !email) return fail("Full name, username, and email are required.");
    await db
      .update(users)
      .set({
        fullName,
        username,
        email,
        role,
        permissions: role === "super_admin" ? SUPER_ADMIN_PERMISSIONS : normalizePermissions(body.permissions ?? (role === "faculty" ? FACULTY_PERMISSIONS : DEFAULT_STAFF_PERMISSIONS), role),
        isActive: body.isActive ?? existing.isActive,
        ...(newPassword ? { passwordHash: hashPassword(newPassword) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      ;
    const [updated] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (newPassword) {
      await writeLog({ user: actor, module: "User Management", action: "PASSWORD_CHANGED", description: id === actor.id ? "Changed their own account password." : `Changed password for ${updated.username}.` });
    }
    await writeLog({ user: actor, module: "User Management", action: "USER_UPDATED", description: `Updated account ${updated.username}.` });
    const { passwordHash: _passwordHash, ...safe } = updated;
    return ok(safe);
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireSuperAdmin();
    const id = Number((await params).id);
    if (id === actor.id) return fail("You cannot delete your own account.");
    const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!existing) return fail("User not found.", 404);
    await db.delete(users).where(eq(users.id, id));
    await writeLog({ user: actor, module: "User Management", action: "USER_DELETED", description: `Deleted account ${existing.username}.` });
    return ok({ deleted: true });
  });
}
