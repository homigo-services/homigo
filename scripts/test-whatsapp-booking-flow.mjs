/**
 * Phase 4A WhatsApp booking flow tests — WHATSAPP_MOCK_SEND=true (no live Meta).
 *
 * Usage:
 *   node scripts/test-whatsapp-booking-flow.mjs
 *   node scripts/test-whatsapp-booking-flow.mjs http://localhost:3000
 */

import { createClient } from "@supabase/supabase-js";
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

function supabaseClient() {
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey);
}

function buildPayload(messageId, from, body) {
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

async function postWebhook(from, body, messageId = `wamid.p4a.${Date.now()}.${Math.random()}`) {
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
  const { data } = await sb
    .from("customers")
    .select("*")
    .eq("mobile", mobile)
    .maybeSingle();
  return data;
}

async function getServiceRequest(id) {
  const sb = supabaseClient();
  if (!sb || !id) return null;
  const { data } = await sb.from("service-request").select("*").eq("id", id).maybeSingle();
  return data;
}

async function countProcessedEvents(messageId) {
  const sb = supabaseClient();
  if (!sb) return 0;
  const { count } = await sb
    .from("whatsapp_processed_events")
    .select("message_id", { count: "exact", head: true })
    .eq("message_id", messageId);
  return count ?? 0;
}

async function fetchServices() {
  const sb = supabaseClient();
  if (!sb) return [];

  const primary = await sb.from("services").select("id, name").eq("is_active", true).order("name");
  if (!primary.error && primary.data?.length) {
    return primary.data.map((s) => ({ id: s.id, name: s.name }));
  }

  const fallback = await sb
    .from("services")
    .select("id, service_name")
    .eq("is_active", true)
    .order("service_name");

  return (fallback.data ?? []).map((s) => ({
    id: s.id,
    name: s.service_name,
  }));
}

async function cleanupTestMobile(mobile) {
  const sb = supabaseClient();
  if (!sb) return;

  const { data: conv } = await sb
    .from("whatsapp_conversations")
    .select("service_request_id, customer_id")
    .eq("whatsapp_mobile", mobile)
    .maybeSingle();

  if (conv?.service_request_id) {
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
    await sb.from("service-request").delete().eq("customer_id", customer.id);
    await sb.from("customers").delete().eq("id", customer.id);
  }
}

async function onboardToServiceSelection(mobile, langCode = "3") {
  await postWebhook(mobile, "hello", `wamid.p4a.greet.${mobile}.${Date.now()}`);
  await postWebhook(mobile, langCode, `wamid.p4a.lang.${mobile}.${Date.now()}`);
  return getConversation(mobile);
}

async function selectService(mobile, serviceIndex) {
  return postWebhook(mobile, String(serviceIndex), `wamid.p4a.svc.${mobile}.${Date.now()}`);
}

async function completeDetails(mobile) {
  await postWebhook(mobile, "Kothrud", `wamid.p4a.area.${mobile}.${Date.now()}`);
  await postWebhook(mobile, "411038", `wamid.p4a.pin.${mobile}.${Date.now()}`);
  await postWebhook(mobile, "Flat 12, Sample Society", `wamid.p4a.addr.${mobile}.${Date.now()}`);
}

async function selectTomorrow(mobile) {
  return postWebhook(mobile, "2", `wamid.p4a.date.${mobile}.${Date.now()}`);
}

async function selectValidSlot(mobile, slot = "3") {
  return postWebhook(mobile, slot, `wamid.p4a.slot.${mobile}.${Date.now()}`);
}

function tomorrowIso() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function run() {
  console.log(`Phase 4A booking flow tests at ${baseUrl}\n`);

  if (!supabaseUrl || !serviceKey) {
    console.error("SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL required.\n");
    process.exit(1);
  }

  const services = await fetchServices();
  if (services.length === 0) {
    console.error("No services in public.services — seed at least one service to run Phase 4A tests.\n");
    process.exit(1);
  }

  const testMobile = "919999777001";
  const existingMobile = "919999777099";
  let tempRateCardId = null;
  let tempRateCardServiceId = null;

  // A. New customer greeting
  {
    await cleanupTestMobile(testMobile);
    const { ok } = await postWebhook(testMobile, "hi");
    const conv = await getConversation(testMobile);
    log(
      "A. New customer greeting",
      ok && conv?.state === "language_selection" && conv?.context?.whatsapp_onboarding_started === true,
      `state=${conv?.state}`,
    );
  }

  // B. Language selection
  {
    await cleanupTestMobile(testMobile);
    const conv = await onboardToServiceSelection(testMobile, "3");
    const customer = await getCustomer(testMobile);
    log(
      "B. Language selection",
      conv?.state === "service_selection" &&
        conv?.context?.phase === "ready" &&
        customer?.preferred_language === "en" &&
        Array.isArray(conv?.context?.service_menu) &&
        conv.context.service_menu.length > 0,
      `lang=${customer?.preferred_language} menu=${conv?.context?.service_menu?.length ?? 0}`,
    );
  }

  // C. Dynamic service menu from DB
  {
    await cleanupTestMobile(testMobile);
    const conv = await onboardToServiceSelection(testMobile);
    const menu = conv?.context?.service_menu ?? [];
    const matchesDb =
      menu.length === services.length &&
      menu.every((m, i) => m.id === services[i].id);
    log(
      "C. Dynamic service menu from DB",
      matchesDb,
      `menu=${menu.length} db=${services.length}`,
    );
  }

  // D. Invalid service selection
  {
    await cleanupTestMobile(testMobile);
    await onboardToServiceSelection(testMobile);
    const { ok } = await postWebhook(testMobile, "999");
    const conv = await getConversation(testMobile);
    log(
      "D. Invalid service selection",
      ok && conv?.state === "service_selection" && !conv?.context?.service_id,
      `state=${conv?.state}`,
    );
  }

  // E. Valid service selection
  {
    await cleanupTestMobile(testMobile);
    await onboardToServiceSelection(testMobile);
    await selectService(testMobile, 1);
    const conv = await getConversation(testMobile);
    log(
      "E. Valid service selection",
      conv?.context?.service_id === services[0].id &&
        conv?.context?.service_name === services[0].name,
      `service=${conv?.context?.service_name}`,
    );
  }

  // F. Missing customer details collection
  {
    await cleanupTestMobile(testMobile);
    await onboardToServiceSelection(testMobile);
    await selectService(testMobile, 1);
    const conv = await getConversation(testMobile);
    log(
      "F. Missing details → collection state",
      conv?.state === "address_collection" && conv?.context?.collecting_field === "area",
      `state=${conv?.state} field=${conv?.context?.collecting_field}`,
    );
  }

  // G. Date selection
  {
    await cleanupTestMobile(testMobile);
    await onboardToServiceSelection(testMobile);
    await selectService(testMobile, 1);
    await completeDetails(testMobile);
    const conv = await getConversation(testMobile);
    log(
      "G. Date selection prompt",
      conv?.state === "date_selection",
      `state=${conv?.state}`,
    );
  }

  // H. Reject past date
  {
    await cleanupTestMobile(testMobile);
    await onboardToServiceSelection(testMobile);
    await selectService(testMobile, 1);
    await completeDetails(testMobile);
    const { ok } = await postWebhook(testMobile, "01-01-2020");
    const conv = await getConversation(testMobile);
    log(
      "H. Reject past date",
      ok && conv?.state === "date_selection",
      `state=${conv?.state}`,
    );
  }

  // I. Valid 2-hour slot
  {
    await cleanupTestMobile(testMobile);
    await onboardToServiceSelection(testMobile);
    await selectService(testMobile, 1);
    await completeDetails(testMobile);
    await selectTomorrow(testMobile);
    await selectValidSlot(testMobile, "3");
    const conv = await getConversation(testMobile);
    log(
      "I. Valid 2-hour slot",
      conv?.context?.preferred_time_slot === "12:00-14:00",
      `slot=${conv?.context?.preferred_time_slot}`,
    );
  }

  // J. Invalid slot
  {
    await cleanupTestMobile(testMobile);
    await onboardToServiceSelection(testMobile);
    await selectService(testMobile, 1);
    await completeDetails(testMobile);
    await selectTomorrow(testMobile);
    const { ok } = await postWebhook(testMobile, "99");
    const conv = await getConversation(testMobile);
    log(
      "J. Invalid slot",
      ok && conv?.state === "slot_selection",
      `state=${conv?.state}`,
    );
  }

  // K. No rate card → graceful response
  {
    await cleanupTestMobile(testMobile);
    await onboardToServiceSelection(testMobile);
    await selectService(testMobile, 1);
    await completeDetails(testMobile);
    await selectTomorrow(testMobile);
    await selectValidSlot(testMobile);
    const conv = await getConversation(testMobile);
    const sr = await getServiceRequest(conv?.service_request_id);
    log(
      "K. No rate card → graceful",
      conv?.state === "service_selection" &&
        conv?.context?.phase === "rate_unavailable" &&
        sr?.id &&
        sr.rate_card_accepted === false,
      `state=${conv?.state} sr=${sr?.id ? "yes" : "no"}`,
    );
  }

  // L+M+N — seed temp rate card, quote displayed, accept
  {
    const rateMobile = "919999777002";
    await cleanupTestMobile(rateMobile);
    tempRateCardServiceId = services[0].id;

    const sb = supabaseClient();
    const { data: card } = await sb
      .from("service_rate_cards")
      .insert({
        service_id: tempRateCardServiceId,
        base_amount: 500,
        lead_charge: 50,
        platform_commission: 100,
        worker_earning: 450,
        is_active: true,
        notes: "Phase 4A test — safe to delete",
      })
      .select("id")
      .single();
    tempRateCardId = card?.id ?? null;

    await onboardToServiceSelection(rateMobile);
    await selectService(rateMobile, 1);
    await completeDetails(rateMobile);
    await selectTomorrow(rateMobile);
    await selectValidSlot(rateMobile);

    let conv = await getConversation(rateMobile);
    const srBeforeAccept = await getServiceRequest(conv?.service_request_id);

    log(
      "L. Temp rate card seeded",
      Boolean(tempRateCardId),
      `card=${tempRateCardId ? "yes" : "no"}`,
    );

    log(
      "M. Rate card displayed",
      conv?.state === "rate_card_confirmation" &&
        conv?.context?.rate_card_id === tempRateCardId &&
        srBeforeAccept?.rate_card_sent === true,
      `state=${conv?.state}`,
    );

    await postWebhook(rateMobile, "1", `wamid.p4a.accept.${rateMobile}.${Date.now()}`);
    conv = await getConversation(rateMobile);
    const sr = await getServiceRequest(conv?.service_request_id);

    log(
      "N. Rate card accept",
      conv?.state === "worker_assignment" &&
        conv?.context?.phase === "worker_matching_pending" &&
        sr?.rate_card_accepted === true,
      `state=${conv?.state} accepted=${sr?.rate_card_accepted}`,
    );

    await cleanupTestMobile(rateMobile);
    if (tempRateCardId) {
      await sb.from("service_rate_cards").delete().eq("id", tempRateCardId);
      tempRateCardId = null;
    }
  }

  // O. Rate card reject
  {
    const rejectMobile = "919999777003";
    await cleanupTestMobile(rejectMobile);

    const sb = supabaseClient();
    const { data: card } = await sb
      .from("service_rate_cards")
      .insert({
        service_id: services[0].id,
        base_amount: 400,
        lead_charge: 40,
        platform_commission: 80,
        worker_earning: 360,
        is_active: true,
        notes: "Phase 4A reject test",
      })
      .select("id")
      .single();

    await onboardToServiceSelection(rejectMobile);
    await selectService(rejectMobile, 1);
    await completeDetails(rejectMobile);
    await selectTomorrow(rejectMobile);
    await selectValidSlot(rejectMobile);
    const convBefore = await getConversation(rejectMobile);
    const srId = convBefore?.service_request_id;
    await postWebhook(rejectMobile, "2", `wamid.p4a.reject.${rejectMobile}.${Date.now()}`);

    const conv = await getConversation(rejectMobile);
    const sr = await getServiceRequest(srId);

    log(
      "O. Rate card reject",
      conv?.state === "service_selection" &&
        conv?.context?.phase === "ready" &&
        sr?.rate_card_accepted === false &&
        sr?.status === "cancelled",
      `state=${conv?.state} sr_status=${sr?.status}`,
    );

    await cleanupTestMobile(rejectMobile);
    if (card?.id) await sb.from("service_rate_cards").delete().eq("id", card.id);
  }

  // P. Duplicate inbound message ID
  {
    await cleanupTestMobile(testMobile);
    await onboardToServiceSelection(testMobile);
    const msgId = `wamid.p4a.dup.${Date.now()}`;
    await postWebhook(testMobile, "999", msgId);
    const before = await countProcessedEvents(msgId);
    await postWebhook(testMobile, "999", msgId);
    const after = await countProcessedEvents(msgId);
    log(
      "P. Duplicate message ID",
      before === 1 && after === 1,
      `events=${after}`,
    );
  }

  // Q. Existing customer path
  {
    await cleanupTestMobile(existingMobile);
    const sb = supabaseClient();

    const { data: customer } = await sb
      .from("customers")
      .insert({
        name: "Existing P4A",
        mobile: existingMobile,
        area: "Baner",
        pincode: "411045",
        address_line: "Existing Address",
        preferred_language: "en",
        is_whatsapp_verified: true,
        source: "admin",
        status: "active",
        subscription_status: "free",
      })
      .select("*")
      .single();

    await sb.from("whatsapp_conversations").insert({
      whatsapp_mobile: existingMobile,
      customer_id: customer.id,
      preferred_language: "en",
      state: "service_selection",
      context: { phase: "ready", service_menu: services.map((s, i) => ({ index: i + 1, id: s.id, name: s.name })) },
    });

    const { ok } = await postWebhook(existingMobile, "hi");
    const conv = await getConversation(existingMobile);

    log(
      "Q. Existing customer path",
      ok &&
        conv?.state === "service_selection" &&
        conv?.context?.phase === "ready" &&
        customer?.preferred_language === "en",
      `state=${conv?.state}`,
    );

    await cleanupTestMobile(existingMobile);
  }

  await cleanupTestMobile(testMobile);

  console.log(`\n${passCount}/${tests.length} Phase 4A tests passed`);
  if (passCount !== tests.length) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
