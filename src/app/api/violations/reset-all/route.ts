import { deleteAllViolations } from "@/lib/data";
import { handleRoute, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { writeLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST() {
  return handleRoute(async () => {
    const user = await requireUser();
    if (user.role !== "super_admin") throw new Response("Forbidden", { status: 403 });
    const deletedCount = await deleteAllViolations();
    await writeLog({ user, module: "Violations", action: "ALL_VIOLATIONS_RESET", description: `Reset ${deletedCount} violation record(s) across all student records.` });
    return ok({ deletedCount });
  });
}