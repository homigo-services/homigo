/**
 * WhatsApp webhook smoke test — no live Meta required when WHATSAPP_MOCK_SEND=true
 *
 * Usage:
 *   node scripts/test-whatsapp-webhook.mjs
 *   node scripts/test-whatsapp-webhook.mjs http://localhost:3000
 *
 * Requires:
 *   - Dev server running (npm run dev)
 *   - .env.local with Supabase + WhatsApp verify token
 *   - WHATSAPP_MOCK_SEND=true (set automatically by this script for outbound)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const envPath = resolve(process.cwd(), ".env.local");
const messagesSourcePath = resolve(process.cwd(), "src/lib/whatsapp/messages.ts");

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

const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? "test-verify-token";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const tests = [];
let passCount = 0;

function log(name, ok, detail = "") {
  tests.push({ name, ok, detail });
  const icon = ok ? "PASS" : "FAIL";
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) passCount += 1;
}

async function request(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, options);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { res, json, text };
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

function supabaseClient() {
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey);
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

async function countProcessedEvents(messageId) {
  const sb = supabaseClient();
  if (!sb) return 0;
  const { count } = await sb
    .from("whatsapp_processed_events")
    .select("message_id", { count: "exact", head: true })
    .eq("message_id", messageId);
  return count ?? 0;
}

async function cleanupTestMobile(mobile) {
  const sb = supabaseClient();
  if (!sb) return;
  await sb.from("whatsapp_processed_events").delete().eq("whatsapp_mobile", mobile);
  await sb.from("whatsapp_conversations").delete().eq("whatsapp_mobile", mobile);
  const { data: customer } = await sb
    .from("customers")
    .select("id")
    .eq("mobile", mobile)
    .maybeSingle();
  if (customer?.id) {
    await sb.from("customers").delete().eq("id", customer.id);
  }
}

function onboardingMessageTemplatePresent() {
  try {
    const src = readFileSync(messagesSourcePath, "utf8");
    return (
      src.includes("Welcome to Homigo!") &&
      src.includes("1. मराठी") &&
      src.includes("2. हिंदी") &&
      src.includes("3. English")
    );
  } catch {
    return false;
  }
}

async function run() {
  console.log(`Testing WhatsApp webhook at ${baseUrl}\n`);
  console.log("WHATSAPP_MOCK_SEND=true (outbound Meta API mocked)\n");

  if (!verifyToken) {
    console.error("WHATSAPP_WEBHOOK_VERIFY_TOKEN not set in .env.local\n");
    process.exit(1);
  }

  if (!supabaseUrl || !serviceKey) {
    console.error(
      "SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are required for webhook DB tests.\n",
    );
    process.exit(1);
  }

  console.log(
    `Env: SUPABASE_SERVICE_ROLE_KEY=${serviceKey ? "SET" : "MISSING"}, NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl ? "SET" : "MISSING"}\n`,
  );

  log(
    "Onboarding message template (welcome + language menu)",
    onboardingMessageTemplatePresent(),
    "messages.ts",
  );

  // 1. GET verification — correct token
  {
    const { res, text } = await request(
      `/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=CHALLENGE123`,
    );
    log(
      "GET verification (correct token)",
      res.status === 200 && text === "CHALLENGE123",
      `status=${res.status} body=${text}`,
    );
  }

  // 2. GET verification — wrong token
  {
    const { res } = await request(
      `/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=CHALLENGE123`,
    );
    log("GET verification (wrong token)", res.status === 403, `status=${res.status}`);
  }

  const testMobile = "919999888877";
  const hiMessageId = `wamid.test.hi.${Date.now()}`;

  await cleanupTestMobile(testMobile);

  // 3. POST new "hi" → language onboarding started
  {
    const preConv = await getConversation(testMobile);
    const payload = buildPayload(hiMessageId, testMobile, "hi");
    const { res, json } = await request("/api/whatsapp/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const conv = await getConversation(testMobile);
    log(
      "POST new hi → onboarding started",
      res.ok &&
        json.success === true &&
        !preConv &&
        conv?.state === "language_selection" &&
        conv?.context?.whatsapp_onboarding_started === true,
      `state=${conv?.state ?? "none"} pre=${preConv ? "stale" : "clean"}`,
    );
  }

  // 4. hi alone does NOT set Hindi language
  {
    const customer = await getCustomer(testMobile);
    const conv = await getConversation(testMobile);
    log(
      "hi does NOT auto-select Hindi",
      customer?.preferred_language !== "hi" && conv?.state === "language_selection",
      `lang=${customer?.preferred_language} state=${conv?.state}`,
    );
  }

  // 5. POST hello on fresh mobile → onboarding
  {
    const helloMobile = "919999888866";
    await cleanupTestMobile(helloMobile);
    const { res } = await request("/api/whatsapp/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildPayload(`wamid.test.hello.${Date.now()}`, helloMobile, "hello"),
      ),
    });
    const conv = await getConversation(helloMobile);
    log(
      "POST hello → welcome onboarding",
      res.ok && conv?.state === "language_selection" && conv?.context?.whatsapp_onboarding_started === true,
      `state=${conv?.state}`,
    );
    await cleanupTestMobile(helloMobile);
  }

  // 6. Duplicate POST same message ID
  {
    const payload = buildPayload(hiMessageId, testMobile, "hi");
    const before = await countProcessedEvents(hiMessageId);
    const { res } = await request("/api/whatsapp/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const after = await countProcessedEvents(hiMessageId);
    log(
      "POST duplicate message ID (idempotent)",
      res.ok && before === 1 && after === 1,
      `events=${after}`,
    );
  }

  // 7–9. Language selection 1=Marathi, 2=Hindi, 3=English
  for (const [lang, code, mobileSuffix, expectedLang] of [
    ["Marathi", "1", "002", "mr"],
    ["Hindi", "2", "003", "hi"],
    ["English", "3", "001", "en"],
  ]) {
    const mobile = `9199998888${mobileSuffix}`;
    await cleanupTestMobile(mobile);
    const msgId = `wamid.test.lang.${mobileSuffix}.${Date.now()}`;

    await request("/api/whatsapp/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(`wamid.greet.${mobileSuffix}`, mobile, "hello")),
    });

    const { res } = await request("/api/whatsapp/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(msgId, mobile, code)),
    });

    const customer = await getCustomer(mobile);
    const conv = await getConversation(mobile);

    log(
      `Language selection ${code} (${lang}) → service_selection`,
      res.ok &&
        customer?.preferred_language === expectedLang &&
        conv?.state === "service_selection" &&
        conv?.context?.phase === "ready",
      `lang=${customer?.preferred_language} state=${conv?.state}`,
    );

    await cleanupTestMobile(mobile);
  }

  // 10. Completed previous booking + hi → new onboarding (not worker_assignment)
  {
    const mobile = "919999888855";
    await cleanupTestMobile(mobile);

    const sb = supabaseClient();
    const { data: customer } = await sb
      .from("customers")
      .insert({
        name: mobile,
        mobile,
        area: "Kothrud",
        pincode: "411038",
        address_line: "Flat 1",
        preferred_language: "en",
        is_whatsapp_verified: true,
        source: "whatsapp",
        status: "active",
        subscription_status: "free",
      })
      .select("*")
      .single();

    await sb.from("whatsapp_conversations").insert({
      whatsapp_mobile: mobile,
      customer_id: customer.id,
      preferred_language: "en",
      state: "completed",
      context: {
        phase: "completed",
        cash_completion_sent_at: new Date().toISOString(),
        payment_status: "completed",
      },
    });

    const { res } = await request("/api/whatsapp/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(`wamid.test.completed.${Date.now()}`, mobile, "hi")),
    });

    const conv = await getConversation(mobile);
    log(
      "Completed booking + hi → new onboarding",
      res.ok &&
        conv?.state === "language_selection" &&
        conv?.context?.whatsapp_onboarding_started === true &&
        conv?.context?.phase !== "completed" &&
        conv?.state !== "worker_assignment",
      `state=${conv?.state} phase=${conv?.context?.phase ?? "none"}`,
    );

    await cleanupTestMobile(mobile);
  }

  // 11. worker_assignment + hi → stay in matching (do NOT wipe active booking)
  {
    const mobile = "919999888844";
    await cleanupTestMobile(mobile);

    const sb = supabaseClient();
    const { data: customer } = await sb
      .from("customers")
      .insert({
        name: mobile,
        mobile,
        area: "Kothrud",
        pincode: "411038",
        address_line: "Flat 1",
        preferred_language: "mr",
        is_whatsapp_verified: true,
        source: "whatsapp",
        status: "active",
        subscription_status: "free",
      })
      .select("*")
      .single();

    await sb.from("whatsapp_conversations").insert({
      whatsapp_mobile: mobile,
      customer_id: customer.id,
      preferred_language: "mr",
      state: "worker_assignment",
      context: {
        phase: "worker_matching_pending",
        service_request_id: "00000000-0000-0000-0000-000000000001",
      },
    });

    const { res } = await request("/api/whatsapp/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(`wamid.test.wa.${Date.now()}`, mobile, "hi")),
    });

    const conv = await getConversation(mobile);
    log(
      "worker_assignment + hi → keep matching state",
      res.ok &&
        conv?.state === "worker_assignment" &&
        conv?.context?.phase === "worker_matching_pending" &&
        conv?.state !== "language_selection",
      `state=${conv?.state} phase=${conv?.context?.phase ?? "none"}`,
    );

    await cleanupTestMobile(mobile);
  }

  // 11d. stale date_selection + hi → language onboarding (NOT date prompt / INVALID_DATE)
  {
    const mobile = "919999888833";
    await cleanupTestMobile(mobile);

    const sb = supabaseClient();
    const { data: customer } = await sb
      .from("customers")
      .insert({
        name: mobile,
        mobile,
        area: "pending",
        pincode: "pending",
        address_line: "pending",
        preferred_language: "mr",
        is_whatsapp_verified: true,
        source: "whatsapp",
        status: "active",
        subscription_status: "free",
      })
      .select("*")
      .single();

    await sb.from("whatsapp_conversations").insert({
      whatsapp_mobile: mobile,
      customer_id: customer.id,
      preferred_language: "mr",
      state: "date_selection",
      context: {
        phase: "date_selection",
        service_id: "00000000-0000-0000-0000-000000000099",
        service_name: "Plumber",
      },
    });

    const { res } = await request("/api/whatsapp/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(`wamid.test.stale.date.${Date.now()}`, mobile, "hi")),
    });

    const conv = await getConversation(mobile);
    log(
      "stale date_selection + hi → language_selection welcome",
      res.ok &&
        conv?.state === "language_selection" &&
        conv?.context?.whatsapp_onboarding_started === true &&
        !conv?.context?.service_id,
      `state=${conv?.state} service_id=${conv?.context?.service_id ?? "cleared"}`,
    );

    await cleanupTestMobile(mobile);
  }

  // 11c. language_selection + phase=ready + fresh onboarding + '1' → service_selection (language parsed)
  {
    const mobile = "919999888855";
    await cleanupTestMobile(mobile);

    const sb = supabaseClient();
    const { data: customer } = await sb
      .from("customers")
      .insert({
        name: mobile,
        mobile,
        area: "pending",
        pincode: "pending",
        address_line: "pending",
        preferred_language: "mr",
        is_whatsapp_verified: true,
        source: "whatsapp",
        status: "active",
        subscription_status: "free",
      })
      .select("*")
      .single();

    await sb.from("whatsapp_conversations").insert({
      whatsapp_mobile: mobile,
      customer_id: customer.id,
      preferred_language: "mr",
      state: "language_selection",
      context: {
        phase: "ready",
        whatsapp_onboarding_started: true,
      },
    });

    const { res } = await request("/api/whatsapp/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(`wamid.test.lang1.${Date.now()}`, mobile, "1")),
    });

    const conv = await getConversation(mobile);
    const cust = await getCustomer(mobile);
    log(
      "language_selection stale phase + onboarding + 1 → language parsed",
      res.ok &&
        conv?.state === "service_selection" &&
        conv?.context?.phase === "ready" &&
        cust?.preferred_language === "mr",
      `state=${conv?.state} lang=${cust?.preferred_language}`,
    );

    await cleanupTestMobile(mobile);
  }

  // 11b. worker_assignment + status → matching retry, NOT language onboarding
  {
    const mobile = `919999777${String(Date.now()).slice(-4)}`;
    await cleanupTestMobile(mobile);

    const sb = supabaseClient();
    const { data: customer } = await sb
      .from("customers")
      .insert({
        name: mobile,
        mobile,
        area: "Panvel",
        pincode: "410221",
        address_line: "Flat 1",
        preferred_language: "mr",
        is_whatsapp_verified: true,
        source: "whatsapp",
        status: "active",
        subscription_status: "free",
      })
      .select("*")
      .single();

    await sb.from("whatsapp_conversations").insert({
      whatsapp_mobile: mobile,
      customer_id: customer.id,
      preferred_language: "mr",
      state: "worker_assignment",
      context: {
        phase: "worker_matching_pending",
        service_request_id: "00000000-0000-0000-0000-000000000002",
      },
    });

    const { res } = await request("/api/whatsapp/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(`wamid.test.wa.status.${Date.now()}`, mobile, "status")),
    });

    const conv = await getConversation(mobile);
    log(
      "worker_assignment + status → no onboarding reset",
      res.ok &&
        conv?.state === "worker_assignment" &&
        conv?.state !== "language_selection" &&
        conv?.context?.phase === "worker_matching_pending",
      `state=${conv?.state} phase=${conv?.context?.phase ?? "none"}`,
    );

    await cleanupTestMobile(mobile);
  }

  // 12. service_selection + hi → greeting reset to language onboarding
  {
    const mobile = "919999888899";
    await cleanupTestMobile(mobile);

    const sb = supabaseClient();
    const { data: customer } = await sb
      .from("customers")
      .insert({
        name: mobile,
        mobile,
        area: "pending",
        pincode: "pending",
        address_line: "pending",
        preferred_language: "en",
        is_whatsapp_verified: true,
        source: "whatsapp",
        status: "active",
        subscription_status: "free",
      })
      .select("*")
      .single();

    await sb.from("whatsapp_conversations").insert({
      whatsapp_mobile: mobile,
      customer_id: customer.id,
      preferred_language: "en",
      state: "service_selection",
      context: { phase: "ready", service_id: "00000000-0000-0000-0000-000000000099" },
    });

    const msgId = `wamid.test.returning.${Date.now()}`;
    const { res } = await request("/api/whatsapp/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(msgId, mobile, "hi")),
    });

    const conv = await getConversation(mobile);
    log(
      "service_selection + hi → language_selection greeting reset",
      res.ok &&
        conv?.state === "language_selection" &&
        conv?.context?.whatsapp_onboarding_started === true &&
        !conv?.context?.service_id &&
        customer?.preferred_language === "en",
      `state=${conv?.state} service_id=${conv?.context?.service_id ?? "cleared"}`,
    );

    await cleanupTestMobile(mobile);
  }

  await cleanupTestMobile(testMobile);

  console.log(`\n${passCount}/${tests.length} tests passed`);

  if (passCount !== tests.length) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
