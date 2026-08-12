/**
 * Phase 5 — service completion OTP → payment selection → payment pending.
 * Requires: dev server, migrations 009–014, test Plumber worker, WHATSAPP_MOCK_SEND=true
 */

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
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

async function postWebhook(mobile, body, messageId = `wamid.p5.${Date.now()}.${Math.random()}`) {
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

async function setupConfirmedBooking(lang = "en") {
  const sb = supabaseClient();
  const { services } = await fetchServices();
  const service = services.find((s) => s.name.toLowerCase() === "plumber") ?? services[0];
  const worker = await findEligibleWorker(service.id);
  if (!worker) throw new Error("No eligible worker");

  await sb.from("workers").update({ is_available: true }).eq("id", worker.id);

  const mobile = `919999333${String(Date.now()).slice(-4)}`;
  const { data: customer } = await sb
    .from("customers")
    .insert({
      name: "P5 Completion Test",
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

  for (let i = 0; i < 10; i++) {
    const { data: b } = await sb
      .from("booking")
      .select("booking_status, worker_id")
      .eq("id", acceptJson.booking_id)
      .maybeSingle();
    if (b?.booking_status === "assigned" && b?.worker_id) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  return {
    mobile,
    customer,
    sr,
    worker,
    service,
    bookingId: acceptJson.booking_id,
  };
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
    if (lastRes.ok && lastJson.success) {
      return { res: lastRes, json: lastJson, ok: true };
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return { res: lastRes, json: lastJson, ok: false };
}

async function run() {
  console.log(`Phase 5 service completion + payment tests at ${baseUrl}\n`);

  const sb = supabaseClient();
  if (!sb) {
    console.error("Supabase not configured\n");
    process.exit(1);
  }

  const scenario = await setupConfirmedBooking("en");

  // A — assigned worker can request OTP
  const otpCall = await requestOtp(scenario.bookingId, scenario.worker.id);
  const otpJson = otpCall.json;
  log(
    "A. Assigned booking can request OTP",
    otpCall.ok && otpJson.success && otpJson.message_sent,
    `sent=${otpJson.message_sent} err=${otpJson.error ?? "none"}`,
  );

  const { data: bookingAfterOtp } = await sb
    .from("booking")
    .select("*")
    .eq("id", scenario.bookingId)
    .maybeSingle();

  // B — wrong worker cannot request OTP
  const other = await findOtherWorker(scenario.worker.id, scenario.service.id);
  const badWorkerCall = await requestOtp(scenario.bookingId, other.id);
  const badWorkerJson = badWorkerCall.json;
  log(
    "B. Wrong worker cannot request OTP",
    !badWorkerCall.ok && badWorkerJson.error === "worker_not_assigned",
    badWorkerJson.error,
  );

  // C — hash stored, raw not in DB
  const rawInDb =
    bookingAfterOtp?.service_completion_otp != null &&
    String(bookingAfterOtp.service_completion_otp).length === 6;
  log(
    "C. OTP hash stored, raw OTP not stored",
    Boolean(bookingAfterOtp?.completion_otp_hash) &&
      !rawInDb &&
      !bookingAfterOtp?.completion_otp_hash?.includes(otpJson.dev_otp ?? "XXXXXX"),
    `hash=${bookingAfterOtp?.completion_otp_hash?.slice(0, 8)}…`,
  );

  // D — expiry set (~10 min)
  const genAt = new Date(bookingAfterOtp.otp_generated_at).getTime();
  const expAt = new Date(bookingAfterOtp.otp_expires_at).getTime();
  const ttlMin = (expAt - genAt) / 60000;
  log(
    "D. OTP expiry is set",
    ttlMin >= 9 && ttlMin <= 11,
    `ttl=${ttlMin.toFixed(1)}m`,
  );

  // E — mock OTP available in dev context
  const { data: convOtp } = await sb
    .from("whatsapp_conversations")
    .select("state, context")
    .eq("whatsapp_mobile", scenario.mobile)
    .maybeSingle();
  log(
    "E. Customer receives mocked OTP message",
    convOtp?.state === "service_completion" &&
      convOtp?.context?.phase === "otp_pending" &&
      Boolean(convOtp?.context?.dev_completion_otp ?? otpJson.dev_otp),
    `dev_otp=${Boolean(otpJson.dev_otp)}`,
  );

  const devOtp = otpJson.dev_otp ?? convOtp?.context?.dev_completion_otp;

  // K prep — payment menu NOT before OTP
  const prePay = await postWebhook(scenario.mobile, "1");
  const { data: bookingPrePay } = await sb
    .from("booking")
    .select("Payment_mode, otp_verified")
    .eq("id", scenario.bookingId)
    .maybeSingle();
  log(
    "K. Payment menu blocked before OTP verification",
    prePay.res.ok && !bookingPrePay?.Payment_mode && bookingPrePay?.otp_verified !== true,
    `mode=${bookingPrePay?.Payment_mode ?? "null"}`,
  );

  // F — correct OTP verifies
  const verifyRes = await postWebhook(scenario.mobile, devOtp);
  const { data: bookingVerified } = await sb
    .from("booking")
    .select("otp_verified, otp_verified_at, Payment_mode")
    .eq("id", scenario.bookingId)
    .maybeSingle();
  const { data: convVerified } = await sb
    .from("whatsapp_conversations")
    .select("state, context")
    .eq("whatsapp_mobile", scenario.mobile)
    .maybeSingle();
  log(
    "F. Correct OTP verifies",
    verifyRes.res.ok &&
      bookingVerified?.otp_verified === true &&
      convVerified?.context?.phase === "payment_selection",
    `verified=${bookingVerified?.otp_verified}`,
  );

  // L — cash selection
  const cashRes = await postWebhook(scenario.mobile, "1");
  const { data: bookingCash } = await sb
    .from("booking")
    .select("Payment_mode, payment_status, payment_received_at")
    .eq("id", scenario.bookingId)
    .maybeSingle();
  const { data: convCash } = await sb
    .from("whatsapp_conversations")
    .select("state, context")
    .eq("whatsapp_mobile", scenario.mobile)
    .maybeSingle();
  log(
    "L. Cash selection stores Payment_mode=cash",
    cashRes.res.ok &&
      bookingCash?.Payment_mode === "cash" &&
      convCash?.state === "payment_pending",
    `mode=${bookingCash?.Payment_mode}`,
  );
  log("N. Payment remains pending", bookingCash?.payment_status === "pending", bookingCash?.payment_status);
  log("O. payment_received_at remains null", bookingCash?.payment_received_at == null, "null");

  // Q — duplicate payment selection safe
  const dupPayMsg = `wamid.p5.duppay.${Date.now()}`;
  await postWebhook(scenario.mobile, "2", dupPayMsg);
  await postWebhook(scenario.mobile, "2", dupPayMsg);
  const { data: bookingDupPay } = await sb
    .from("booking")
    .select("Payment_mode")
    .eq("id", scenario.bookingId)
    .maybeSingle();
  log(
    "Q. Duplicate payment selection handled safely",
    bookingDupPay?.Payment_mode === "cash",
    `mode=${bookingDupPay?.Payment_mode}`,
  );

  await cleanupScenario(scenario.sr.id, scenario.customer.id, scenario.mobile, scenario.worker.id);

  // G — wrong OTP increments attempts
  const wrongScenario = await setupConfirmedBooking("en");
  await requestOtp(wrongScenario.bookingId, wrongScenario.worker.id);
  await postWebhook(wrongScenario.mobile, "000000");
  const { data: bookingWrong } = await sb
    .from("booking")
    .select("otp_attempts, otp_verified")
    .eq("id", wrongScenario.bookingId)
    .maybeSingle();
  log(
    "G. Wrong OTP increments attempts",
    bookingWrong?.otp_attempts === 1 && bookingWrong?.otp_verified !== true,
    `attempts=${bookingWrong?.otp_attempts}`,
  );
  await cleanupScenario(
    wrongScenario.sr.id,
    wrongScenario.customer.id,
    wrongScenario.mobile,
    wrongScenario.worker.id,
  );

  // H — expired OTP rejected
  const expScenario = await setupConfirmedBooking("en");
  const expOtpRes = await requestOtp(expScenario.bookingId, expScenario.worker.id);
  const expOtpJson = expOtpRes.json;
  const past = new Date(Date.now() - 60_000).toISOString();
  await sb
    .from("booking")
    .update({ otp_expires_at: past })
    .eq("id", expScenario.bookingId);
  const expVerify = await postWebhook(expScenario.mobile, expOtpJson.dev_otp);
  const { data: bookingExp } = await sb
    .from("booking")
    .select("otp_verified")
    .eq("id", expScenario.bookingId)
    .maybeSingle();
  log(
    "H. Expired OTP rejected",
    expVerify.res.ok && bookingExp?.otp_verified !== true,
    `verified=${bookingExp?.otp_verified}`,
  );
  await cleanupScenario(
    expScenario.sr.id,
    expScenario.customer.id,
    expScenario.mobile,
    expScenario.worker.id,
  );

  // I — attempt limit enforced
  const limitScenario = await setupConfirmedBooking("en");
  await requestOtp(limitScenario.bookingId, limitScenario.worker.id);
  for (let i = 0; i < 5; i++) {
    await postWebhook(limitScenario.mobile, "111111");
  }
  const { data: bookingLimit } = await sb
    .from("booking")
    .select("otp_attempts, otp_verified")
    .eq("id", limitScenario.bookingId)
    .maybeSingle();
  const limitVerify = await postWebhook(limitScenario.mobile, "222222");
  log(
    "I. Attempt limit enforced",
    bookingLimit?.otp_attempts >= 5 &&
      bookingLimit?.otp_verified !== true &&
      limitVerify.res.ok,
    `attempts=${bookingLimit?.otp_attempts}`,
  );
  await cleanupScenario(
    limitScenario.sr.id,
    limitScenario.customer.id,
    limitScenario.mobile,
    limitScenario.worker.id,
  );

  // J — duplicate OTP webhook idempotent
  const idemScenario = await setupConfirmedBooking("en");
  const idemOtp = await requestOtp(idemScenario.bookingId, idemScenario.worker.id);
  const idemOtpJson = idemOtp.json;
  const dupOtpMsg = `wamid.p5.dupotp.${Date.now()}`;
  await postWebhook(idemScenario.mobile, idemOtpJson.dev_otp, dupOtpMsg);
  await postWebhook(idemScenario.mobile, idemOtpJson.dev_otp, dupOtpMsg);
  const { data: bookingIdem } = await sb
    .from("booking")
    .select("otp_verified, otp_attempts")
    .eq("id", idemScenario.bookingId)
    .maybeSingle();
  log(
    "J. Duplicate OTP webhook is idempotent",
    bookingIdem?.otp_verified === true && (bookingIdem?.otp_attempts ?? 0) === 0,
    `verified=${bookingIdem?.otp_verified}`,
  );
  await cleanupScenario(
    idemScenario.sr.id,
    idemScenario.customer.id,
    idemScenario.mobile,
    idemScenario.worker.id,
  );

  // M — card selection
  const cardScenario = await setupConfirmedBooking("en");
  const cardOtp = await requestOtp(cardScenario.bookingId, cardScenario.worker.id);
  const cardOtpJson = cardOtp.json;
  await postWebhook(cardScenario.mobile, cardOtpJson.dev_otp);
  await postWebhook(cardScenario.mobile, "2");
  const { data: bookingCard } = await sb
    .from("booking")
    .select("Payment_mode, payment_status, payment_received_at")
    .eq("id", cardScenario.bookingId)
    .maybeSingle();
  log(
    "M. Card selection stores Payment_mode=card",
    bookingCard?.Payment_mode === "card" && bookingCard?.payment_status === "pending",
    `mode=${bookingCard?.Payment_mode}`,
  );
  log(
    "O2. payment_received_at null for card",
    bookingCard?.payment_received_at == null,
    "null",
  );
  await cleanupScenario(
    cardScenario.sr.id,
    cardScenario.customer.id,
    cardScenario.mobile,
    cardScenario.worker.id,
  );

  // P — invalid payment option
  const invScenario = await setupConfirmedBooking("en");
  const invOtp = await requestOtp(invScenario.bookingId, invScenario.worker.id);
  const invOtpJson = invOtp.json;
  await postWebhook(invScenario.mobile, invOtpJson.dev_otp);
  await postWebhook(invScenario.mobile, "9");
  const { data: bookingInv } = await sb
    .from("booking")
    .select("Payment_mode")
    .eq("id", invScenario.bookingId)
    .maybeSingle();
  const { data: convInv } = await sb
    .from("whatsapp_conversations")
    .select("state, context")
    .eq("whatsapp_mobile", invScenario.mobile)
    .maybeSingle();
  log(
    "P. Invalid payment option handled",
    !bookingInv?.Payment_mode && convInv?.context?.phase === "payment_selection",
    `mode=${bookingInv?.Payment_mode ?? "null"}`,
  );
  await cleanupScenario(
    invScenario.sr.id,
    invScenario.customer.id,
    invScenario.mobile,
    invScenario.worker.id,
  );

  // R — already verified OTP safe
  const reScenario = await setupConfirmedBooking("en");
  const reOtp = await requestOtp(reScenario.bookingId, reScenario.worker.id);
  const reOtpJson = reOtp.json;
  await postWebhook(reScenario.mobile, reOtpJson.dev_otp);
  await postWebhook(reScenario.mobile, "999999");
  const { data: bookingRe } = await sb
    .from("booking")
    .select("otp_verified, otp_attempts")
    .eq("id", reScenario.bookingId)
    .maybeSingle();
  log(
    "R. Already verified OTP handled safely",
    bookingRe?.otp_verified === true && (bookingRe?.otp_attempts ?? 0) === 0,
    `attempts=${bookingRe?.otp_attempts}`,
  );
  await cleanupScenario(
    reScenario.sr.id,
    reScenario.customer.id,
    reScenario.mobile,
    reScenario.worker.id,
  );

  // Idempotent OTP request
  const idemReq = await setupConfirmedBooking("en");
  const firstReq = await requestOtp(idemReq.bookingId, idemReq.worker.id);
  const firstJson = firstReq.json;
  const secondReq = await requestOtp(idemReq.bookingId, idemReq.worker.id);
  const secondJson = secondReq.json;
  const hashBefore = createHash("sha256").update(String(firstJson.dev_otp)).digest("hex");
  const { data: bookingIdemReq } = await sb
    .from("booking")
    .select("completion_otp_hash")
    .eq("id", idemReq.bookingId)
    .maybeSingle();
  log(
    "Idempotent OTP request (bonus)",
    secondJson.already_sent === true && bookingIdemReq?.completion_otp_hash === hashBefore,
    `already_sent=${secondJson.already_sent}`,
  );
  await cleanupScenario(
    idemReq.sr.id,
    idemReq.customer.id,
    idemReq.mobile,
    idemReq.worker.id,
  );

  console.log("\nRunning regression suites...");
  log("S. Phase 3A regression", runRegressionScript("scripts/test-whatsapp-webhook.mjs"));
  log("T. Phase 4A regression", runRegressionScript("scripts/test-whatsapp-booking-flow.mjs"));
  log("U. Phase 4B regression", runRegressionScript("scripts/test-worker-matching.mjs"));
  log("V. Phase 4C regression", runRegressionScript("scripts/test-booking-confirmation.mjs"));

  console.log(`\n${pass}/${tests.length} Phase 5 tests passed`);
  if (pass !== tests.length) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
