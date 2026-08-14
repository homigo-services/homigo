/**
 * WhatsApp routing regression tests — pure logic, no dev server or DB.
 *
 * Usage: node scripts/test-whatsapp-routing.mjs
 */

import {
  customerStateUsesNumericMenu,
  shouldSkipLanguageForReturningCustomer,
} from "../src/lib/whatsapp/routing.ts";
import { parseLanguageSelection } from "../src/lib/whatsapp/messages.ts";

const tests = [];
let passCount = 0;

function log(name, ok, detail = "") {
  tests.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) passCount += 1;
}

function conv(state, ctx = {}) {
  return { id: "c1", state, context: ctx };
}

function run() {
  console.log("WhatsApp routing regression tests\n");

  log(
    "date_selection uses numeric menu",
    customerStateUsesNumericMenu("date_selection", {}),
  );

  log(
    "language_selection does not use numeric menu",
    !customerStateUsesNumericMenu("language_selection", { phase: "ready" }),
  );

  log(
    "service_completion payment_selection uses numeric menu",
    customerStateUsesNumericMenu("service_completion", { phase: "payment_selection" }),
  );

  log(
    "fresh onboarding: language_selection + phase=ready + onboarding_started + '1' → do NOT skip language",
    !shouldSkipLanguageForReturningCustomer(
      conv("language_selection", { phase: "ready", whatsapp_onboarding_started: true }),
      { phase: "ready", whatsapp_onboarding_started: true },
      "1",
      parseLanguageSelection,
    ),
    "1 must parse as Marathi",
  );

  log(
    "stale returning row: phase=ready without onboarding_started + '1' → skip language shortcut",
    shouldSkipLanguageForReturningCustomer(
      conv("language_selection", { phase: "ready" }),
      { phase: "ready" },
      "hello",
      parseLanguageSelection,
    ),
    "non-language text uses returning path",
  );

  log(
    "stale returning row: numeric '2' still parses as language first",
    !shouldSkipLanguageForReturningCustomer(
      conv("language_selection", { phase: "ready" }),
      { phase: "ready" },
      "2",
      parseLanguageSelection,
    ),
    "2 must not jump to service menu",
  );

  log(
    "completed greeting reset only applies to completed state",
    !["worker_assignment", "rate_card_confirmation"].includes("completed"),
    "worker_assignment no longer resets on hi",
  );

  console.log(`\n${passCount}/${tests.length} routing tests passed`);
  if (passCount !== tests.length) process.exit(1);
}

run();
