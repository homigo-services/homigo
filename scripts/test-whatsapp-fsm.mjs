/**
 * WhatsApp FSM unit tests — guards, context builders, date parsing.
 *
 * Usage: node scripts/test-whatsapp-fsm.mjs
 */

import {
  buildFreshOnboardingContext,
  buildServiceSelectedContext,
  hasValidBookingServiceContext,
} from "../src/lib/whatsapp/context-builders.ts";
import {
  conversationNeedsBookingHeal,
  shouldResetOnboardingGreeting,
} from "../src/lib/whatsapp/fsm-guards.ts";
import { isGreeting } from "../src/lib/whatsapp/parser.ts";
import {
  isPastDate,
  parseBookingDateSelection,
  parseCustomerDateInput,
  todayIso,
  tomorrowIso,
} from "../src/lib/whatsapp/slots.ts";

const tests = [];
let passCount = 0;

function log(name, ok, detail = "") {
  tests.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) passCount += 1;
}

function run() {
  console.log("WhatsApp FSM unit tests\n");

  const fresh = buildFreshOnboardingContext();
  log("fresh onboarding has no service_id", fresh.service_id === undefined);
  log("fresh onboarding has no service_date", fresh.service_date === undefined);
  log("fresh onboarding flags onboarding started", fresh.whatsapp_onboarding_started === true);

  const serviceCtx = buildServiceSelectedContext({
    serviceId: "svc-1",
    serviceName: "Plumber",
    originalMessage: "1",
  });
  log("service selected context valid", hasValidBookingServiceContext(serviceCtx));

  log(
    "date_selection without service_id needs heal",
    conversationNeedsBookingHeal("date_selection", {}),
  );
  log(
    "date_selection with service_id ok",
    !conversationNeedsBookingHeal("date_selection", serviceCtx),
  );

  log(
    "hi on date_selection should reset onboarding",
    shouldResetOnboardingGreeting("date_selection"),
  );
  log(
    "hi on worker_assignment should NOT reset via greeting guard",
    !shouldResetOnboardingGreeting("worker_assignment"),
  );
  log("parser recognizes hi greeting", isGreeting("hi"));

  log("date menu 1 parses today", parseCustomerDateInput("1") === todayIso());
  log("date menu 2 parses tomorrow", parseCustomerDateInput("2") === tomorrowIso());
  log('date menu "3" alone is null (custom date step)', parseCustomerDateInput("3") === null);
  log(
    "parseBookingDateSelection menu 1 = today",
    parseBookingDateSelection("1") === todayIso(),
  );
  log(
    "parseBookingDateSelection menu 2 = tomorrow",
    parseBookingDateSelection("2") === tomorrowIso(),
  );
  log(
    'parseBookingDateSelection menu "3" is null (custom prompt)',
    parseBookingDateSelection("3") === null,
  );
  log(
    "DD-MM-YYYY parses",
    parseCustomerDateInput("15-08-2026") === "2026-08-15",
  );
  log(
    "past date detected",
    isPastDate("2020-01-01"),
  );
  log(
    "today is not past",
    !isPastDate(todayIso()),
  );

  console.log(`\n${passCount}/${tests.length} FSM unit tests passed`);
  if (passCount !== tests.length) process.exit(1);
}

run();
