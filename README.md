This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Ensure `.env.local` includes Supabase credentials and WhatsApp settings. For local testing without Meta charges:

```bash
WHATSAPP_MOCK_SEND=true
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
WHATSAPP_WEBHOOK_VERIFY_TOKEN=...
```

## Manual WhatsApp Phase 4A testing (development only)

Use the browser simulator to exercise the **real** webhook and booking state machine — no Meta account, ngrok, or paid WhatsApp API required when mock send is enabled.

### 1. Start the app

```bash
npm run dev
```

Confirm the webhook route exists: `POST /api/whatsapp/webhook`

### 2. Open the simulator

[http://localhost:3000/dev/whatsapp-simulator](http://localhost:3000/dev/whatsapp-simulator)

This page is **disabled in production** (`NODE_ENV=production` returns 404).

### 3. Reset and run the full Plumber flow

1. Click **Reset test customer** (default mobile `919999888877`).
2. Click quick steps **in order** (or type the same text in Custom message):

| Step | Click / type | Expected state |
|------|----------------|----------------|
| 1 | `hi` | `language_selection` |
| 2 | `2` (Marathi) or `1` (English) or `3` (Hindi) | `service_selection`, `phase=ready` |
| 3 | **Plumber** menu number (shown in Service menu panel) | `address_collection` |
| 4 | `Kothrud` | `pincode_collection` |
| 5 | `411038` | `address_collection` (address) |
| 6 | `Flat 12, Sample Society` | `date_selection` |
| 7 | `2` (tomorrow) | `slot_selection` |
| 8 | `3` (12:00–14:00 slot) | `rate_card_confirmation` (requires active Plumber rate card in DB) |
| 9 | `1` (Accept) | `worker_assignment`, `rate_card_accepted=true` |

After each step, check **Step log** and **Current state** for `conversation.state`, `context.phase`, and `service_request_id`.

### 4. Automated tests

```bash
npm run build
npm run test:whatsapp
npm run test:whatsapp:booking
```

### Notes

- Inbound messages go to `/api/whatsapp/webhook` with the same Meta payload shape as production.
- Outbound WhatsApp is not sent when `WHATSAPP_MOCK_SEND=true` (check server logs / DB state only).
- Reset only deletes data for the test mobile — not production customers.
- Worker matching (Phase 4B) is not implemented; accept ends in `worker_assignment`.

## Phase 4B — Worker matching (requires migration 014)

Apply the SQL migration in Supabase **before** running worker accept tests:

```bash
# In Supabase Dashboard → SQL Editor, run:
# supabase/migrations/014_worker_offer_acceptance.sql
```

This adds:
- Partial unique index (one accepted offer per service request)
- `accept_worker_service_offer()` RPC for atomic winner selection + booking creation

After migration:

```bash
npm run test:worker:matching
```

Worker accept URL format: `GET/POST /api/workers/offers/{token}` (token shown in dev simulator only).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
