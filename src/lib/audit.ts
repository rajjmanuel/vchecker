import "server-only";

import { headers } from "next/headers";
import { db } from "@/db";
import { activityLogs, type User } from "@/db/schema";
import type { AuthUser } from "@/lib/auth";

export async function getRequestIp() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export async function writeLog({
  user,
  module,
  action,
  description,
}: {
  user: Pick<User, "id" | "username" | "role"> | Pick<AuthUser, "id" | "username" | "role"> | null;
  module: string;
  action: string;
  description: string;
}) {
  await db.insert(activityLogs).values({
    userId: user?.id,
    username: user?.username ?? "system",
    role: user?.role === "super_admin" ? "Super Admin" : user?.role === "faculty" ? "Faculty" : user?.role === "staff" ? "Staff" : "System",
    module,
    action,
    description,
    ipAddress: await getRequestIp(),
  });
}
