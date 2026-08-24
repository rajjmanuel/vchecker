import { clearSession, getCurrentUser } from "@/lib/auth";
import { writeLog } from "@/lib/audit";
import { handleRoute, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST() {
  return handleRoute(async () => {
    const user = await getCurrentUser();
    if (user) {
      await writeLog({ user, module: "Authentication", action: "LOGOUT", description: "Signed out." });
    }
    await clearSession();
    return ok({ signedOut: true });
  });
}
