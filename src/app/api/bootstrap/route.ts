import { count } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { ensureDemoData, ensureSettings } from "@/lib/data";
import { handleRoute, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleRoute(async () => {
    const [userCount] = await db.select({ value: count() }).from(users);
    const settings = await ensureSettings();
    const currentUser = await getCurrentUser();
    if (Number(userCount.value) > 0) await ensureDemoData(currentUser?.id);
    return ok({
      needsSetup: Number(userCount.value) === 0,
      currentUser,
      settings,
    });
  });
}
