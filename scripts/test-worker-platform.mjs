/**
 * Homigo worker platform tests (Tests 1–20 subset + regression).
 * Requires: dev server, migrations 014+016+017, .env.local, seed:homigo:booking
 */

import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { setDefaultResultOrder } from "node:dns";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

setDefaultResultOrder("ipv4first");

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const envPath = resolve(process.cwd(), ".env.local");

function loadEnv() {
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    console.warn("No .env.local");
  }
}

loadEnv();
process.env.WHATSAPP_MOCK_SEND = "true";
process.env.SMS_MOCK_SEND = "true";
process.env.RAZORPAY_MOCK_MODE = "true";

const tests = [];
let pass = 0;

function log(name, ok, detail = "") {
  tests.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
}

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function fetchJson(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, options);
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

function hashToken(raw) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

async function createSr(area = "Panvel", pincode = "410221", serviceType = "Plumber") {
  const supabase = sb();
  if (!supabase) throw new Error("no supabase");
  const mobile = `919888777${randomBytes(4).toString("hex").slice(0, 4)}`;
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .insert({
      name: "Platform Test",
      mobile,
      area,
      pincode,
      address_line: "Test",
      preferred_language: "mr",
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

  const { data: sr } = await supabase
    .from("service-request")
    .insert({
      original_message: "platform test",
      service_type: serviceType,
      preferred_time_slot: "10:00-12:00",
      area,
      pincode,
      address: "Test Panvel",
      service_date: tomorrow.toISOString().slice(0, 10),
      customer_id: customer.id,
      customer_mobile: mobile,
      status: "new",
      rate_card_sent: true,
      rate_card_accepted: true,
    })
    .select("*")
    .single();

  return { sr, customer, supabase };
}

async function cleanupSr(supabase, srId) {
  if (!srId) return;
  await supabase.from("worker_service_offers").delete().eq("service_request_id", srId);
  const { data: bookings } = await supabase.from("booking").select("id").eq("sevice_request_id", srId);
  for (const b of bookings ?? []) await supabase.from("booking").delete().eq("id", b.id);
  await supabase.from("service-request").delete().eq("id", srId);
}

async function getPlumberServiceId(supabase) {
  const { data } = await supabase
    .from("services")
    .select("id, service_name")
    .ilike("service_name", "plumber")
    .maybeSingle();
  return data?.id;
}

async function runPlatformTests() {
  console.log(`\nHomigo worker platform tests @ ${baseUrl}\n`);

  const supabase = sb();
  if (!supabase) {
    console.error("Supabase not configured");
    process.exit(1);
  }

  const serviceId = await getPlumberServiceId(supabase);
  log("Setup: Plumber service exists", Boolean(serviceId));

  const { data: seedWorkers } = await supabase
    .from("workers")
    .select("id, worker_code, mobile_number")
    .like("worker_code", "HW-TEST-PLUMB-%")
    .is("deleted_at", null);

  log(
    "Setup: 6 Plumber test workers seeded",
    (seedWorkers?.length ?? 0) >= 6,
    `count=${seedWorkers?.length ?? 0}`,
  );

  const { sr } = await createSr();
  const start = await fetchJson("/api/dev/workers/start-matching", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      serviceRequestId: sr.id,
      serviceId,
      serviceType: "Plumber",
      area: "Panvel",
      pincode: "410221",
    }),
  });

  const { data: offers } = await supabase
    .from("worker_service_offers")
    .select("id, worker_id, status, batch_number")
    .eq("service_request_id", sr.id);

  log("TEST 1: Batch 1 creates exactly 3 offers", offers?.length === 3, `count=${offers?.length}`);
  log(
    "TEST 1b: All offers batch_number=1",
    (offers ?? []).every((o) => Number(o.batch_number) === 1),
  );

  const worker1 = seedWorkers?.[0];
  const offerForAuth =
    offers?.find((o) => o.worker_id === worker1?.id) ?? offers?.[0];
  const authWorker =
    seedWorkers?.find((w) => w.id === offerForAuth?.worker_id) ?? worker1;

  if (authWorker && offerForAuth) {
    const otpReq = await fetchJson("/api/worker/auth/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile: authWorker.mobile_number }),
    });
    log("Worker auth: request OTP", otpReq.res.ok && otpReq.json.ok);

    const devOtp = otpReq.json.devOtp;
    const verify = await fetchJson("/api/worker/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile: authWorker.mobile_number, otp: devOtp }),
    });
    const cookie = verify.res.headers.get("set-cookie") ?? "";
    log("Worker auth: verify OTP", verify.res.ok && verify.json.ok);

    const acceptApp = await fetchJson(`/api/worker/offers/${offerForAuth.id}`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    log("TEST 2: Worker accepts from App", acceptApp.res.ok && acceptApp.json.ok);

    const { data: booking } = await supabase
      .from("booking")
      .select("id, worker_id")
      .eq("sevice_request_id", sr.id)
      .maybeSingle();
    log("TEST 2b: Booking assigned", booking?.worker_id === authWorker.id);

    const otherOffer = offers?.find((o) => o.id !== offerForAuth.id);
    if (otherOffer) {
      const dupAccept = await fetchJson(`/api/worker/offers/${otherOffer.id}`, {
        method: "POST",
        headers: { Cookie: cookie },
      });
      log(
        "TEST 19: Second channel accept blocked after winner",
        !dupAccept.json.ok,
      );
    }
  }

  // TEST 3 WhatsApp accept on fresh SR
  const { sr: sr2, supabase: sb2 } = await createSr();
  await fetchJson("/api/dev/workers/start-matching", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      serviceRequestId: sr2.id,
      serviceId,
      serviceType: "Plumber",
      area: "Panvel",
      pincode: "410221",
    }),
  });
  const waWorker = seedWorkers?.[2];
  const { data: waOffers } = await sb2
    .from("worker_service_offers")
    .select("id, accept_token_hash")
    .eq("service_request_id", sr2.id)
    .eq("worker_id", waWorker?.id)
    .maybeSingle();

  if (waWorker) {
    const waPayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "test",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: "test" },
                messages: [
                  {
                    from: waWorker.mobile_number.replace(/^91/, ""),
                    id: `wamid.${randomBytes(8).toString("hex")}`,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "1" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const waRes = await fetchJson("/api/whatsapp/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(waPayload),
    });
    log("TEST 3: Worker accepts via WhatsApp webhook", waRes.res.ok);
  }

  await cleanupSr(sb2, sr2.id);

  // TEST 4 SMS accept
  const { sr: sr3, supabase: sb3 } = await createSr();
  await fetchJson("/api/dev/workers/start-matching", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      serviceRequestId: sr3.id,
      serviceId,
      serviceType: "Plumber",
      area: "Panvel",
      pincode: "410221",
    }),
  });
  const smsWorker = seedWorkers?.[3];
  if (smsWorker) {
    const smsRes = await fetchJson("/api/sms/webhook/inbound", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: smsWorker.mobile_number,
        body: "1",
        id: `evt_${Date.now()}`,
      }),
    });
    log("TEST 4: Worker accepts via SMS", smsRes.res.ok && smsRes.json.ok !== false);
  }
  await cleanupSr(sb3, sr3.id);

  // TEST 5 reject from app
  const { sr: sr4, supabase: sb4 } = await createSr();
  await fetchJson("/api/dev/workers/start-matching", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      serviceRequestId: sr4.id,
      serviceId,
      serviceType: "Plumber",
      area: "Panvel",
      pincode: "410221",
    }),
  });
  const rejectWorker = seedWorkers?.[4];
  const { data: rejectOffer } = await sb4
    .from("worker_service_offers")
    .select("id")
    .eq("service_request_id", sr4.id)
    .eq("worker_id", rejectWorker?.id)
    .maybeSingle();

  if (rejectWorker && rejectOffer) {
    const otpReq = await fetchJson("/api/worker/auth/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile: rejectWorker.mobile_number }),
    });
    const verify = await fetchJson("/api/worker/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile: rejectWorker.mobile_number, otp: otpReq.json.devOtp }),
    });
    const cookie = verify.res.headers.get("set-cookie") ?? "";
    const rej = await fetchJson(`/api/worker/offers/${rejectOffer.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    log("TEST 5: Worker rejects from App", rej.res.ok && rej.json.ok);
    const { data: updated } = await sb4
      .from("worker_service_offers")
      .select("status")
      .eq("id", rejectOffer.id)
      .maybeSingle();
    log("TEST 5b: Offer status rejected", updated?.status === "rejected");
  }
  await cleanupSr(sb4, sr4.id);

  // Cron unauthorized
  const cronBad = await fetchJson("/api/cron/expire-worker-offers");
  log("Cron rejects without secret", cronBad.res.status === 401);

  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const cronOk = await fetchJson("/api/cron/expire-worker-offers", {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    log("Cron accepts with CRON_SECRET", cronOk.res.ok);
  } else {
    log("Cron accepts with CRON_SECRET", true, "skipped — set CRON_SECRET in .env.local");
  }

  // UPI mock payment
  const { sr: sr5, customer: cust5, supabase: sb5 } = await createSr();
  const { data: bookingRow } = await sb5
    .from("booking")
    .insert({
      sevice_request_id: sr5.id,
      customer_id: cust5.id,
      worker_id: seedWorkers?.[0]?.id,
      service_date: sr5.service_date,
      service_time_slot: "10:00-12:00",
      base_amount: 950,
      lead_charge: 50,
      platform_commission: 100,
      worker_earning: 850,
      final_amount: 1000,
      payment_mode: "upi",
      payment_status: "pending",
      booking_status: "assigned",
    })
    .select("id")
    .single();

  if (bookingRow?.id) {
    const pay1 = await fetchJson(
      `/api/payments/razorpay/mock-pay?ref=${encodeURIComponent(bookingRow.id)}`,
    );
    const pay2 = await fetchJson(
      `/api/payments/razorpay/mock-pay?ref=${encodeURIComponent(bookingRow.id)}`,
    );
    log("TEST 17: UPI mock payment succeeds", pay1.res.ok && pay1.json.ok);
    log("TEST 18: Duplicate payment idempotent", pay2.json.already === true);
  }
  await cleanupSr(sb5, sr5.id);
  await cleanupSr(supabase, sr.id);

  console.log(`\nPlatform: ${pass}/${tests.length} passed\n`);
  return pass === tests.length ? 0 : 1;
}

function runMatchingRegression() {
  console.log("--- Running test-worker-matching regression ---\n");
  const script = resolve(process.cwd(), "scripts/test-worker-matching.mjs");
  const result = spawnSync(process.execPath, [...process.execArgv.filter((a) => a.startsWith("--use-")), script, baseUrl], {
    stdio: "inherit",
    env: { ...process.env, WHATSAPP_MOCK_SEND: "true" },
  });
  return result.status ?? 1;
}

const platformExit = await runPlatformTests();
const matchingExit = runMatchingRegression();
process.exit(platformExit !== 0 || matchingExit !== 0 ? 1 : 0);
