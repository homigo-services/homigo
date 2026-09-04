/**
 * Phase 4C — post-assignment booking confirmation tests.
 * Requires: dev server, migrations 009–014, test Plumber worker, WHATSAPP_MOCK_SEND=true
 */

import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { setDefaultResultOrder } from "node:dns";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

setDefaultResultOrder("ipv4first");

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const envPath = resolve(process.cwd(), ".env.local");

function normalizeEnvValue(raw) {
  let v = String(raw ?? "")
    .replace(/\r/g, "")
    .trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function loadEnv() {
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = normalizeEnvValue(m[2]);
    }
  } catch {
    console.warn("No .env.local");
  }
}

loadEnv();
process.env.WHATSAPP_MOCK_SEND = "true";

function getSupabaseEnv() {
  return {
    url: normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, ""),
    key: normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

function supabaseClient() {
  const { url, key } = getSupabaseEnv();
  if (!url || !key) return null;
  return createClient(url, key);
}

const tests = [];
let pass = 0;

function log(name, ok, detail = "") {
  tests.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
}

async function fetchJson(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, options);
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

function regressionNodeEnv() {
  const env = { ...process.env, WHATSAPP_MOCK_SEND: "true" };
  if (process.execArgv.includes("--use-system-ca")) {
    env.NODE_OPTIONS = [env.NODE_OPTIONS, "--use-system-ca"].filter(Boolean).join(" ");
  }
  return env;
}

function runRegressionScript(scriptRelativePath) {
  const scriptPath = resolve(process.cwd(), scriptRelativePath);
  const nodeArgs = [
    ...process.execArgv.filter((arg) => arg.startsWith("--use-")),
    scriptPath,
  ];
  if (process.argv[2]) nodeArgs.push(process.argv[2]);
  const result = spawnSync(process.execPath, nodeArgs, {
    cwd: process.cwd(),
    env: regressionNodeEnv(),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(`\n--- ${scriptRelativePath} failed ---`);
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    return false;
  }
  return true;
}

async function fetchServices() {
  const sb = supabaseClient();
  const { data, error } = await sb
    .from("services")
    .select("id, service_name")
    .eq("is_active", true)
    .order("service_name");
  if (error) return { services: [], error: error.message };
  return {
    services: (data ?? []).map((s) => ({ id: s.id, name: String(s.service_name ?? "") })),
    error: null,
  };
}

async function ensureRateCard(serviceId) {
  const sb = supabaseClient();
  const { data: existing } = await sb
    .from("service_rate_cards")
    .select("id, base_amount, lead_charge")
    .eq("service_id", serviceId)
    .eq("is_active", true)
    .maybeSingle();
  if (existing) return existing;

  const { data } = await sb
    .from("service_rate_cards")
    .insert({
      service_id: serviceId,
      base_amount: 500,
      lead_charge: 50,
      platform_commission: 100,
      worker_earning: 350,
      is_active: true,
      notes: "Phase 4C test temp",
    })
    .select("id, base_amount, lead_charge")
    .single();
  return data;
}

async function findEligiblePlumberWorker(serviceId) {
  const sb = supabaseClient();
  const { data: wsRows } = await sb
    .from("worker_services")
    .select("worker_id")
    .eq("service_id", serviceId)
    .eq("is_active", true);

  const ids = (wsRows ?? []).map((r) => r.worker_id);
  if (ids.length === 0) return null;

  const { data: workers } = await sb
    .from("workers")
    .select('id, "Full name", pincode, area, is_available, is_verified, status')
    .in("id", ids)
    .eq("status", "active")
    .eq("is_verified", true);

  return workers?.[0] ?? null;
}

async function cleanupSr(srId, customerId, mobile) {
  const sb = supabaseClient();
  if (!sb) return;
  await sb.from("worker_service_offers").delete().eq("service_request_id", srId);
  const { data: bookings } = await sb.from("booking").select("id, worker_id").eq("sevice_request_id", srId);
  for (const b of bookings ?? []) {
    await sb.from("booking").delete().eq("id", b.id);
    if (b.worker_id) {
      await sb.from("workers").update({ is_available: true }).eq("id", b.worker_id);
    }
  }
  await sb.from("whatsapp_processed_events").delete().eq("whatsapp_mobile", mobile);
  await sb.from("whatsapp_conversations").delete().eq("whatsapp_mobile", mobile);
  await sb.from("service-request").delete().eq("id", srId);
  if (customerId) await sb.from("customers").delete().eq("id", customerId);
}

async function createScenario(serviceName, worker) {
  const sb = supabaseClient();
  const mobile = `919999555${String(Date.now()).slice(-4)}`;
  const { data: customer } = await sb
    .from("customers")
    .insert({
      name: "P4C Confirm Test",
      mobile,
      area: worker.area ?? "Mumbai",
      pincode: worker.pincode ?? "411001",
      address_line: "Test Addr",
      preferred_language: "en",
      source: "whatsapp",
      status: "active",
      subscription_status: "free",
      is_whatsapp_verified: true,
    })
    .select("*")
    .single();

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const { data: sr } = await sb
    .from("service-request")
    .insert({
      original_message: "test",
      service_type: serviceName,
      preferred_time_slot: "10:00-12:00",
      area: worker.area ?? "Mumbai",
      pincode: worker.pincode ?? "411001",
      address: "Test",
      service_date: tomorrow.toISOString().slice(0, 10),
      customer_id: customer.id,
      customer_mobile: mobile,
      status: "new",
      rate_card_sent: true,
      rate_card_accepted: true,
    })
    .select("*")
    .single();

  await sb.from("whatsapp_conversations").insert({
    whatsapp_mobile: mobile,
    customer_id: customer.id,
    preferred_language: "en",
    state: "worker_assignment",
    service_request_id: sr.id,
    context: {
      phase: "worker_matching_pending",
      service_request_id: sr.id,
    },
  });

  return { sr, customer, mobile };
}

function buildWebhookPayload(messageId, from, body) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_TEST",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15550000000",
                phone_number_id: "PHONE_TEST",
              },
              contacts: [{ profile: { name: "Test User" }, wa_id: from }],
              messages: [
                {
                  from,
                  id: messageId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function run() {
  console.log(`Phase 4C booking confirmation tests at ${baseUrl}\n`);

  const sb = supabaseClient();
  if (!sb) {
    console.error("Supabase not configured\n");
    process.exit(1);
  }

  const { services, error: svcErr } = await fetchServices();
  if (svcErr || services.length === 0) {
    console.error(`Services unavailable: ${svcErr ?? "empty"}\n`);
    process.exit(1);
  }

  const service =
    services.find((s) => s.name.toLowerCase() === "plumber") ?? services[0];
  const rateCard = await ensureRateCard(service.id);
  const worker = await findEligiblePlumberWorker(service.id);

  if (!worker) {
    console.error("No eligible Plumber worker found. Seed Phase 4B test worker first.\n");
    process.exit(1);
  }

  await sb.from("workers").update({ is_available: true }).eq("id", worker.id);

  const { sr, customer, mobile } = await createScenario(service.name, worker);

  const startRes = await fetchJson("/api/dev/workers/start-matching", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      serviceRequestId: sr.id,
      serviceId: service.id,
      serviceType: service.name,
      area: worker.area ?? "Mumbai",
      pincode: worker.pincode ?? "411001",
    }),
  });

  const links = startRes.json.devAcceptLinks ?? [];
  const token = links[0]?.acceptPath?.split("/").pop();

  if (!token) {
    console.error("No dev accept link — matching produced no offers.\n");
    await cleanupSr(sr.id, customer.id, mobile);
    process.exit(1);
  }

  const acceptRes = await fetch(`${baseUrl}/api/workers/offers/${encodeURIComponent(decodeURIComponent(token))}`, {
    method: "POST",
  });
  const acceptJson = await acceptRes.json().catch(() => ({}));

  log(
    "A. Worker accept creates assigned booking",
    acceptRes.ok && acceptJson.success && acceptJson.booking_id,
    `booking=${acceptJson.booking_id?.slice(0, 8)}`,
  );

  const bookingId = acceptJson.booking_id;

  const { data: booking } = await sb
    .from("booking")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();

  log(
    "B. Booking status assigned + worker linked",
    booking?.booking_status === "assigned" && booking?.worker_id === worker.id,
    `status=${booking?.booking_status}`,
  );

  const { data: srAfter } = await sb.from("service-request").select("status").eq("id", sr.id).maybeSingle();
  log("C. Service-request status assigned", srAfter?.status === "assigned", `status=${srAfter?.status}`);

  const { data: workerAfter } = await sb
    .from("workers")
    .select("is_available")
    .eq("id", worker.id)
    .maybeSingle();
  log("D. Worker unavailable after accept", workerAfter?.is_available === false, `available=${workerAfter?.is_available}`);

  const { data: offers } = await sb
    .from("worker_service_offers")
    .select("status, worker_id")
    .eq("service_request_id", sr.id);
  const winners = (offers ?? []).filter((o) => o.status === "accepted");
  const losers = (offers ?? []).filter((o) => o.status === "cancelled");
  log(
    "E. One accepted offer, others cancelled",
    winners.length === 1 && losers.length === (offers?.length ?? 0) - 1,
    `accepted=${winners.length} cancelled=${losers.length}`,
  );

  const { data: conv } = await sb
    .from("whatsapp_conversations")
    .select("state, booking_id, context")
    .eq("whatsapp_mobile", mobile)
    .maybeSingle();

  log(
    "F. Conversation booking_confirmed + confirmation sent",
    conv?.state === "booking_confirmed" &&
      conv?.booking_id === bookingId &&
      conv?.context?.confirmation_sent_at,
    `state=${conv?.state}`,
  );

  log(
    "G. Correct final_amount on booking",
    Number(booking?.final_amount) === 1000,
    `amount=${booking?.final_amount}`,
  );

  const sentAtBefore = conv?.context?.confirmation_sent_at;

  const dupRes = await fetch(`${baseUrl}/api/workers/offers/${encodeURIComponent(decodeURIComponent(token))}`, {
    method: "POST",
  });
  const dupJson = await dupRes.json().catch(() => ({}));

  const { count: bookingCount } = await sb
    .from("booking")
    .select("id", { count: "exact", head: true })
    .eq("sevice_request_id", sr.id);

  const { data: convAfterDup } = await sb
    .from("whatsapp_conversations")
    .select("context")
    .eq("whatsapp_mobile", mobile)
    .maybeSingle();

  log(
    "H. Duplicate accept rejected",
    !dupRes.ok && dupJson.error === "already_accepted",
    `status=${dupRes.status}`,
  );
  log("I. No duplicate booking", bookingCount === 1, `count=${bookingCount}`);
  log(
    "J. confirmation_sent_at unchanged on duplicate",
    convAfterDup?.context?.confirmation_sent_at === sentAtBefore,
    "idempotent",
  );

  const msgId = `wamid.p4c.${Date.now()}`;
  const whRes = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildWebhookPayload(msgId, mobile, "hi")),
  });
  const whJson = await whRes.json().catch(() => ({}));

  const { data: convAfterHi } = await sb
    .from("whatsapp_conversations")
    .select("state, context")
    .eq("whatsapp_mobile", mobile)
    .maybeSingle();

  log(
    "K. Post-confirm webhook stays booking_confirmed",
    whRes.ok &&
      whJson.success !== false &&
      convAfterHi?.state === "booking_confirmed" &&
      convAfterHi?.state !== "language_selection",
    `state=${convAfterHi?.state}`,
  );

  const badRes = await fetch(`${baseUrl}/api/workers/offers/invalid-token-p4c`, { method: "POST" });
  log("L. Invalid token rejected", badRes.status === 400, `status=${badRes.status}`);

  console.log("\nRunning regression suites...");
  log("M. Phase 3A regression", runRegressionScript("scripts/test-whatsapp-webhook.mjs"));
  log("N. Phase 4A regression", runRegressionScript("scripts/test-whatsapp-booking-flow.mjs"));
  log("O. Phase 4B regression", runRegressionScript("scripts/test-worker-matching.mjs"));

  await cleanupSr(sr.id, customer.id, mobile);
  await sb.from("workers").update({ is_available: true }).eq("id", worker.id);

  console.log(`\n${pass}/${tests.length} Phase 4C tests passed`);
  if (pass !== tests.length) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
