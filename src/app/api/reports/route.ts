import { getSearchParams, handleRoute, ok, requirePermission } from "@/lib/api";
import { getReportData } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleRoute(async () => {
    await requirePermission("reports", "view");
    const params = getSearchParams(request);
    const { type = "major", ...filters } = params;
    return ok(await getReportData(type, filters));
  });
}
