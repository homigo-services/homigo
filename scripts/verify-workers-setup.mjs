#!/usr/bin/env node
/**
 * Verifies Workers module launch readiness
 * Usage: node scripts/verify-workers-setup.mjs [baseUrl]
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const envPath = resolve(process.cwd(), ".env.local");

function loadEnv() {
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

loadEnv();

const checks = [];

function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "OK" : "MISSING"} ${name}${detail ? ` — ${detail}` : ""}`);
}

check("NEXT_PUBLIC_SUPABASE_URL", Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL));
check(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
);
check(
  "SUPABASE_SERVICE_ROLE_KEY",
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  process.env.SUPABASE_SERVICE_ROLE_KEY ? "recommended" : "using anon fallback",
);
check("WORKERS_IMPORT_SECRET", Boolean(process.env.WORKERS_IMPORT_SECRET));
check(
  "NEXT_PUBLIC_WORKER_REGISTRATION_FORM_URL",
  Boolean(process.env.NEXT_PUBLIC_WORKER_REGISTRATION_FORM_URL) &&
    !process.env.NEXT_PUBLIC_WORKER_REGISTRATION_FORM_URL.includes("YOUR_FORM_ID"),
  process.env.NEXT_PUBLIC_WORKER_REGISTRATION_FORM_URL?.includes("YOUR_FORM_ID")
    ? "replace placeholder"
    : "configured",
);

try {
  const res = await fetch(`${baseUrl}/api/workers/import`);
  const json = await res.json();
  check("GET /api/workers/import", res.ok, `status ${res.status}`);
  if (json.configured) {
    check("API env: import secret", json.configured.workersImportSecret);
    check("API env: form URL", json.configured.workerRegistrationFormUrl);
  }
} catch (err) {
  check("GET /api/workers/import", false, err.message);
}

const passed = checks.filter((c) => c.ok).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
