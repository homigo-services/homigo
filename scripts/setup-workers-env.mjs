#!/usr/bin/env node
/**
 * Adds missing Workers env vars to .env.local
 * Usage: node scripts/setup-workers-env.mjs
 */

import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
const lines = existsSync(envPath)
  ? readFileSync(envPath, "utf8").split(/\r?\n/)
  : [];

function getValue(key) {
  const line = lines.find((l) => l.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim() ?? "";
}

function setValue(key, value) {
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
  const entry = `${key}=${value}`;
  if (idx >= 0) lines[idx] = entry;
  else lines.push(entry);
}

const generatedSecret = randomBytes(32).toString("hex");

if (!getValue("WORKERS_IMPORT_SECRET")) {
  setValue("WORKERS_IMPORT_SECRET", generatedSecret);
  console.log("Added WORKERS_IMPORT_SECRET");
} else {
  console.log("WORKERS_IMPORT_SECRET already set");
}

if (!getValue("NEXT_PUBLIC_WORKER_REGISTRATION_FORM_URL")) {
  setValue(
    "NEXT_PUBLIC_WORKER_REGISTRATION_FORM_URL",
    "https://docs.google.com/forms/d/YOUR_FORM_ID/viewform",
  );
  console.log("Added NEXT_PUBLIC_WORKER_REGISTRATION_FORM_URL placeholder");
} else {
  console.log("NEXT_PUBLIC_WORKER_REGISTRATION_FORM_URL already set");
}

if (!getValue("SUPABASE_SERVICE_ROLE_KEY")) {
  console.log(
    "NOTE: SUPABASE_SERVICE_ROLE_KEY is not set. API routes will use anon key fallback.",
  );
  console.log(
    "Add it from Supabase Dashboard → Settings → API → service_role key.",
  );
}

const output = lines.filter((l, i, arr) => l.length > 0 || i < arr.length - 1).join("\n");
writeFileSync(envPath, `${output.trim()}\n`, "utf8");
console.log(`Updated ${envPath}`);
console.log("\nNext: restart `npm run dev` and run `npm run test:workers`");
