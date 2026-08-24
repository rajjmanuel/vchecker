import { DEFAULT_SETTINGS } from "@/lib/constants";
import { requireUser } from "@/lib/auth";
import { ensureSettings, updateSettings } from "@/lib/data";
import { fail, handleRoute, ok, readBody } from "@/lib/api";
import { writeLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

type SettingsBody = {
  schoolName?: string;
  appSubtitle?: string;
  loginTitle?: string;
  footerNotice?: string;
  primaryColor?: string;
  accentColor?: string;
  sidebarColor?: string;
  fontFamily?: string;
  sessionHours?: number;
  logoDataUrl?: string | null;
  faviconDataUrl?: string | null;
  loginImageDataUrl?: string | null;
  dashboardImageDataUrl?: string | null;
  reset?: boolean;
};

function onlyHex(color: string | undefined, fallback: string) {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

function validImageDataUrl(value: string | null | undefined) {
  return value == null || /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(value);
}

function imageWithinLimit(value: string | null | undefined) {
  return value == null || value.length <= 60000;
}

export async function GET() {
  return handleRoute(async () => ok(await ensureSettings()));
}

export async function PUT(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser();
    if (user.role !== "super_admin") throw new Response("Forbidden", { status: 403 });
    const body = await readBody<SettingsBody>(request);
    if (body.reset) {
      const reset = await updateSettings({
        schoolName: DEFAULT_SETTINGS.schoolName,
        appSubtitle: DEFAULT_SETTINGS.appSubtitle,
        loginTitle: DEFAULT_SETTINGS.loginTitle,
        footerNotice: DEFAULT_SETTINGS.footerNotice,
        primaryColor: DEFAULT_SETTINGS.primaryColor,
        accentColor: DEFAULT_SETTINGS.accentColor,
        sidebarColor: DEFAULT_SETTINGS.sidebarColor,
        fontFamily: DEFAULT_SETTINGS.fontFamily,
        sessionHours: DEFAULT_SETTINGS.sessionHours,
        logoDataUrl: null,
        faviconDataUrl: null,
        loginImageDataUrl: null,
        dashboardImageDataUrl: null,
      });
      await writeLog({ user, module: "System Settings", action: "SETTINGS_RESET", description: "Reset system settings to the default theme." });
      return ok(reset);
    }
    const schoolName = body.schoolName?.trim();
    const footerNotice = body.footerNotice?.trim();
    if (!schoolName) return fail("School / organization name is required.");
    if (!footerNotice) return fail("Footer notice is required.");
    if (![body.logoDataUrl, body.faviconDataUrl, body.loginImageDataUrl, body.dashboardImageDataUrl].every(validImageDataUrl)) {
      return fail("One of the uploaded images is invalid or incomplete. Please upload it again.");
    }
    if (![body.logoDataUrl, body.faviconDataUrl, body.loginImageDataUrl, body.dashboardImageDataUrl].every(imageWithinLimit)) {
      return fail("One of the uploaded images is too large. Please resize or upload it again.");
    }
    const updated = await updateSettings({
      schoolName,
      appSubtitle: body.appSubtitle?.trim() || "VIOLATION RECORDS",
      loginTitle: body.loginTitle?.trim() || DEFAULT_SETTINGS.loginTitle,
      footerNotice,
      primaryColor: onlyHex(body.primaryColor, DEFAULT_SETTINGS.primaryColor),
      accentColor: onlyHex(body.accentColor, DEFAULT_SETTINGS.accentColor),
      sidebarColor: onlyHex(body.sidebarColor, DEFAULT_SETTINGS.sidebarColor),
      fontFamily: body.fontFamily?.trim() || DEFAULT_SETTINGS.fontFamily,
      sessionHours: Math.min(Math.max(Number(body.sessionHours || DEFAULT_SETTINGS.sessionHours), 1), 24),
      logoDataUrl: body.logoDataUrl ?? null,
      faviconDataUrl: body.faviconDataUrl ?? null,
      loginImageDataUrl: body.loginImageDataUrl ?? null,
      dashboardImageDataUrl: body.dashboardImageDataUrl ?? null,
    });
    await writeLog({ user, module: "System Settings", action: "SETTINGS_CHANGED", description: "Updated system settings: School name changed; Footer text changed; Logo/theme values changed." });
    return ok(updated);
  });
}
