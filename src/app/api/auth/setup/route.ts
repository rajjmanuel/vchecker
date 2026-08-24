import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, setSession } from "@/lib/auth";
import { SUPER_ADMIN_PERMISSIONS } from "@/lib/constants";
import { ensureDemoData, ensureSettings } from "@/lib/data";
import { writeLog } from "@/lib/audit";
import { fail, handleRoute, ok, readBody } from "@/lib/api";

export const dynamic = "force-dynamic";

type SetupBody = {
  fullName?: string;
  username?: string;
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = await readBody<SetupBody>(request);
    const [userCount] = await db.select({ value: count() }).from(users);
    if (Number(userCount.value) > 0) return fail("Initial administrator already exists.", 409);
    const fullName = body.fullName?.trim() || "System Administrator";
    const username = body.username?.trim().toLowerCase();
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    if (!username || username.length < 3) return fail("Username must be at least 3 characters.");
    if (!email || !email.includes("@")) return fail("Valid email is required.");
    if (password.length < 8) return fail("Password must be at least 8 characters.");

    const [{ id: createdId }] = await db
      .insert(users)
      .values({
        fullName,
        username,
        email,
        passwordHash: hashPassword(password),
        role: "super_admin",
        permissions: SUPER_ADMIN_PERMISSIONS,
      })
      .$returningId();
    const [created] = await db.select().from(users).where(eq(users.id, createdId)).limit(1);

    const settings = await ensureSettings();
    await ensureDemoData(created.id);
    await setSession(created, settings.sessionHours);
    await writeLog({ user: created, module: "Authentication", action: "SUPER_ADMIN_CREATED", description: "Initial Super Admin account was created from the login page." });
    return ok({ user: { id: created.id, fullName: created.fullName, username: created.username, email: created.email, role: created.role } }, { status: 201 });
  });
}
