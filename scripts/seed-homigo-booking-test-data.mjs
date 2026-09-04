/**
 * Dev seed — 5 Homigo services, ₹1000 rate cards, 2 test workers per service (10 total).
 *
 * Uses POST /api/dev/workers/seed-homigo-booking
 *
 * Usage:
 *   npm run dev   # in another terminal
 *   npm run seed:homigo:booking
 *   npm run seed:homigo:booking -- http://localhost:3000
 */

const baseUrl = process.argv[2] ?? "http://localhost:3000";

async function main() {
  console.log(`Seeding Homigo booking test data via ${baseUrl}/api/dev/workers/seed-homigo-booking\n`);

  let res;
  try {
    res = await fetch(`${baseUrl}/api/dev/workers/seed-homigo-booking`, { method: "POST" });
  } catch (err) {
    console.error(
      "Could not reach dev server. Start it with `npm run dev` and retry.\n",
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
  }

  const json = await res.json().catch(() => ({}));

  if (!res.ok || !json.ok) {
    console.error("Seed failed:", json.error ?? res.status);
    process.exit(1);
  }

  console.log("Services:");
  for (const s of json.services ?? []) {
    console.log(
      `  ${s.name} — service ${s.created ? "created" : "exists"} | rate card ${s.rateCardCreated ? "created" : "exists"} (${s.rateCardId?.slice(0, 8)}…)`,
    );
  }

  console.log("\nWorkers (10 total):");
  for (const w of json.workers ?? []) {
    console.log(
      `  ${w.key} [${w.serviceName}] ${w.created ? "created" : "updated"} — id=${w.id.slice(0, 8)}… code=${w.workerCode} mobile=${w.mobile}`,
    );
  }

  console.log("\nMatch preview (Panvel / 410221):");
  for (const [service, preview] of Object.entries(json.matchPreview ?? {})) {
    console.log(`  ${service}: count=${preview.count ?? 0}${preview.error ? ` error=${preview.error}` : ""}`);
  }

  const workerCount = (json.workers ?? []).length;
  if (workerCount < 10) {
    console.error(`\nExpected 10 workers, got ${workerCount}.`);
    process.exit(1);
  }

  console.log("\nSeed OK — ready for WhatsApp booking mobile tests.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
