import "server-only";

import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "crypto";
import { cookies } from "next/headers";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type PermissionMap, type User } from "@/db/schema";
import { normalizePermissions, SUPER_ADMIN_PERMISSIONS } from "@/lib/constants";

const SESSION_COOKIE = "ncst_vr_session";
const DEFAULT_SECRET = "local-development-secret-change-me";

type SessionPayload = {
  userId: number;
  username: string;
  role: User["role"];
  exp: number;
};

export type AuthUser = Pick<User, "id" | "fullName" | "username" | "email" | "role" | "isActive"> & {
  permissions: PermissionMap;
};

function secret() {
  const configuredSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!configuredSecret && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be configured in production.");
  }
  return configuredSecret || DEFAULT_SECRET;
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const computed = scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(hash, "hex");
  return storedBuffer.length === computed.length && timingSafeEqual(storedBuffer, computed);
}

export function createSessionToken(payload: SessionPayload) {
  const encodedPayload = base64Url(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function parseSessionToken(token?: string): SessionPayload | null {
  if (!token) return null;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature || sign(encodedPayload) !== signature) return null;
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function setSession(user: Pick<User, "id" | "username" | "role">, sessionHours = 12) {
  const token = createSessionToken({
    userId: user.id,
    username: user.username,
    role: user.role,
    exp: Date.now() + sessionHours * 60 * 60 * 1000,
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionHours * 60 * 60,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSessionPayload() {
  const cookieStore = await cookies();
  return parseSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const payload = await getSessionPayload();
  if (!payload) return null;
  const [user] = await db.select().from(users).where(and(eq(users.id, payload.userId), eq(users.isActive, true))).limit(1);
  if (!user) return null;
  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    permissions: user.role === "super_admin" ? SUPER_ADMIN_PERMISSIONS : normalizePermissions(user.permissions, user.role),
  };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return user;
}

export function isSuperAdmin(user: AuthUser | null | undefined) {
  return user?.role === "super_admin";
}

export function can(user: AuthUser | null | undefined, module: keyof PermissionMap, action: string) {
  if (!user) return false;
  if (user.role === "super_admin") return true;
  return Boolean(user.permissions?.[module]?.[action as keyof PermissionMap[keyof PermissionMap]]);
}

export async function hasUsers() {
  const [row] = await db.select({ value: count() }).from(users);
  return Number(row?.value ?? 0) > 0;
}
