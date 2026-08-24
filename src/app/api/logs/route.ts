import { getSearchParams, handleRoute, ok, requirePermission } from "@/lib/api";
import { listLogs } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleRoute(async () => {
    await requirePermission("logs", "view");
    return ok(await listLogs(getSearchParams(request)));
  });
}
