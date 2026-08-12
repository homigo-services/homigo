import { notFound } from "next/navigation";

/** True when running Next.js dev server or non-production build context. */
export function isDevEnvironment(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** Call in dev-only pages/routes — returns 404 in production. */
export function assertDevEnvironment(): void {
  if (!isDevEnvironment()) {
    notFound();
  }
}

/** JSON 404 for dev-only API routes in production. */
export function devOnlyJsonResponse(): Response | null {
  if (!isDevEnvironment()) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return null;
}
