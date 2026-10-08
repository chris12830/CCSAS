# SAS · Supplier Advertising System

A private, working advertising application for the Plan-It child care application network. Built with React/Vinext and a Cloudflare Worker, with durable D1 storage.

## What works

- Super Admin and supplier portals, with server-side role and record-ownership checks.
- Supplier applications, approvals, suspension, policy-version/text acceptance records, package selection and campaign submissions.
- App-specific country, audience, placement and package rules.
- Three editable packages with independent CAD/USD pricing and optional external checkout links.
- Scheduled campaign eligibility, approval, pause controls, region targeting and fixed-width Canada/USA tickers.
- Verified manual payment records, subscription expiry enforcement and app-level display/click reports.
- Per-application connection keys, authenticated feed and event endpoints, and real connection heartbeats.

## Initial access and examples

New deployments are owner-private and use Sign in with ChatGPT. The first authenticated network owner to open the private Admin portal initializes the network. Do that before changing the sharing audience. Other authenticated users cannot access the Admin data. Suppliers use `/supplier`, and records are bound to their verified identity/email. When the owner opens `/supplier`, it is explicitly labelled a Supplier portal preview.

Seven child care application entries are configured, but no existing website is modified. Example suppliers and campaigns are clearly labelled, are excluded from live feeds, and never generate revenue or activity metrics. Initial package prices are suggestions.

## Payments

SAS does not process card payments or create recurring subscriptions yet. The owner can add checkout links from their chosen provider and record verified receipts. Recording payment activates advertising through its paid-through date. A package change requires a new verified payment. A payment-provider integration and verified webhooks are needed for automatic recurring billing, cancellations, failed-payment handling and refunds.

## Connect a child care app

Generate an app-specific connection key in Connect an app. Store it on the child care app's server, alongside the platform service credential required to call this private SAS. Never place these credentials in client bundles. Query `/api/feed?app=<id>&audience=owner` with `X-SAS-App-Key` and the platform `OAI-Sites-Authorization` header. Optional filters: `country=CA|US`, `placement`, `region`. Child records and private documents must not be sent.

Live feeds enforce supplier approval, paid status and paid-through date, campaign dates/status, package limits, app eligibility, country, audience, region and placement. Full Network packages cover all eligible participating apps, including newly enabled apps. Disable advertising gracefully when SAS requests fail or exceed a short timeout.

Report actual display/click events to `/api/events` with the same server credentials and a body containing a unique UUID `id`, `appId`, `campaignId`, `kind`, `country`, `audience`, `placement`, `region`. Event IDs are deduplicated. Counts represent recorded events, not unique viewers or independently audited advertising delivery. Use a rate-limited server proxy if sending activity from a browser.

## Data and deployment

Schema is in `db/schema.ts`; schema-only migrations are in `drizzle/`. Prepared statements own data access. Network updates use an optimistic version check, and connection heartbeats live separately so ad traffic does not conflict with administrative saves. Policy acceptance retains the actual accepted text and its version.

The Sites workflow synchronizes source and publishes the Cloudflare Worker with D1. Keep `.openai/hosting.json` and append new migrations after publication. Do not replay or edit already applied migration history.

## Verification

- `node scripts/verify-sas.mjs` tests advertising eligibility, record ownership, payment activation, expiry, policy records, and example-data isolation.
- `node node_modules/typescript/bin/tsc --noEmit` checks types.
- Use the managed `sites-preview` workflow for development. Browser WebMCP summary/navigation tools feature-detect support; unsupported browsers retain the normal interface.

## Remaining launch setup

Choose final prices and policy terms, connect participating applications, configure the payment provider and verified subscription webhooks, and configure supplier access before inviting external suppliers. Domain labels in the example network are configuration entries and do not assert ownership or live deployment of those domains.
