/**
 * Phase 5 — service completion OTP → payment selection → payment pending.
 * Requires: dev server, migrations 009–014, test Plumber worker, WHATSAPP_MOCK_SEND=true
 */

import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
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

  const mobile = `9199${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`.slice(0, 15);
  const { data: customer, error: customerError } = await sb
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

  if (customerError || !customer?.id) {
    throw new Error(`customer insert failed: ${customerError?.message ?? "unknown"}`);
  }

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

  const { data: assignedBooking } = await sb
    .from("booking")
    .select("booking_status, worker_id")
    .eq("id", acceptJson.booking_id)
    .maybeSingle();

  if (!assignedBooking?.worker_id) {
    throw new Error("Booking not assigned after worker accept");
  }

  const { data: assignedWorker } = await sb
    .from("workers")
    .select('id, pincode, area, is_available, is_verified, status')
    .eq("id", assignedBooking.worker_id)
    .maybeSingle();

  return {
    mobile,
    customer,
    sr,
    worker: assignedWorker ?? worker,
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

async function createWorkerSession(workerId) {
  const sb = supabaseClient();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
  await sb.from("worker_sessions").insert({
    worker_id: workerId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    last_seen_at: new Date().toISOString(),
  });
  return `homigo_worker_session=${encodeURIComponent(token)}`;
}

async function verifyOtpWorkerApi(bookingId, otp, sessionCookie, { retry = true } = {}) {
  let last = { res: null, json: {}, ok: false };
  const attempts = retry ? 5 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const res = await fetch(`${baseUrl}/api/worker/bookings/${bookingId}/verify-completion-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ otp }),
    });
    const json = await res.json().catch(() => ({}));
    last = { res, json, ok: res.ok && json.ok };
    if (last.ok) return last;
    if (res.status >= 400 && res.status < 500) return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  return last;
}

async function confirmCashWorkerApi(bookingId, sessionCookie) {
  const res = await fetch(`${baseUrl}/api/worker/bookings/${bookingId}/confirm-cash`, {
    method: "POST",
    headers: { Cookie: sessionCookie },
  });
  const json = await res.json().catch(() => ({}));
  return { res, json, ok: res.ok && json.ok };
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
  const workerSession = await createWorkerSession(scenario.worker.id);

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

  // F0 — customer OTP entry must NOT verify
  const customerOtpTry = await postWebhook(scenario.mobile, devOtp);
  const { data: bookingAfterCustomerOtp } = await sb
    .from("booking")
    .select("otp_verified")
    .eq("id", scenario.bookingId)
    .maybeSingle();
  log(
    "F0. Customer OTP entry does not verify",
    customerOtpTry.res.ok && bookingAfterCustomerOtp?.otp_verified !== true,
    `verified=${bookingAfterCustomerOtp?.otp_verified}`,
  );

  // F — worker verifies OTP via authenticated API
  const verifyRes = await verifyOtpWorkerApi(scenario.bookingId, devOtp, workerSession);
  const { data: bookingVerified } = await sb
    .from("booking")
    .select("otp_verified, otp_verified_at, Payment_mode")
    .eq("id", scenario.bookingId)
    .maybeSingle();
  const { data: convVerified } = await sb
    .from("whatsapp_conversations")
    .select("state, context")
    .eq("customer_id", scenario.customer.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  log(
    "F. Worker verifies OTP via authenticated API",
    verifyRes.ok &&
      bookingVerified?.otp_verified === true &&
      convVerified?.context?.phase === "payment_selection",
    `verified=${bookingVerified?.otp_verified} phase=${convVerified?.context?.phase ?? "none"} api=${verifyRes.json?.error ?? "ok"}`,
  );

  // L — cash selection (after worker OTP verified)
  for (let i = 0; i < 10; i++) {
    const { data: ready } = await sb
      .from("booking")
      .select("otp_verified")
      .eq("id", scenario.bookingId)
      .maybeSingle();
    if (ready?.otp_verified) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const cashRes = await postWebhook(scenario.mobile, "1");
  const { data: bookingCash } = await sb
    .from("booking")
    .select("Payment_mode, payment_status, payment_received_at, final_amount")
    .eq("id", scenario.bookingId)
    .maybeSingle();
  const { data: convCash } = await sb
    .from("whatsapp_conversations")
    .select("state, context")
    .eq("whatsapp_mobile", scenario.mobile)
    .maybeSingle();
  log(
    "L. Cash selection stores Payment_mode=cash and final_amount=1000",
    cashRes.res.ok &&
      bookingCash?.Payment_mode === "cash" &&
      convCash?.state === "payment_pending" &&
      Number(bookingCash?.final_amount) === 1000,
    `mode=${bookingCash?.Payment_mode} amount=${bookingCash?.final_amount}`,
  );
  log("N. Payment remains pending", bookingCash?.payment_status === "pending", bookingCash?.payment_status);
  log("O. payment_received_at remains null", bookingCash?.payment_received_at == null, "null");

  // L2 — worker confirms cash → booking completed
  const cashConfirm = await confirmCashWorkerApi(scenario.bookingId, workerSession);
  const { data: bookingCashDone } = await sb
    .from("booking")
    .select("payment_status, booking_status, payment_received_at, final_amount")
    .eq("id", scenario.bookingId)
    .maybeSingle();
  log(
    "L2. Worker cash confirm completes booking (₹1000)",
    cashConfirm.ok &&
      bookingCashDone?.payment_status === "completed" &&
      bookingCashDone?.booking_status === "completed" &&
      Number(bookingCashDone?.final_amount) === 1000,
    `status=${bookingCashDone?.payment_status}`,
  );

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

  // G — wrong OTP increments attempts (worker API)
  const wrongScenario = await setupConfirmedBooking("en");
  await requestOtp(wrongScenario.bookingId, wrongScenario.worker.id);
  const wrongSession = await createWorkerSession(wrongScenario.worker.id);
  await verifyOtpWorkerApi(wrongScenario.bookingId, "000000", wrongSession, { retry: false });
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

  // H — expired OTP rejected (worker API)
  const expScenario = await setupConfirmedBooking("en");
  const expOtpRes = await requestOtp(expScenario.bookingId, expScenario.worker.id);
  const expOtpJson = expOtpRes.json;
  const expSession = await createWorkerSession(expScenario.worker.id);
  const past = new Date(Date.now() - 60_000).toISOString();
  await sb
    .from("booking")
    .update({ otp_expires_at: past })
    .eq("id", expScenario.bookingId);
  const expVerify = await verifyOtpWorkerApi(
    expScenario.bookingId,
    expOtpJson.dev_otp,
    expSession,
  );
  const { data: bookingExp } = await sb
    .from("booking")
    .select("otp_verified")
    .eq("id", expScenario.bookingId)
    .maybeSingle();
  log(
    "H. Expired OTP rejected",
    !expVerify.ok && bookingExp?.otp_verified !== true,
    `verified=${bookingExp?.otp_verified}`,
  );
  await cleanupScenario(
    expScenario.sr.id,
    expScenario.customer.id,
    expScenario.mobile,
    expScenario.worker.id,
  );

  // I — attempt limit enforced (worker API)
  const limitScenario = await setupConfirmedBooking("en");
  await requestOtp(limitScenario.bookingId, limitScenario.worker.id);
  const limitSession = await createWorkerSession(limitScenario.worker.id);
  for (let i = 0; i < 5; i++) {
    await verifyOtpWorkerApi(limitScenario.bookingId, "111111", limitSession, { retry: false });
  }
  const { data: bookingLimit } = await sb
    .from("booking")
    .select("otp_attempts, otp_verified")
    .eq("id", limitScenario.bookingId)
    .maybeSingle();
  const limitVerify = await verifyOtpWorkerApi(limitScenario.bookingId, "222222", limitSession, {
    retry: false,
  });
  log(
    "I. Attempt limit enforced",
    bookingLimit?.otp_attempts >= 5 &&
      bookingLimit?.otp_verified !== true &&
      !limitVerify.ok,
    `attempts=${bookingLimit?.otp_attempts}`,
  );
  await cleanupScenario(
    limitScenario.sr.id,
    limitScenario.customer.id,
    limitScenario.mobile,
    limitScenario.worker.id,
  );

  // J — duplicate worker verify is idempotent
  const idemScenario = await setupConfirmedBooking("en");
  const idemOtp = await requestOtp(idemScenario.bookingId, idemScenario.worker.id);
  const idemOtpJson = idemOtp.json;
  const idemSession = await createWorkerSession(idemScenario.worker.id);
  await verifyOtpWorkerApi(idemScenario.bookingId, idemOtpJson.dev_otp, idemSession);
  const idemAgain = await verifyOtpWorkerApi(
    idemScenario.bookingId,
    idemOtpJson.dev_otp,
    idemSession,
  );
  const { data: bookingIdem } = await sb
    .from("booking")
    .select("otp_verified, otp_attempts")
    .eq("id", idemScenario.bookingId)
    .maybeSingle();
  log(
    "J. Duplicate worker OTP verify is idempotent",
    idemAgain.ok &&
      idemAgain.json.already_verified === true &&
      bookingIdem?.otp_verified === true &&
      (bookingIdem?.otp_attempts ?? 0) === 0,
    `verified=${bookingIdem?.otp_verified}`,
  );
  await cleanupScenario(
    idemScenario.sr.id,
    idemScenario.customer.id,
    idemScenario.mobile,
    idemScenario.worker.id,
  );

  // M — UPI selection + mock payment completes booking
  const upiScenario = await setupConfirmedBooking("en");
  const upiOtp = await requestOtp(upiScenario.bookingId, upiScenario.worker.id);
  const upiOtpJson = upiOtp.json;
  const upiSession = await createWorkerSession(upiScenario.worker.id);
  await verifyOtpWorkerApi(upiScenario.bookingId, upiOtpJson.dev_otp, upiSession);
  await postWebhook(upiScenario.mobile, "2");
  const { data: bookingUpi } = await sb
    .from("booking")
    .select("Payment_mode, payment_status, payment_received_at, final_amount, otp_verified")
    .eq("id", upiScenario.bookingId)
    .maybeSingle();
  log(
    "M. UPI selection stores Payment_mode=upi and final_amount=990",
    bookingUpi?.Payment_mode === "upi" &&
      bookingUpi?.payment_status === "pending" &&
      bookingUpi?.otp_verified === true &&
      Number(bookingUpi?.final_amount) === 990,
    `mode=${bookingUpi?.Payment_mode} amount=${bookingUpi?.final_amount}`,
  );
  log(
    "O2. payment_received_at null for UPI before webhook",
    bookingUpi?.payment_received_at == null,
    "null",
  );

  const upiPay = await fetch(
    `${baseUrl}/api/payments/razorpay/mock-pay?ref=${encodeURIComponent(upiScenario.bookingId)}`,
  );
  const upiPayJson = await upiPay.json().catch(() => ({}));
  const { data: bookingUpiDone } = await sb
    .from("booking")
    .select("payment_status, booking_status, final_amount")
    .eq("id", upiScenario.bookingId)
    .maybeSingle();
  log(
    "M2. UPI mock payment completes booking (₹990)",
    upiPay.ok &&
      upiPayJson.ok &&
      bookingUpiDone?.payment_status === "completed" &&
      bookingUpiDone?.booking_status === "completed" &&
      Number(bookingUpiDone?.final_amount) === 990,
    `status=${bookingUpiDone?.payment_status} err=${upiPayJson.error ?? "none"}`,
  );
  await cleanupScenario(
    upiScenario.sr.id,
    upiScenario.customer.id,
    upiScenario.mobile,
    upiScenario.worker.id,
  );

  // P — invalid payment option
  const invScenario = await setupConfirmedBooking("en");
  const invOtp = await requestOtp(invScenario.bookingId, invScenario.worker.id);
  const invOtpJson = invOtp.json;
  const invSession = await createWorkerSession(invScenario.worker.id);
  await verifyOtpWorkerApi(invScenario.bookingId, invOtpJson.dev_otp, invSession);
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

  // R — already verified OTP safe (worker re-verify)
  const reScenario = await setupConfirmedBooking("en");
  const reOtp = await requestOtp(reScenario.bookingId, reScenario.worker.id);
  const reOtpJson = reOtp.json;
  const reSession = await createWorkerSession(reScenario.worker.id);
  await verifyOtpWorkerApi(reScenario.bookingId, reOtpJson.dev_otp, reSession);
  await verifyOtpWorkerApi(reScenario.bookingId, "999999", reSession, { retry: false });
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

  // B2 — wrong worker cannot verify OTP
  const forbidScenario = await setupConfirmedBooking("en");
  await requestOtp(forbidScenario.bookingId, forbidScenario.worker.id);
  const forbidOtpJson = (await requestOtp(forbidScenario.bookingId, forbidScenario.worker.id)).json;
  const otherWorker = await findOtherWorker(forbidScenario.worker.id, forbidScenario.service.id);
  const otherSession = await createWorkerSession(otherWorker.id);
  const forbidVerify = await verifyOtpWorkerApi(
    forbidScenario.bookingId,
    forbidOtpJson.dev_otp ?? "123456",
    otherSession,
  );
  log(
    "B2. Wrong worker cannot verify OTP",
    forbidVerify.res.status === 403 || forbidVerify.json.error === "forbidden",
    forbidVerify.json.error,
  );
  await cleanupScenario(
    forbidScenario.sr.id,
    forbidScenario.customer.id,
    forbidScenario.mobile,
    forbidScenario.worker.id,
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
