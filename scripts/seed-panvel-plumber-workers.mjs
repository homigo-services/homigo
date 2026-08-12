/**
 * Dev seed — two eligible Plumber workers for Panvel / 410221 (20:00–22:00 slot tests).
 *
 * Uses POST /api/dev/workers/seed-panvel (same logic as Admin worker import).
 *
 * Usage:
 *   npm run dev   # in another terminal
 *   npm run seed:panvel:plumbers
 *   npm run seed:panvel:plumbers -- http://localhost:3000
 */

const baseUrl = process.argv[2] ?? "http://localhost:3000";

async function main() {
  console.log(`Seeding Panvel Plumber workers via ${baseUrl}/api/dev/workers/seed-panvel\n`);

  let res;
  try {
    res = await fetch(`${baseUrl}/api/dev/workers/seed-panvel`, { method: "POST" });
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

  console.log("Workers:");
  for (const w of json.workers ?? []) {
    console.log(
      `  ${w.key} ${w.created ? "created" : "updated"} — id=${w.id} code=${w.workerCode} mobile=${w.mobile}`,
    );
  }

  const preview = json.matchPreview ?? {};
  console.log(`\nMatch preview (Panvel / 410221 / Plumber): count=${preview.count ?? 0}`);
  if (preview.error) {
    console.log(`  error: ${preview.error}`);
  }
  for (const w of preview.workers ?? []) {
    console.log(`  - ${w.name} (${w.id.slice(0, 8)}…) rank=${w.rank} pincode=${w.pincode ?? "—"}`);
  }

  if ((preview.count ?? 0) < 2) {
    console.error("\nExpected at least 2 matched workers after seed.");
    process.exit(1);
  }

  console.log("\nSeed OK — ready for quote accept → worker matching tests.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
