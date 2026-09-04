/**
 * Validates production environment variables before deploy.
 * Usage: NODE_ENV=production node scripts/validate-production-env.mjs
 */

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_APP_URL",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  "WHATSAPP_APP_SECRET",
  "CRON_SECRET",
  "WORKERS_IMPORT_SECRET",
  "ADMIN_API_SECRET",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "SMS_PROVIDER",
];

const FORBIDDEN_IN_PROD = [
  "WHATSAPP_MOCK_SEND",
  "SMS_MOCK_SEND",
  "RAZORPAY_MOCK_MODE",
];

const OPTIONAL = [
  "WHATSAPP_GRAPH_API_VERSION",
  "WHATSAPP_WABA_ID",
  "WHATSAPP_BUSINESS_ACCOUNT_ID",
  "SMS_TWILIO_ACCOUNT_SID",
  "SMS_TWILIO_AUTH_TOKEN",
  "SMS_TWILIO_FROM_NUMBER",
  "SMS_MSG91_AUTH_KEY",
  "SMS_MSG91_SENDER_ID",
  "SMS_WEBHOOK_SECRET",
  "NEXT_PUBLIC_WORKER_REGISTRATION_FORM_URL",
  "NEXT_PUBLIC_WORKER_STORAGE_BUCKET",
  "NEXT_PUBLIC_WORKER_DOCUMENT_MAX_MB",
];

function isSet(name) {
  const v = process.env[name];
  return v != null && String(v).trim() !== "";
}

function main() {
  const isProd = process.env.NODE_ENV === "production";
  console.log(`Homigo production env validation (NODE_ENV=${process.env.NODE_ENV ?? "unset"})\n`);

  const missing = REQUIRED.filter((k) => !isSet(k));
  const forbidden = FORBIDDEN_IN_PROD.filter(
    (k) => process.env[k] === "true" || process.env[k] === "1",
  );

  if (missing.length) {
    console.error("MISSING REQUIRED:");
    for (const k of missing) console.error(`  - ${k}`);
  }

  if (forbidden.length) {
    console.error("\nFORBIDDEN IN PRODUCTION (must be false/unset):");
    for (const k of forbidden) console.error(`  - ${k}=${process.env[k]}`);
  }

  const smsProvider = (process.env.SMS_PROVIDER ?? "").trim().toLowerCase();
  if (smsProvider === "twilio") {
    for (const k of ["SMS_TWILIO_ACCOUNT_SID", "SMS_TWILIO_AUTH_TOKEN", "SMS_TWILIO_FROM_NUMBER"]) {
      if (!isSet(k)) missing.push(k);
    }
  }
  if (smsProvider === "msg91" && !isSet("SMS_MSG91_AUTH_KEY")) {
    missing.push("SMS_MSG91_AUTH_KEY");
  }

  console.log("\nOptional vars present:");
  for (const k of OPTIONAL) {
    if (isSet(k)) console.log(`  ✓ ${k}`);
  }

  const ok = missing.length === 0 && forbidden.length === 0;
  console.log(ok ? "\n✅ Production env validation passed" : "\n❌ Production env validation FAILED");
  if (!isProd) {
    console.log("(Tip: run with NODE_ENV=production to simulate production checks)");
  }
  process.exit(ok ? 0 : 1);
}

main();
