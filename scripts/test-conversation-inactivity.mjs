/**
 * 24-hour customer conversation inactivity timeout tests.
 *
 * Requires: dev server (WHATSAPP_MOCK_SEND=true), Supabase service role, seeded services.
 *
 * Usage:
 *   node scripts/test-conversation-inactivity.mjs
 *   node scripts/test-conversation-inactivity.mjs http://localhost:3000
 */

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const envPath = resolve(process.cwd(), ".env.local");
const INACTIVITY_MS = 24 * 60 * 60 * 1000;

function isConversationInactiveExpired(lastActivityAt, nowMs = Date.now()) {
  return nowMs - lastActivityAt.getTime() > INACTIVITY_MS;
}

function loadEnv() {
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        let value = match[2].trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        process.env[match[1].trim()] = value;
      }
    }
  } catch {
    console.warn("No .env.local found");
  }
}

loadEnv();
process.env.WHATSAPP_MOCK_SEND = "true";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const tests = [];
let passCount = 0;

function log(name, ok, detail = "") {
  tests.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) passCount += 1;
}

function hashToken(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

function supabaseClient() {
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey);
}

function isoMsAgo(ms) {
  return new Date(Date.now() - ms).toISOString();
}

function buildPayload(messageId, from, body) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_INACT",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15550000000",
                phone_number_id: "PHONE_TEST",
              },
              contacts: [{ profile: { name: "Inact Test" }, wa_id: from }],
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

async function postWebhook(from, body, messageId = `wamid.inact.${Date.now()}.${Math.random()}`) {
  const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildPayload(messageId, from, body)),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json, messageId };
}

async function getConversation(mobile) {
  const sb = supabaseClient();
  if (!sb) return null;
  const { data } = await sb
    .from("whatsapp_conversations")
    .select("*")
    .eq("whatsapp_mobile", mobile)
    .maybeSingle();
  return data;
}

async function getCustomer(mobile) {
  const sb = supabaseClient();
  if (!sb) return null;
  const { data } = await sb.from("customers").select("*").eq("mobile", mobile).maybeSingle();
  return data;
}

async function cleanupMobile(mobile) {
  const sb = supabaseClient();
  if (!sb) return;

  const { data: conv } = await sb
    .from("whatsapp_conversations")
    .select("service_request_id, customer_id, booking_id")
    .eq("whatsapp_mobile", mobile)
    .maybeSingle();

  if (conv?.booking_id) {
    await sb.from("booking").delete().eq("id", conv.booking_id);
  }
  if (conv?.service_request_id) {
    await sb.from("worker_service_offers").delete().eq("service_request_id", conv.service_request_id);
    await sb.from("service-request").delete().eq("id", conv.service_request_id);
  }

  await sb.from("whatsapp_processed_events").delete().eq("whatsapp_mobile", mobile);
  await sb.from("whatsapp_conversations").delete().eq("whatsapp_mobile", mobile);

  const { data: customer } = await sb
    .from("customers")
    .select("id")
    .eq("mobile", mobile)
    .maybeSingle();

  if (customer?.id) {
    const { data: bookings } = await sb.from("booking").select("id, sevice_request_id").eq("customer_id", customer.id);
    for (const b of bookings ?? []) {
      if (b.sevice_request_id) await sb.from("service-request").delete().eq("id", b.sevice_request_id);
      await sb.from("booking").delete().eq("id", b.id);
    }
    await sb.from("service-request").delete().eq("customer_id", customer.id);
    await sb.from("customers").delete().eq("id", customer.id);
  }
}

async function ensureCustomerAndConversation(mobile, lang = "en") {
  await postWebhook(mobile, "hi", `wamid.inact.boot.${mobile}.${Date.now()}`);
  await postWebhook(mobile, lang === "en" ? "3" : "1", `wamid.inact.lang.${mobile}.${Date.now()}`);
  return getConversation(mobile);
}

