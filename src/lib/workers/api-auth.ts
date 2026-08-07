export function verifyWorkersImportSecret(request: Request): boolean {
  const secret = process.env.WORKERS_IMPORT_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";

  const authHeader = request.headers.get("authorization");
  const customHeader = request.headers.get("x-homigo-secret");

  if (authHeader === `Bearer ${secret}`) return true;
  if (customHeader === secret) return true;

  return false;
}

export function unauthorizedImportResponse() {
  return Response.json(
    { success: false, message: "Unauthorized import request" },
    { status: 401 },
  );
}

/**
 * Guard admin-only worker API routes.
 * In production, requires ADMIN_API_SECRET header when configured.
 * Falls back to same-origin /admin referer check for the admin panel.
 */
export function verifyAdminApiRequest(request: Request): boolean {
  const secret = process.env.ADMIN_API_SECRET;

  if (secret) {
    const authHeader = request.headers.get("authorization");
    const customHeader = request.headers.get("x-admin-secret");
    if (authHeader === `Bearer ${secret}`) return true;
    if (customHeader === secret) return true;
    return false;
  }

  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const referer = request.headers.get("referer") ?? "";
  return referer.includes("/admin/");
}

export function unauthorizedAdminResponse() {
  return Response.json(
    { success: false, message: "Unauthorized admin request" },
    { status: 401 },
  );
}
