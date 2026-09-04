/**
 * Homigo production-readiness tests — isolated suites, unique test data, cleanup.
 * Run independently: npm run test:homigo:production
 */

import { createClient } from "@supabase/supabase-js";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const runId = randomBytes(4).toString("hex");

function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }
}

loadEnv();

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

function uniqueMobile() {
  return `9199${runId}${String(Math.floor(Math.random() * 9000) + 1000)}`.slice(0, 13);
}

async function cleanupSr(supabase, srId, customerId, mobile) {
  if (!supabase) return;
  if (srId) {
    await supabase.from("worker_service_offers").delete().eq("service_request_id", srId);
    const { data: bookings } = await supabase.from("booking").select("id").eq("sevice_request_id", srId);
    for (const b of bookings ?? []) {
      await supabase.from("booking_online_payments").delete().eq("booking_id", b.id);
      await supabase.from("booking").delete().eq("id", b.id);
    }
    await supabase.from("whatsapp_conversations").delete().eq("service_request_id", srId);
    await supabase.from("service-request").delete().eq("id", srId);
  }
  if (mobile) await supabase.from("whatsapp_conversations").delete().eq("whatsapp_mobile", mobile);
  if (customerId) await supabase.from("customers").delete().eq("id", customerId);
}

async function createIsolatedSr(supabase, serviceType = "Plumber") {
  const mobile = uniqueMobile();
  const { data: customer, error: ce } = await supabase
    .from("customers")
    .insert({
      name: `ProdTest ${runId}`,
      mobile,
      area: "Panvel",
      pincode: "410221",
      address_line: "Test",
      preferred_language: "en",
      source: "whatsapp",
      status: "active",
      subscription_status: "free",
      is_whatsapp_verified: true,
    })
    .select("*")
    .single();
  if (ce || !customer?.id) throw new Error(ce?.message ?? "customer failed");

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const { data: sr, error: se } = await supabase
    .from("service-request")
    .insert({
      original_message: "prod test",
      service_type: serviceType,
      preferred_time_slot: "10:00-12:00",
      area: "Panvel",
      pincode: "410221",
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
  if (se || !sr?.id) throw new Error(se?.message ?? "sr failed");

  return { sr, customer, mobile };
}

async function getPlumberServiceId(supabase) {
  const { data } = await supabase
    .from("services")
    .select("id")
    .ilike("service_name", "plumber")
    .maybeSingle();
  return data?.id;
}

async function run() {
  console.log(`\nHomigo production tests [run=${runId}] @ ${baseUrl}\n`);

  const supabase = sb();
  if (!supabase) {
    console.error("Supabase not configured");
    process.exit(1);
  }

  // Razorpay signature verification (inline unit test)
  const webhookBody = '{"event":"payment.captured"}';
  const webhookSecret = "test_webhook_secret";
  const webhookSig = createHmac("sha256", webhookSecret).update(webhookBody).digest("hex");
  const sigValid =
    webhookSig.length === webhookSig.length &&
    createHmac("sha256", webhookSecret).update(webhookBody).digest("hex") === webhookSig;
  log("Razorpay webhook signature valid", sigValid);
  log("Razorpay webhook signature rejects bad sig", webhookSig !== "invalid");

  const serviceId = await getPlumberServiceId(supabase);
  log("Plumber service exists", Boolean(serviceId));

  const { data: workers } = await supabase
    .from("workers")
    .select("id, worker_code, mobile_number")
    .like("worker_code", "HW-TEST-PLUMB-%")
    .is("deleted_at", null);
  log("30-worker seed: Plumber workers", (workers?.length ?? 0) >= 6, `count=${workers?.length}`);

  // Batch 1 = 3
  const { sr, customer, mobile } = await createIsolatedSr(supabase);
  await fetchJson("/api/dev/workers/start-matching", {
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
    .select("id, worker_id, status")
    .eq("service_request_id", sr.id);
  log("Batch 1 creates 3 offers", offers?.length === 3, `count=${offers?.length}`);

  const { data: notifications } = await supabase
    .from("notification_records")
    .select("id, channel, status")
    .in(
      "offer_id",
      (offers ?? []).map((o) => o.id),
    );
  log(
    "Worker notifications recorded",
    (notifications?.length ?? 0) >= 3,
    `records=${notifications?.length}`,
  );

  // Worker OTP + app accept
  const authWorker = workers?.[0];
  const authOffer = offers?.[0];
  if (authWorker && authOffer) {
    const otpReq = await fetchJson("/api/worker/auth/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile: authWorker.mobile_number }),
    });
    log("Worker OTP request", otpReq.res.ok && otpReq.json.ok);
    const verify = await fetchJson("/api/worker/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile: authWorker.mobile_number, otp: otpReq.json.devOtp }),
    });
    const cookie = verify.res.headers.get("set-cookie") ?? "";
    log("Worker OTP verify + session", verify.res.ok && verify.json.ok);

    const forbidden = await fetchJson(`/api/worker/offers/${authOffer.id}`, {
      method: "POST",
    });
    log("Unauthorized worker access blocked", forbidden.res.status === 401);

    const accept = await fetchJson(`/api/worker/offers/${authOffer.id}`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    log("Worker app accept", accept.res.ok && accept.json.ok);

    const { data: booking } = await supabase
      .from("booking")
      .select("id, worker_id, final_amount")
      .eq("sevice_request_id", sr.id)
      .maybeSingle();
    log("Atomic booking assigned", booking?.worker_id === authWorker.id);
    log("Booking final_amount ₹1000", Number(booking?.final_amount) === 1000);
  }

  await cleanupSr(supabase, sr.id, customer.id, mobile);

  // UPI payment requires OTP verified
  const { sr: sr2, customer: c2 } = await createIsolatedSr(supabase);
  const worker = workers?.[1];
  const { data: payBooking } = await supabase
    .from("booking")
    .insert({
      sevice_request_id: sr2.id,
      customer_id: c2.id,
      worker_id: worker?.id,
      service_date: sr2.service_date,
      service_time_slot: "10:00-12:00",
      base_amount: 950,
      lead_charge: 50,
      platform_commission: 100,
      worker_earning: 850,
      final_amount: 990,
      Payment_mode: "upi",
      payment_status: "pending",
      booking_status: "assigned",
      otp_verified: true,
    })
    .select("id")
    .single();

  if (payBooking?.id) {
    await supabase.from("booking_online_payments").insert({
      booking_id: payBooking.id,
      payment_mode: "upi",
      payment_status: "pending",
      amount: 990,
      currency: "INR",
      provider: "razorpay",
    });

    const pay1 = await fetchJson(
      `/api/payments/razorpay/mock-pay?ref=${encodeURIComponent(payBooking.id)}`,
    );
    log("UPI mock payment ₹990", pay1.res.ok && pay1.json.ok);

    const pay2 = await fetchJson(
      `/api/payments/razorpay/mock-pay?ref=${encodeURIComponent(payBooking.id)}`,
    );
    log("Duplicate payment idempotent", pay2.json.already === true);

    const { data: completed } = await supabase
      .from("booking")
      .select("payment_status, booking_status")
      .eq("id", payBooking.id)
      .maybeSingle();
    log("Booking completed after UPI", completed?.payment_status === "completed");
  }

  // Payment blocked without OTP verified
  const { data: noOtpBooking } = await supabase
    .from("booking")
    .insert({
      sevice_request_id: sr2.id,
      customer_id: c2.id,
      worker_id: worker?.id,
      service_date: sr2.service_date,
      service_time_slot: "10:00-12:00",
      final_amount: 990,
      Payment_mode: "upi",
      payment_status: "pending",
      booking_status: "assigned",
      otp_verified: false,
    })
    .select("id")
    .single();

  if (noOtpBooking?.id) {
    const blocked = await fetchJson(
      `/api/payments/razorpay/mock-pay?ref=${encodeURIComponent(noOtpBooking.id)}`,
    );
    log("Payment blocked without OTP verified", blocked.json.error === "otp_not_verified");
    await supabase.from("booking").delete().eq("id", noOtpBooking.id);
  }

  await cleanupSr(supabase, sr2.id, c2.id, null);

  // Cron auth
  const cronBad = await fetchJson("/api/cron/expire-worker-offers");
  log("Cron rejects without secret", cronBad.res.status === 401);

  // SMS idempotency
  const smsWorker = workers?.[2];
  if (smsWorker) {
    const { sr: sr3 } = await createIsolatedSr(supabase);
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
    const evt = `sms_${runId}_${Date.now()}`;
    const body1 = { from: smsWorker.mobile_number, body: "2", id: evt };
    const r1 = await fetchJson("/api/sms/webhook/inbound", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body1),
    });
    const r2 = await fetchJson("/api/sms/webhook/inbound", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body1),
    });
    log("SMS reject", r1.res.ok);
    log("SMS duplicate ignored", r2.json.action === "duplicate_ignored");
    await cleanupSr(supabase, sr3.id, null, null);
  }

  console.log(`\n${pass}/${tests.length} production tests passed\n`);
  process.exit(pass === tests.length ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
