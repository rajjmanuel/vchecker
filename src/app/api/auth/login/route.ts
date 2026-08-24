import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { setSession, verifyPassword } from "@/lib/auth";
import { ensureSettings } from "@/lib/data";
import { normalizePermissions, SUPER_ADMIN_PERMISSIONS } from "@/lib/constants";
import { writeLog } from "@/lib/audit";
import { fail, handleRoute, ok, readBody } from "@/lib/api";

export const dynamic = "force-dynamic";

type LoginBody = {
  username?: string;
  password?: string;
};

export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = await readBody<LoginBody>(request);
    const identifier = body.username?.trim().toLowerCase();
    const password = body.password ?? "";
    if (!identifier || !password) return fail("Username/email and password are required.");

    const [user] = await db
      .select()
      .from(users)
      .where(or(eq(users.username, identifier), eq(users.email, identifier)))
      .limit(1);

    if (!user || !verifyPassword(password, user.passwordHash)) return fail("Invalid username or password.", 401);
    if (!user.isActive) return fail("This account is deactivated.", 403);

    const settings = await ensureSettings();
    await setSession(user, settings.sessionHours);
    await writeLog({ user, module: "Authentication", action: "LOGIN", description: "Signed in successfully." });
    return ok({ user: { id: user.id, fullName: user.fullName, username: user.username, email: user.email, role: user.role, permissions: user.role === "super_admin" ? SUPER_ADMIN_PERMISSIONS : normalizePermissions(user.permissions, user.role) } });
  });
}
