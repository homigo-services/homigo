import { notFound } from "next/navigation";
import { isNonProductionRuntime } from "@/lib/env/runtime";

/** True only during local development/test — never in production. */
export function isDevEnvironment(): boolean {
  return isNonProductionRuntime();
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
