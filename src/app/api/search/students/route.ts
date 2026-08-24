import { getSearchParams, handleRoute, ok, requirePermission } from "@/lib/api";
import { searchStudents } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleRoute(async () => {
    await requirePermission("students", "view");
    const { q = "" } = getSearchParams(request);
    return ok(await searchStudents(q));
  });
}