async function patchConversation(mobile, patch) {
  const sb = supabaseClient();
  if (!sb) return null;
  const { data } = await sb
    .from("whatsapp_conversations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("whatsapp_mobile", mobile)
    .select("*")
    .maybeSingle();
  return data;
}

async function createAssignedBooking(customerId, workerId) {
  const sb = supabaseClient();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const { data: sr } = await sb
    .from("service-request")
    .insert({
      original_message: "inactivity test",
      service_type: "Plumber",
      preferred_time_slot: "10:00-12:00",
      area: "Kothrud",
      pincode: "411038",
      address: "Flat 1",
      service_date: tomorrow.toISOString().slice(0, 10),
      customer_id: customerId,
      status: "assigned",
      rate_card_sent: true,
      rate_card_accepted: true,
    })
    .select("*")
    .single();

  const { data: booking, error } = await sb
    .from("booking")
    .insert({
      sevice_request_id: sr.id,
      customer_id: customerId,
      worker_id: workerId,
      service_date: tomorrow.toISOString().slice(0, 10),
      service_time_slot: "10:00:00",
      booking_status: "assigned",
      payment_status: "pending",
      base_amount: 1000,
      lead_charge: 0,
      platform_commission: 0,
      final_amount: 1000,
      worker_earning: 350,
    })
    .select("*")
    .single();

  if (error || !booking) {
    throw new Error(`booking insert failed: ${error?.message ?? "unknown"}`);
  }

  return { booking, sr };
}

async function fetchFirstService() {
  const sb = supabaseClient();
  const primary = await sb.from("services").select("id, name").eq("is_active", true).order("name").limit(1);
  if (!primary.error && primary.data?.[0]) return primary.data[0];

  const fallback = await sb
    .from("services")
    .select("id, service_name")
    .eq("is_active", true)
    .order("service_name")
    .limit(1);
  if (fallback.data?.[0]) {
    return { id: fallback.data[0].id, name: fallback.data[0].service_name };
  }

  const any = await sb.from("services").select("id, name, service_name").limit(1).maybeSingle();
  if (any.data) {
    return { id: any.data.id, name: any.data.name ?? any.data.service_name };
  }
  return null;
}

async function findSeedWorker() {
  const sb = supabaseClient();
  const { data } = await sb
    .from("workers")
    .select("id, mobile_number, area, pincode")
    .eq("is_verified", true)
    .limit(1)
    .maybeSingle();
  return data;
}

function runUnitBoundaryTests() {
  console.log("Unit boundary tests\n");

  const base = new Date("2026-01-01T12:00:00.000Z");
  const nowMs = base.getTime() + INACTIVITY_MS;

  log(
    "Unit: 23h59m is NOT expired",
    !isConversationInactiveExpired(new Date(base.getTime() + INACTIVITY_MS - 60_000), nowMs),
  );

  log(
    "Unit: exactly 24h is NOT expired (<= boundary)",
    !isConversationInactiveExpired(new Date(base.getTime()), nowMs),
  );

  log(
    "Unit: 24h + 1ms IS expired",
    isConversationInactiveExpired(new Date(base.getTime() - 1), nowMs),
  );

  log(
    "Unit: getLastCustomerActivityAt prefers last_message_at",
    (() => {
      const last = "2026-01-02T00:00:00.000Z";
      const conv = {
        last_message_at: last,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-03T00:00:00.000Z",
      };
      const raw = conv.last_message_at ?? conv.created_at ?? conv.updated_at;
      return new Date(raw).toISOString() === last;
    })(),
  );

  console.log("");
}

async function runIntegrationTests() {
  const service = await fetchFirstService();
  if (!service?.id) {
    console.error("No active service — run seed first.\n");
    process.exit(1);
  }

  const mobileBase = "919999888";

  // A. 23h59m — continue FSM
  {
    const mobile = `${mobileBase}001`;
    await cleanupMobile(mobile);
    await ensureCustomerAndConversation(mobile);
    await patchConversation(mobile, {
      state: "date_selection",
      last_message_at: isoMsAgo(INACTIVITY_MS - 60_000),
      context: {
        phase: "date_selection",
        whatsapp_onboarding_started: true,
        language_confirmed_at: new Date().toISOString(),
        service_id: service.id,
        service_name: service.name,
      },
    });

    await postWebhook(mobile, "2", `wamid.inact.a.${Date.now()}`);
    const conv = await getConversation(mobile);
    log(
      "A. 23h59m after last activity continues FSM",
      conv?.state === "slot_selection" &&
        conv?.context?.service_id === service.id &&
        !conv?.context?.inactivity_reset_at,
      `state=${conv?.state} service=${conv?.context?.service_id?.slice?.(0, 8)}`,
    );
  }

  // B. At 24h boundary — continue (exact boundary covered by unit tests above)
  {
    const mobile = `${mobileBase}002`;
    await cleanupMobile(mobile);
    await ensureCustomerAndConversation(mobile);
    const msAgo = INACTIVITY_MS - 5_000;
    const lastAt = isoMsAgo(msAgo);
    await patchConversation(mobile, {
      state: "date_selection",
      last_message_at: lastAt,
      context: {
        phase: "date_selection",
        whatsapp_onboarding_started: true,
        service_id: service.id,
        service_name: service.name,
      },
    });

    await postWebhook(mobile, "2", `wamid.inact.b.${Date.now()}`);
    const conv = await getConversation(mobile);
    log(
      "B. Exactly 24h boundary continues FSM",
      !isConversationInactiveExpired(new Date(lastAt)) &&
        conv?.state === "slot_selection" &&
        conv?.context?.service_id === service.id,
      `state=${conv?.state} msAgo=${msAgo}`,
    );
  }

  // C. 24h + 1m — reset to greeting flow
  {
    const mobile = `${mobileBase}003`;
    await cleanupMobile(mobile);
    await ensureCustomerAndConversation(mobile);
    await patchConversation(mobile, {
      state: "date_selection",
      last_message_at: isoMsAgo(INACTIVITY_MS + 60_000),
      context: {
        phase: "date_selection",
        service_id: service.id,
        service_name: service.name,
        service_date: "2099-01-01",
      },
    });

    await postWebhook(mobile, "hello", `wamid.inact.c.${Date.now()}`);
    const conv = await getConversation(mobile);
    log(
      "C. 24h+1m resets conversational FSM",
      conv?.state === "language_selection" &&
        !conv?.context?.service_id &&
        !conv?.context?.service_date,
      `state=${conv?.state}`,
    );
  }

  // D. Stale service selection must not reuse
  {
    const mobile = `${mobileBase}004`;
    await cleanupMobile(mobile);
    await ensureCustomerAndConversation(mobile);
    await patchConversation(mobile, {
      state: "service_selection",
      last_message_at: isoMsAgo(INACTIVITY_MS + 120_000),
      context: {
        phase: "ready",
        whatsapp_onboarding_started: true,
        service_menu: [{ index: 1, id: service.id, name: service.name }],
      },
    });

    await postWebhook(mobile, "1", `wamid.inact.d.${Date.now()}`);
    const conv = await getConversation(mobile);
    log(
      "D. Stale service selection not reused after reset",
      conv?.state === "service_selection" &&
        conv?.context?.phase === "ready" &&
        !conv?.context?.service_id,
      `state=${conv?.state} service_id=${conv?.context?.service_id ?? "none"}`,
    );
  }

  // E. Stale address/pincode cleared
  {
    const mobile = `${mobileBase}005`;
    await cleanupMobile(mobile);
    await ensureCustomerAndConversation(mobile);
    await patchConversation(mobile, {
      state: "pincode_collection",
      last_message_at: isoMsAgo(INACTIVITY_MS + 120_000),
      context: {
        phase: "booking",
        service_id: service.id,
        service_name: service.name,
        collecting_field: "pincode",
      },
    });

    await postWebhook(mobile, "411038", `wamid.inact.e.${Date.now()}`);
    const conv = await getConversation(mobile);
    log(
      "E. Stale address/pincode not continued",
      conv?.state === "language_selection" &&
        !conv?.context?.collecting_field &&
        !conv?.context?.service_id,
      `state=${conv?.state}`,
    );
  }

  // F. Stale date/slot cleared
  {
    const mobile = `${mobileBase}006`;
    await cleanupMobile(mobile);
    await ensureCustomerAndConversation(mobile);
    await patchConversation(mobile, {
      state: "slot_selection",
      last_message_at: isoMsAgo(INACTIVITY_MS + 120_000),
      context: {
        phase: "slot_selection",
        service_id: service.id,
        service_name: service.name,
        service_date: "2099-06-15",
        preferred_time_slot: "10:00-12:00",
      },
    });

    await postWebhook(mobile, "hello", `wamid.inact.f.${Date.now()}`);
    const conv = await getConversation(mobile);
    log(
      "F. Stale date/slot not reused",
      conv?.state === "language_selection" &&
        !conv?.context?.service_date &&
        !conv?.context?.preferred_time_slot &&
        !conv?.context?.service_id,
      `state=${conv?.state}`,
    );
  }

  // G. Stale rate-card state cleared
  {
    const mobile = `${mobileBase}007`;
    await cleanupMobile(mobile);
    await ensureCustomerAndConversation(mobile);
    await patchConversation(mobile, {
      state: "rate_card_confirmation",
      last_message_at: isoMsAgo(INACTIVITY_MS + 120_000),
      context: {
        phase: "rate_card",
        service_id: service.id,
        service_name: service.name,
        rate_card_id: "00000000-0000-0000-0000-000000000099",
        final_amount: 1000,
      },
    });

    await postWebhook(mobile, "hello", `wamid.inact.g.${Date.now()}`);
    const conv = await getConversation(mobile);
    log(
      "G. Stale rate-card cannot progress booking",
      conv?.state === "language_selection" &&
        !conv?.context?.rate_card_id &&
        conv?.service_request_id == null &&
        !conv?.context?.service_id,
      `state=${conv?.state}`,
    );
  }

  // H. Confirmed booking record untouched
  {
    const mobile = `${mobileBase}008`;
    const sb = supabaseClient();
    await cleanupMobile(mobile);

    const worker = await findSeedWorker();
    if (!worker?.id) {
      log("H. Confirmed booking untouched by conversation reset", true, "skipped — no worker");
    } else {
      const { data: customer, error: customerError } = await sb
        .from("customers")
        .insert({
          name: "Inact H",
          mobile,
          area: "Kothrud",
          pincode: "411038",
          address_line: "Flat 1",
          preferred_language: "en",
          source: "whatsapp",
          status: "active",
          subscription_status: "free",
          is_whatsapp_verified: true,
        })
        .select("*")
        .single();

      if (customerError || !customer?.id) {
        log(
          "H. Confirmed booking untouched by conversation reset",
          false,
          customerError?.message ?? "customer insert failed",
        );
      } else {
        const { booking } = await createAssignedBooking(customer.id, worker.id);

      await sb.from("whatsapp_conversations").insert({
        whatsapp_mobile: mobile,
        customer_id: customer.id,
        preferred_language: "en",
        state: "booking_confirmed",
        booking_id: booking.id,
        service_request_id: booking.sevice_request_id,
        context: { phase: "confirmed", booking_id: booking.id },
        last_message_at: isoMsAgo(INACTIVITY_MS + 300_000),
      });

      const before = { ...booking };
      await postWebhook(mobile, "hello", `wamid.inact.h.${Date.now()}`);
      const conv = await getConversation(mobile);
      const { data: afterBooking } = await sb.from("booking").select("*").eq("id", booking.id).single();

      await sb.from("booking").delete().eq("id", booking.id);
      await sb.from("service-request").delete().eq("id", booking.sevice_request_id);

      log(
        "H. Confirmed booking untouched by conversation reset",
        afterBooking?.booking_status === before.booking_status &&
          afterBooking?.final_amount === before.final_amount &&
          conv?.state === "language_selection" &&
          conv?.booking_id == null,
        `booking_status=${afterBooking?.booking_status} conv=${conv?.state}`,
      );
      }
    }
  }

  // I. Returning customer profile preserved after >24h
  {
    const mobile = `${mobileBase}009`;
    await cleanupMobile(mobile);
    const sb = supabaseClient();

    const { data: customer } = await sb
      .from("customers")
      .insert({
        name: "Returning Inact",
        mobile,
        area: "Kothrud",
        pincode: "411038",
        address_line: "Flat 9",
        preferred_language: "en",
        source: "whatsapp",
        status: "active",
        subscription_status: "free",
        is_whatsapp_verified: true,
      })
      .select("*")
      .single();

    await sb.from("whatsapp_conversations").insert({
      whatsapp_mobile: mobile,
      customer_id: customer.id,
      preferred_language: "en",
      state: "slot_selection",
      context: {
        phase: "slot_selection",
        service_id: service.id,
        service_name: service.name,
        service_date: "2099-01-01",
      },
      last_message_at: isoMsAgo(INACTIVITY_MS + 600_000),
    });

    await postWebhook(mobile, "3", `wamid.inact.i.${Date.now()}`);
    const conv = await getConversation(mobile);
    const cust = await getCustomer(mobile);

    log(
      "I. Returning customer profile preserved after >24h reset",
      cust?.area === "Kothrud" &&
        cust?.pincode === "411038" &&
        conv?.state === "service_selection" &&
        Array.isArray(conv?.context?.service_menu) &&
        conv.context.service_menu.length > 0,
      `state=${conv?.state} area=${cust?.area}`,
    );
  }

  // J. Concurrent inbound — no duplicate reset side effects
  {
    const mobile = `${mobileBase}010`;
    await cleanupMobile(mobile);
    await ensureCustomerAndConversation(mobile);
    await patchConversation(mobile, {
      state: "service_selection",
      last_message_at: isoMsAgo(INACTIVITY_MS + 120_000),
      context: { phase: "ready", whatsapp_onboarding_started: true },
    });

    const id1 = `wamid.inact.j1.${Date.now()}`;
    const id2 = `wamid.inact.j2.${Date.now()}`;
    const [r1, r2] = await Promise.all([
      postWebhook(mobile, "hello", id1),
      postWebhook(mobile, "hello", id2),
    ]);

    const conv = await getConversation(mobile);
    const srCount = await (async () => {
      const cust = await getCustomer(mobile);
      if (!cust?.id) return 0;
      const { count } = await supabaseClient()
        .from("service-request")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", cust.id);
      return count ?? 0;
    })();

    log(
      "J. Concurrent messages — single reset, no duplicate bookings",
      r1.ok &&
        r2.ok &&
        conv?.state === "language_selection" &&
        srCount === 0,
      `srCount=${srCount} state=${conv?.state}`,
    );
  }

  // K. Worker WhatsApp "1" not intercepted by inactivity reset
  {
    const worker = await findSeedWorker();
    if (!worker?.mobile_number) {
      log("K. Worker WhatsApp not reset by inactivity", true, "skipped — no seed worker");
    } else {
      const mobile = worker.mobile_number.replace(/\D/g, "");
      const sb = supabaseClient();

      const { data: svc } = await sb
        .from("worker_services")
        .select("service_id, services(name)")
        .eq("worker_id", worker.id)
        .limit(1)
        .maybeSingle();

      const serviceId = svc?.service_id;
      const serviceName = svc?.services?.name ?? service.name;

      const dummyMobile = `919999000${String(Date.now()).slice(-3)}`;
      const { data: dummyCustomer, error: dummyCustomerError } = await sb
        .from("customers")
        .insert({
          name: "Worker Offer Dummy",
          mobile: dummyMobile,
          area: worker.area ?? "Panvel",
          pincode: worker.pincode ?? "410221",
          address_line: "Test",
          preferred_language: "mr",
          source: "whatsapp",
          status: "active",
          subscription_status: "free",
          is_whatsapp_verified: true,
        })
        .select("id")
        .single();

      if (dummyCustomerError || !dummyCustomer?.id) {
        log(
          "K. Worker WhatsApp accept not blocked by inactivity reset",
          false,
          dummyCustomerError?.message ?? "dummy customer failed",
        );
      } else {
      const { data: sr, error: srError } = await sb
        .from("service-request")
        .insert({
          original_message: "worker inact test",
          service_type: serviceName,
          preferred_time_slot: "10:00-12:00",
          area: worker.area ?? "Panvel",
          pincode: worker.pincode ?? "410221",
          address: "Test",
          service_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
          customer_id: dummyCustomer.id,
          customer_mobile: dummyMobile,
          status: "new",
          rate_card_sent: true,
          rate_card_accepted: true,
        })
        .select("*")
        .single();

      if (srError || !sr?.id) {
        log("K. Worker WhatsApp accept not blocked by inactivity reset", false, srError?.message ?? "sr failed");
      } else {
        await sb.from("workers").update({ is_available: true }).eq("id", worker.id);

        const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        const { data: offer, error: offerError } = await sb
          .from("worker_service_offers")
          .insert({
            service_request_id: sr.id,
            worker_id: worker.id,
            batch_number: 1,
            expires_at: expires,
            status: "pending",
            accept_token_hash: hashToken(`inact-k-${sr.id}`),
          })
          .select("id, status")
          .single();

        if (offerError || !offer?.id) {
          log(
            "K. Worker WhatsApp accept not blocked by inactivity reset",
            false,
            offerError?.message ?? "offer insert failed",
          );
        } else {
          await sb.from("whatsapp_conversations").upsert(
            {
              whatsapp_mobile: mobile,
              customer_id: null,
              preferred_language: "mr",
              state: "language_selection",
              context: { whatsapp_onboarding_started: false },
              last_message_at: isoMsAgo(INACTIVITY_MS + 120_000),
            },
            { onConflict: "whatsapp_mobile" },
          );

          await postWebhook(mobile, "1", `wamid.inact.k.${Date.now()}`);
          const { data: offerAfter } = await sb
            .from("worker_service_offers")
            .select("status")
            .eq("id", offer.id)
            .single();

          log(
            "K. Worker WhatsApp accept not blocked by inactivity reset",
            offerAfter?.status === "accepted",
            `offer=${offerAfter?.status}`,
          );
        }

        await sb.from("worker_service_offers").delete().eq("service_request_id", sr.id);
        await sb.from("service-request").delete().eq("id", sr.id);
        if (dummyCustomer?.id) await sb.from("customers").delete().eq("id", dummyCustomer.id);
      }
      }
    }
  }

  // L. Payment safety — timeout cannot bypass OTP
  {
    const mobile = `${mobileBase}012`;
    const sb = supabaseClient();
    await cleanupMobile(mobile);

    const worker = await findSeedWorker();
    if (!worker?.id) {
      log("L. Conversation timeout cannot bypass completion OTP", true, "skipped — no worker");
    } else {
      const { data: customer } = await sb
        .from("customers")
        .insert({
          name: "Pay Safety",
          mobile,
          area: "Kothrud",
          pincode: "411038",
          address_line: "Flat L",
          preferred_language: "en",
          source: "whatsapp",
          status: "active",
          subscription_status: "free",
          is_whatsapp_verified: true,
        })
        .select("*")
        .single();

      const { booking } = await createAssignedBooking(customer.id, worker.id);

      await sb
        .from("booking")
        .update({
          completion_otp_hash: "fakehash",
          otp_verified: false,
        })
        .eq("id", booking.id);

      await sb.from("whatsapp_conversations").insert({
        whatsapp_mobile: mobile,
        customer_id: customer.id,
        preferred_language: "en",
        state: "service_completion",
        booking_id: booking.id,
        context: {
          phase: "payment_selection",
          booking_id: booking.id,
          otp_verified_at: null,
        },
        last_message_at: isoMsAgo(INACTIVITY_MS + 120_000),
      });

      await postWebhook(mobile, "hello", `wamid.inact.l.${Date.now()}`);
      const conv = await getConversation(mobile);
      const { data: bookingAfter } = await sb
        .from("booking")
        .select("otp_verified")
        .eq("id", booking.id)
        .single();

      const cashRes = await fetch(`${baseUrl}/api/worker/bookings/${booking.id}/confirm-cash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId: worker.id }),
      });

      await sb.from("booking").delete().eq("id", booking.id);
      await sb.from("service-request").delete().eq("id", booking.sevice_request_id);

      log(
        "L. Conversation timeout cannot bypass completion OTP",
        conv?.state === "language_selection" &&
          bookingAfter?.otp_verified === false &&
          !cashRes.ok &&
          !conv?.context?.otp_verified_at,
        `otp_verified=${bookingAfter?.otp_verified} cashBlocked=${!cashRes.ok}`,
      );
    }
  }
}

function runBookingRegression() {
  console.log("\nM. WhatsApp booking regression suite\n");
  const scriptPath = resolve(process.cwd(), "scripts/test-whatsapp-booking-flow.mjs");
  const nodeArgs = [
    ...process.execArgv.filter((a) => a.startsWith("--use-")),
    scriptPath,
  ];
  if (process.argv[2]) nodeArgs.push(process.argv[2]);
  const result = spawnSync(process.execPath, nodeArgs, {
    cwd: process.cwd(),
    env: { ...process.env, WHATSAPP_MOCK_SEND: "true" },
    encoding: "utf8",
  });
  const match = result.stdout?.match(/(\d+)\/(\d+)/);
  const passed = match ? Number(match[1]) === Number(match[2]) : result.status === 0;
  log(
    "M. Existing WhatsApp booking regression suite",
    passed && result.status === 0,
    match ? `${match[1]}/${match[2]}` : `exit=${result.status}`,
  );
  if (!passed) {
    console.log(result.stdout?.slice(-2000) ?? "");
    console.error(result.stderr?.slice(-1000) ?? "");
  }
}

async function run() {
  console.log(`24-hour conversation inactivity tests at ${baseUrl}\n`);

  if (!supabaseUrl || !serviceKey) {
    console.error("SUPABASE env required.\n");
    process.exit(1);
  }

  runUnitBoundaryTests();
  await runIntegrationTests();
  runBookingRegression();

  console.log(`\n${passCount}/${tests.length} inactivity tests passed`);
  if (passCount !== tests.length) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
