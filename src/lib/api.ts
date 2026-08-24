import "server-only";

import type { PermissionMap } from "@/db/schema";
import { can, requireUser, type AuthUser } from "@/lib/auth";

export function ok<T>(data: T, init?: ResponseInit) {
  return Response.json({ ok: true, data }, init);
}

export function fail(message: string, status = 400, details?: unknown) {
  return Response.json({ ok: false, message, details }, { status });
}

export async function readBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Invalid JSON request body.");
  }
}

export function getSearchParams(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

export async function requirePermission(module: keyof PermissionMap, action: string): Promise<AuthUser> {
  const user = await requireUser();
  if (!can(user, module, action)) {
    throw new Response("Forbidden", { status: 403 });
  }
  return user;
}

export async function handleRoute(handler: () => Promise<Response>) {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof Response) {
      const status = error.status || 500;
      if (status === 401) return fail("Please sign in to continue.", 401);
      if (status === 403) return fail("You do not have permission to perform this action.", 403);
      return fail(error.statusText || "Request failed.", status);
    }
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return fail(message, 500);
  }
}
