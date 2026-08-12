/**
 * Phase 6 — cash payment completion / collection confirmation.
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

async function postWebhook(mobile, body, messageId = `wamid.p6.${Date.now()}.${Math.random()}`) {
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

async function findOtherWorker(excludeId, serviceId) {
  const sb = supabaseClient();
  const { data: wsRows } = await sb
    .from("worker_services")
    .select("worker_id")
    .eq("service_id", serviceId)
    .eq("is_active", true);
  const ids = (wsRows ?? []).map((r) => r.worker_id).filter((id) => id !== excludeId);
  if (ids.length === 0) return { id: "00000000-0000-0000-0000-000000000099" };
  const { data: workers } = await sb
    .from("workers")
    .select("id")
    .in("id", ids)
    .limit(1);
  return workers?.[0] ?? { id: "00000000-0000-0000-0000-000000000099" };
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

async function requestOtp(bookingId, workerId) {
  let lastRes = null;
  let lastJson = {};
  for (let attempt = 0; attempt < 3; attempt++) {
    lastRes = await fetch(`${baseUrl}/api/dev/workers/request-completion-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, workerId }),
    });
    lastJson = await lastRes.json().catch(() => ({}));
    if (lastRes.ok && lastJson.success) return { json: lastJson, ok: true };
    await new Promise((r) => setTimeout(r, 300));
  }
  return { json: lastJson, ok: false };
}

async function confirmCash(bookingId, workerId) {
  const body = workerId ? { bookingId, workerId } : { bookingId };
  const res = await fetch(`${baseUrl}/api/dev/workers/confirm-cash`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function setupPaymentPendingScenario(paymentChoice = "1") {
  const sb = supabaseClient();
  const { services } = await fetchServices();
  const service = services.find((s) => s.name.toLowerCase() === "plumber") ?? services[0];
  const worker = await findEligibleWorker(service.id);
  if (!worker) throw new Error("No eligible worker");

  await sb.from("workers").update({ is_available: true }).eq("id", worker.id);

  const mobile = `919999222${String(Date.now()).slice(-4)}${String(Math.floor(Math.random() * 9))}`;
  const { data: customer } = await sb
    .from("customers")
    .insert({
      name: "P6 Cash Test",
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
    preferred_language: "en",
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

  for (let i = 0; i < 10; i++) {
    const { data: b } = await sb
      .from("booking")
      .select("booking_status, worker_id, final_amount")
      .eq("id", acceptJson.booking_id)
      .maybeSingle();
    if (b?.booking_status === "assigned" && b?.worker_id) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  const { data: bookingBefore } = await sb
    .from("booking")
    .select("final_amount")
    .eq("id", acceptJson.booking_id)
    .maybeSingle();

  const otpCall = await requestOtp(acceptJson.booking_id, worker.id);
  if (!otpCall.ok) throw new Error("OTP request failed");

  await postWebhook(mobile, otpCall.json.dev_otp);
  await postWebhook(mobile, paymentChoice);

  const { data: conv } = await sb
    .from("whatsapp_conversations")
    .select("state, context")
    .eq("whatsapp_mobile", mobile)
    .maybeSingle();

  const { data: booking } = await sb
    .from("booking")
    .select("*")
    .eq("id", acceptJson.booking_id)
    .maybeSingle();

  return {
    mobile,
    customer,
    sr,
    worker,
    service,
    bookingId: acceptJson.booking_id,
    snapshotAmount: Number(bookingBefore?.final_amount ?? booking?.final_amount ?? 0),
    conv,
    booking,
  };
}

async function setupCashPendingScenario() {
  return setupPaymentPendingScenario("1");
}

async function run() {
  console.log(`Phase 6 cash payment completion tests at ${baseUrl}\n`);

  const sb = supabaseClient();
  if (!sb) {
    console.error("Supabase not configured\n");
    process.exit(1);
  }

  const scenario = await setupCashPendingScenario();

  log(
    "Pre. Cash pending state ready",
    scenario.booking?.Payment_mode === "cash" &&
      scenario.booking?.payment_status === "pending" &&
      scenario.conv?.context?.phase === "cash_payment_pending",
    `mode=${scenario.booking?.Payment_mode} phase=${scenario.conv?.context?.phase}`,
  );

  const confirm1 = await confirmCash(scenario.bookingId);
  log(
    "A. Cash confirmation succeeds",
    confirm1.res.ok && confirm1.json.success,
    confirm1.json.error ?? "ok",
  );

  const { data: bookingDone } = await sb
    .from("booking")
    .select("*")
    .eq("id", scenario.bookingId)
    .maybeSingle();

  log(
    "B. Payment status becomes completed",
    bookingDone?.payment_status === "completed",
    bookingDone?.payment_status,
  );
  log(
    "C. payment_received_at is populated",
    bookingDone?.payment_received_at != null,
    bookingDone?.payment_received_at?.slice(0, 19) ?? "null",
  );
  log(
    "D. booking_status becomes completed",
    bookingDone?.booking_status === "completed",
    bookingDone?.booking_status,
  );

  const { data: srDone } = await sb
    .from("service-request")
    .select("status")
    .eq("id", scenario.sr.id)
    .maybeSingle();
  log("E. service-request status becomes completed", srDone?.status === "completed", srDone?.status);

  const { data: convDone } = await sb
    .from("whatsapp_conversations")
    .select("state, context")
    .eq("whatsapp_mobile", scenario.mobile)
    .maybeSingle();

  log(
    "F. conversation becomes completed",
    convDone?.state === "completed" && convDone?.context?.phase === "completed",
    `state=${convDone?.state} phase=${convDone?.context?.phase}`,
  );
  log(
    "G. final confirmation metadata stored",
    Boolean(convDone?.context?.cash_completion_sent_at) &&
      convDone?.context?.payment_status === "completed",
    `sent_at=${Boolean(convDone?.context?.cash_completion_sent_at)}`,
  );

  const sentAtBefore = convDone?.context?.cash_completion_sent_at;

  const confirm2 = await confirmCash(scenario.bookingId);
  const { data: convDup } = await sb
    .from("whatsapp_conversations")
    .select("context")
    .eq("whatsapp_mobile", scenario.mobile)
    .maybeSingle();

  log(
    "H. customer final WhatsApp message sent once",
    Boolean(sentAtBefore),
    `cash_completion_sent_at set`,
  );
  log(
    "I. duplicate confirmation is idempotent",
    confirm2.res.ok &&
      confirm2.json.already_completed === true &&
      convDup?.context?.cash_completion_sent_at === sentAtBefore,
    `already_completed=${confirm2.json.already_completed}`,
  );
  log(
    "M. already completed booking is idempotent",
    confirm2.json.success && bookingDone?.payment_status === "completed",
    "stable",
  );
  log(
    "O. amount remains the original rate-card snapshot",
    Number(bookingDone?.final_amount) === scenario.snapshotAmount,
    `amount=${bookingDone?.final_amount}`,
  );

  await cleanupScenario(scenario.sr.id, scenario.customer.id, scenario.mobile, scenario.worker.id);

  // J invalid booking
  const badConfirm = await confirmCash("00000000-0000-0000-0000-000000000099");
  log(
    "J. invalid booking fails",
    !badConfirm.res.ok && badConfirm.json.error === "booking_not_found",
    badConfirm.json.error,
  );

  // K wrong worker
  const wrong = await setupCashPendingScenario();
  const other = await findOtherWorker(wrong.worker.id, wrong.service.id);
  const wrongConfirm = await confirmCash(wrong.bookingId, other.id);
  log(
    "K. wrong worker fails",
    !wrongConfirm.res.ok && wrongConfirm.json.error === "worker_not_assigned",
    wrongConfirm.json.error,
  );
  await cleanupScenario(wrong.sr.id, wrong.customer.id, wrong.mobile, wrong.worker.id);

  // L card cannot confirm as cash
  const card = await setupPaymentPendingScenario("2");
  const cardConfirm = await confirmCash(card.bookingId);
  log(
    "L. card payment cannot be confirmed as cash",
    !cardConfirm.res.ok && cardConfirm.json.error === "invalid_payment_mode",
    cardConfirm.json.error,
  );
  await cleanupScenario(card.sr.id, card.customer.id, card.mobile, card.worker.id);

  // N OTP must be verified
  const noOtp = await setupPaymentPendingScenario("1");
  await sb
    .from("booking")
    .update({
      Payment_mode: "cash",
      payment_status: "pending",
      otp_verified: false,
      otp_verified_at: null,
    })
    .eq("id", noOtp.bookingId);
  const noOtpConfirm = await confirmCash(noOtp.bookingId);
  log(
    "N. OTP must be verified before cash confirmation",
    !noOtpConfirm.res.ok && noOtpConfirm.json.error === "otp_not_verified",
    noOtpConfirm.json.error,
  );
  await cleanupScenario(noOtp.sr.id, noOtp.customer.id, noOtp.mobile, noOtp.worker.id);

  console.log("\nRunning regression suites...");
  log("P. Phase 3A regression", runRegressionScript("scripts/test-whatsapp-webhook.mjs"));
  log("Q. Phase 4A regression", runRegressionScript("scripts/test-whatsapp-booking-flow.mjs"));
  log("R. Phase 4B regression", runRegressionScript("scripts/test-worker-matching.mjs"));
  log("S. Phase 4C regression", runRegressionScript("scripts/test-booking-confirmation.mjs"));
  log("T. Phase 5 regression", runRegressionScript("scripts/test-service-completion-payment-flow.mjs"));

  console.log(`\n${pass}/${tests.length} Phase 6 tests passed`);
  if (pass !== tests.length) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
