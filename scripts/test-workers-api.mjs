/**
 * Workers API smoke test — simulates Google Form → Apps Script → Supabase flow
 *
 * Usage:
 *   node scripts/test-workers-api.mjs
 *   node scripts/test-workers-api.mjs http://localhost:3000
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const envPath = resolve(process.cwd(), ".env.local");

function loadEnv() {
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        process.env[match[1].trim()] = match[2].trim();
      }
    }
  } catch {
    console.warn("No .env.local found — run: node scripts/setup-workers-env.mjs");
  }
}

loadEnv();

const secret = process.env.WORKERS_IMPORT_SECRET;

const tests = [];
let createdWorkerId = null;

function log(name, ok, detail = "") {
  tests.push({ name, ok, detail });
  const icon = ok ? "PASS" : "FAIL";
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function request(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, options);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { res, json };
}

async function run() {
  console.log(`Testing Workers API at ${baseUrl}\n`);

  if (!secret) {
    console.error("WORKERS_IMPORT_SECRET not set. Run: node scripts/setup-workers-env.mjs\n");
    process.exit(1);
  }

  // Env configured in API
  {
    const { res, json } = await request("/api/workers/import");
    log(
      "GET /api/workers/import",
      res.ok && json.success,
      `workers=${json.workers?.length ?? 0}`,
    );
    log(
      "Env: WORKERS_IMPORT_SECRET visible to API",
      json.configured?.workersImportSecret === true,
    );
  }

  // Unauthorized import blocked
  {
    const { res } = await request("/api/workers/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ "Full name": "Bad", "Mobile number": "000" }),
    });
    log("POST import without secret → 401", res.status === 401, `status ${res.status}`);
  }

  // Google Form shaped payload (matches Apps Script output)
  {
    const mobile = `9${Date.now().toString().slice(-9)}`;
    const googleFormPayload = {
      "Full Name": "Google Form Test Worker",
      "Mobile Number": mobile,
      Gender: "Male",
      "Service Type": "Electrician, Plumber",
      Qualification: "ITI, Diploma",
      "Experience Years": "3",
      Area: "Pune",
      Pincode: "411001",
      "Preferred Timing": "Morning, Flexible",
      "Full Address": "Flat 12, Test Society",
      "Aadhaar Upload": "https://drive.google.com/file/d/test-aadhar/view",
      "Photo Upload": "https://drive.google.com/file/d/test-photo/view",
    };

    const { res, json } = await request("/api/workers/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
        "X-Homigo-Secret": secret,
      },
      body: JSON.stringify(googleFormPayload),
    });

    createdWorkerId = json.worker_id ?? null;
    log(
      "POST Google Form payload → create worker",
      res.ok && json.success,
      createdWorkerId ? `id=${createdWorkerId}` : json.message,
    );
    log(
      "Services inserted",
      json.services_count >= 2,
      `count=${json.services_count ?? 0}`,
    );
    log(
      "Documents inserted",
      json.documents_count >= 1,
      `count=${json.documents_count ?? 0}`,
    );
  }

  if (!createdWorkerId) {
    console.log("\nSkipping dependent tests — worker was not created.");
    console.log("If tables are missing, run supabase/migrations/001_workers_module.sql");
    summarize();
    process.exit(1);
  }

  {
    const { res, json } = await request(`/api/workers/${createdWorkerId}`);
    log(
      "GET /api/workers/[id]",
      res.ok && json.worker?.id === createdWorkerId,
      `services=${json.worker?.worker_services?.length ?? 0}`,
    );
  }

  {
    const { res, json } = await request(`/api/workers/${createdWorkerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", note: "Test approval" }),
    });
    log(
      "PATCH approve",
      res.ok && json.worker?.is_verified === true,
      json.message,
    );
  }

  {
    const { res, json } = await request(
      `/api/workers/${createdWorkerId}/services`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services: ["Electrician", "Plumber"] }),
      },
    );
    log(
      "PUT /api/workers/[id]/services",
      res.ok && Array.isArray(json.worker?.worker_services),
      `count=${json.worker?.worker_services?.length ?? 0}`,
    );
  }

  {
    const { res, json } = await request(`/api/workers/${createdWorkerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        worker: { area: "Mumbai", note: "Updated via test" },
      }),
    });
    log("PATCH update profile", res.ok, json.message);
  }

  {
    const { res, json } = await request(`/api/workers/${createdWorkerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deactivate" }),
    });
    log(
      "PATCH deactivate",
      res.ok && json.worker?.status === "inactive",
      json.worker?.status,
    );
  }

  {
    const { res, json } = await request(`/api/workers/${createdWorkerId}`, {
      method: "DELETE",
    });
    log("DELETE archive", res.ok, json.message);
  }

  summarize();
}

function summarize() {
  const passed = tests.filter((t) => t.ok).length;
  const total = tests.length;
  console.log(`\n${passed}/${total} tests passed`);
  process.exit(passed === total ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
