/**
 * Phase 5A — payment mode selection tests.
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

function supabaseClient() {
  const url = normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
  const key = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
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

async function postWebhook(mobile, body, messageId = `wamid.p5a.${Date.now()}.${Math.random()}`) {
  const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildWebhookPayload(messageId, mobile, body)),
  });
  const json = await res.json().catch(() => ({}));
  return { res, json, messageId };
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

async function findEligibleWorker(serviceId) {
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
    .select('id, pincode, area, is_available, is_verified, status')
    .in("id", ids)
    .eq("status", "active")
    .eq("is_verified", true);
  return workers?.[0] ?? null;
}

async function cleanupScenario(srId, customerId, mobile, workerId) {
  const sb = supabaseClient();
  if (!sb) return;
  await sb.from("worker_service_offers").delete().eq("service_request_id", srId);
  const { data: bookings } = await sb.from("booking").select("id").eq("sevice_request_id", srId);
  for (const b of bookings ?? []) await sb.from("booking").delete().eq("id", b.id);
  await sb.from("whatsapp_processed_events").delete().eq("whatsapp_mobile", mobile);
  await sb.from("whatsapp_conversations").delete().eq("whatsapp_mobile", mobile);
  await sb.from("service-request").delete().eq("id", srId);
  if (customerId) await sb.from("customers").delete().eq("id", customerId);
  if (workerId) await sb.from("workers").update({ is_available: true }).eq("id", workerId);
}

async function setupConfirmedBooking(lang = "en") {
  const sb = supabaseClient();
  const { services } = await fetchServices();
  const service = services.find((s) => s.name.toLowerCase() === "plumber") ?? services[0];
  const worker = await findEligibleWorker(service.id);
  if (!worker) throw new Error("No eligible worker");

  await sb.from("workers").update({ is_available: true }).eq("id", worker.id);

  const mobile = `919999444${String(Date.now()).slice(-4)}`;
  const { data: customer } = await sb
    .from("customers")
    .insert({
      name: "P5A Payment Test",
      mobile,
      area: worker.area ?? "Mumbai",
      pincode: worker.pincode ?? "411001",
      address_line: "Test Addr",
      preferred_language: lang,
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
      service_type: service.name,
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
    preferred_language: lang,
    state: "worker_assignment",
    service_request_id: sr.id,
    context: { phase: "worker_matching_pending", service_request_id: sr.id },
  });

  const startRes = await fetch(`${baseUrl}/api/dev/workers/start-matching`, {
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
  const startJson = await startRes.json();
  const token = startJson.devAcceptLinks?.[0]?.acceptPath?.split("/").pop();
  if (!token) throw new Error("No accept link");

  const acceptRes = await fetch(
    `${baseUrl}/api/workers/offers/${encodeURIComponent(decodeURIComponent(token))}`,
    { method: "POST" },
  );
  const acceptJson = await acceptRes.json();
  if (!acceptJson.booking_id) throw new Error("Accept failed");

  const { data: conv } = await sb
    .from("whatsapp_conversations")
    .select("*")
    .eq("whatsapp_mobile", mobile)
    .maybeSingle();

  return {
    mobile,
    customer,
    sr,
    worker,
    bookingId: acceptJson.booking_id,
    conv,
  };
}

async function run() {
  console.log(`Phase 5A payment mode tests at ${baseUrl}\n`);

  const sb = supabaseClient();
  if (!sb) {
    console.error("Supabase not configured\n");
    process.exit(1);
  }

  // --- English flow (A–I) ---
  const en = await setupConfirmedBooking("en");

  const menuRes = await postWebhook(en.mobile, "hello");
  const { data: convMenu } = await sb
    .from("whatsapp_conversations")
    .select("state, context")
    .eq("whatsapp_mobile", en.mobile)
    .maybeSingle();

  log(
    "A. booking_confirmed → payment menu prompt",
    menuRes.res.ok && convMenu?.state === "booking_confirmed",
    `state=${convMenu?.state} phase=${convMenu?.context?.phase}`,
  );

  const cashRes = await postWebhook(en.mobile, "1");
  const { data: bookingCash } = await sb
    .from("booking")
    .select("id, Payment_mode, payment_status, payment_received_at")
    .eq("id", en.bookingId)
    .maybeSingle();
  const { data: convCash } = await sb
    .from("whatsapp_conversations")
    .select("state, context")
    .eq("whatsapp_mobile", en.mobile)
    .maybeSingle();

  log(
    "B. Cash selection",
    cashRes.res.ok &&
      bookingCash?.Payment_mode === "cash" &&
      convCash?.state === "payment_pending",
    `mode=${bookingCash?.Payment_mode}`,
  );
  log("H. payment_status remains pending", bookingCash?.payment_status === "pending", bookingCash?.payment_status);
  log("I. payment_received_at remains null", bookingCash?.payment_received_at == null, "null");

  const dupMsgId = `wamid.p5a.dup.${Date.now()}`;
  const firstDup = await postWebhook(en.mobile, "1", dupMsgId);
  const secondDup = await postWebhook(en.mobile, "1", dupMsgId);
  const { count: bookingCount } = await sb
    .from("booking")
    .select("id", { count: "exact", head: true })
    .eq("sevice_request_id", en.sr.id);

  log("E. duplicate message/event idempotent", firstDup.res.ok && secondDup.res.ok, "webhook ok");
  log("G. booking remains the same", bookingCount === 1, `count=${bookingCount}`);

  const againRes = await postWebhook(en.mobile, "2");
  const { data: bookingAfterAgain } = await sb
    .from("booking")
    .select("Payment_mode")
    .eq("id", en.bookingId)
    .maybeSingle();
  const { data: convAgain } = await sb
    .from("whatsapp_conversations")
    .select("state")
    .eq("whatsapp_mobile", en.mobile)
    .maybeSingle();

  log(
    "F. already-selected payment mode unchanged",
    bookingAfterAgain?.Payment_mode === "cash" && convAgain?.state === "payment_pending",
    `mode=${bookingAfterAgain?.Payment_mode}`,
  );

  await cleanupScenario(en.sr.id, en.customer.id, en.mobile, en.worker.id);

  // --- UPI flow (C) ---
  const upi = await setupConfirmedBooking("en");
  await postWebhook(upi.mobile, "hi");
  await postWebhook(upi.mobile, "2");
  const { data: bookingUpi } = await sb
    .from("booking")
    .select("Payment_mode, payment_status")
    .eq("id", upi.bookingId)
    .maybeSingle();
  const { data: convUpi } = await sb
    .from("whatsapp_conversations")
    .select("state")
    .eq("whatsapp_mobile", upi.mobile)
    .maybeSingle();

  log("C. UPI selection", bookingUpi?.Payment_mode === "upi" && convUpi?.state === "payment_pending", `mode=${bookingUpi?.Payment_mode}`);
  await cleanupScenario(upi.sr.id, upi.customer.id, upi.mobile, upi.worker.id);

  // --- Invalid selection (D) ---
  const inv = await setupConfirmedBooking("en");
  await postWebhook(inv.mobile, "hi");
  const invalidRes = await postWebhook(inv.mobile, "9");
  const { data: bookingInv } = await sb
    .from("booking")
    .select("Payment_mode")
    .eq("id", inv.bookingId)
    .maybeSingle();
  const { data: convInv } = await sb
    .from("whatsapp_conversations")
    .select("state")
    .eq("whatsapp_mobile", inv.mobile)
    .maybeSingle();

  log(
    "D. invalid selection keeps booking_confirmed",
    invalidRes.res.ok && !bookingInv?.Payment_mode && convInv?.state === "booking_confirmed",
    `mode=${bookingInv?.Payment_mode ?? "null"}`,
  );
  await cleanupScenario(inv.sr.id, inv.customer.id, inv.mobile, inv.worker.id);

  // --- Marathi (J) ---
  const mr = await setupConfirmedBooking("mr");
  await postWebhook(mr.mobile, "hello");
  await postWebhook(mr.mobile, "1");
  const { data: bookingMr } = await sb
    .from("booking")
    .select("Payment_mode")
    .eq("id", mr.bookingId)
    .maybeSingle();
  log("J. localized Marathi flow", bookingMr?.Payment_mode === "cash", `mode=${bookingMr?.Payment_mode}`);
  await cleanupScenario(mr.sr.id, mr.customer.id, mr.mobile, mr.worker.id);

  // --- Hindi (K) ---
  const hi = await setupConfirmedBooking("hi");
  await postWebhook(hi.mobile, "hello");
  await postWebhook(hi.mobile, "2");
  const { data: bookingHi } = await sb
    .from("booking")
    .select("Payment_mode")
    .eq("id", hi.bookingId)
    .maybeSingle();
  log("K. localized Hindi flow", bookingHi?.Payment_mode === "upi", `mode=${bookingHi?.Payment_mode}`);
  await cleanupScenario(hi.sr.id, hi.customer.id, hi.mobile, hi.worker.id);

  // --- English explicit (L) ---
  const en2 = await setupConfirmedBooking("en");
  await postWebhook(en2.mobile, "next");
  await postWebhook(en2.mobile, "1");
  const { data: bookingEn2 } = await sb
    .from("booking")
    .select("Payment_mode, payment_status")
    .eq("id", en2.bookingId)
    .maybeSingle();
  log("L. localized English flow", bookingEn2?.Payment_mode === "cash", `mode=${bookingEn2?.Payment_mode}`);
  await cleanupScenario(en2.sr.id, en2.customer.id, en2.mobile, en2.worker.id);

  console.log("\nRunning regression suites...");
  log("R1. Phase 3A", runRegressionScript("scripts/test-whatsapp-webhook.mjs"));
  log("R2. Phase 4A", runRegressionScript("scripts/test-whatsapp-booking-flow.mjs"));
  log("R3. Phase 4B", runRegressionScript("scripts/test-worker-matching.mjs"));
  log("R4. Phase 4C", runRegressionScript("scripts/test-booking-confirmation.mjs"));

  console.log(`\n${pass}/${tests.length} Phase 5A tests passed`);
  if (pass !== tests.length) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
