import { handleRoute, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleRoute(async () => {
    await requireUser();
    return ok(await getDashboardData());
  });
}
