#!/usr/bin/env node
/**
 * One-time Homigo admin user setup via Supabase Auth (service role, server-side only).
 *
 * Usage:
 *   npm run setup:admin -- --email admin@homigo.com --password "your-secure-password"
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run setup:admin
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--email" && argv[i + 1]) {
      parsed.email = argv[++i];
    } else if (arg === "--password" && argv[i + 1]) {
      parsed.password = argv[++i];
    }
  }
  return parsed;
}

async function findUserByEmail(supabase, email) {
  const normalized = email.toLowerCase();
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const match = data.users.find(
      (user) => user.email?.toLowerCase() === normalized,
    );
    if (match) return match;

    if (data.users.length < perPage) return null;
    page++;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  loadEnvLocal();

  const args = parseArgs(process.argv);
  const email = (process.env.ADMIN_EMAIL || args.email || "").trim();
  const password = process.env.ADMIN_PASSWORD || args.password || "";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl) {
    fail("Missing NEXT_PUBLIC_SUPABASE_URL (set in .env.local).");
  }
  if (!serviceRoleKey) {
    fail("Missing SUPABASE_SERVICE_ROLE_KEY (set in .env.local).");
  }
  if (!email) {
    fail("Missing admin email. Pass --email or set ADMIN_EMAIL.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  let existingUser;
  try {
    existingUser = await findUserByEmail(supabase, email);
  } catch (err) {
    fail(`Failed to check existing admin user: ${err.message || err}`);
  }

  if (existingUser) {
    console.log(`Admin user already exists: ${email}`);
    process.exit(0);
  }

  if (!password) {
    fail("Missing admin password. Pass --password or set ADMIN_PASSWORD.");
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    if (
      error.message?.toLowerCase().includes("already") ||
      error.status === 422
    ) {
      console.log(`Admin user already exists: ${email}`);
      process.exit(0);
    }
    fail(`Failed to create admin user: ${error.message}`);
  }

  if (!data.user) {
    fail("Failed to create admin user: no user returned.");
  }

  console.log(`Admin user created: ${email}`);
  process.exit(0);
}

main().catch((err) => {
  fail(err.message || String(err));
});
